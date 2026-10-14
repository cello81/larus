<?php
// Gemeinsame Grundlage für alle api/*.php-Endpunkte (gleiches Muster wie bei
// Abrakadata): Konfiguration, Datenordner, Sitzung, JSON-Helfer, Anmeldeprüfung
// und Sperre bei zu vielen Fehlversuchen.

header('Content-Type: application/json; charset=utf-8');
// Antworten enthalten Familiendaten: nie zwischenspeichern, nicht umdeuten
// lassen, nicht einbetten, keine Herkunftsseite weitergeben.
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');

const SESSION_COOKIE = 'LARUS_SESSID';
const MAX_BODY_BYTES = 1048576; // 1 MB
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60;

function json_out($data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

function json_error(string $message, int $status = 400): never {
    json_out(['error' => $message], $status);
}

// --- Konfiguration -----------------------------------------------------------
// Ohne vollständige config.php startet die API bewusst nicht (sie schützt dann
// lieber, als offen zu sein).
if (!is_file(__DIR__ . '/../config.php')) {
    error_log('larus: api/config.php fehlt (Vorlage: config.example.php)');
    json_error('Konfiguration fehlt', 500);
}
require_once __DIR__ . '/../config.php';

if (!defined('FAMILY_PASSWORD_HASH') || empty(password_get_info((string) FAMILY_PASSWORD_HASH)['algo'])) {
    error_log('larus: FAMILY_PASSWORD_HASH fehlt oder ist kein gültiger Passwort-Hash in api/config.php');
    json_error('Konfiguration unvollständig', 500);
}

// --- Datenordner -------------------------------------------------------------
function data_dir(): string {
    if (!defined('DATA_DIR') || DATA_DIR === '') {
        error_log('larus: DATA_DIR ist in api/config.php nicht gesetzt');
        json_error('Datenspeicher nicht konfiguriert', 500);
    }
    return rtrim((string) DATA_DIR, '/\\');
}

function ensure_dir(string $dir, int $mode = 0770): void {
    if (!is_dir($dir) && !@mkdir($dir, $mode, true) && !is_dir($dir)) {
        error_log("larus: Ordner kann nicht angelegt werden: $dir (Pfad und Schreibrechte prüfen, bei Plesk auch open_basedir)");
        json_error('Datenordner nicht verfügbar', 500);
    }
    if (!is_writable($dir)) {
        error_log("larus: Ordner nicht beschreibbar: $dir");
        json_error('Datenordner nicht beschreibbar', 500);
    }
}

function ensure_data_dir(string $dir): void {
    ensure_dir($dir);
    // Zusätzlicher Schutz, falls der Ordner doch per HTTP erreichbar ist.
    $htaccess = $dir . '/.htaccess';
    if (!file_exists($htaccess)) {
        @file_put_contents($htaccess, "Require all denied\n");
    }
}

// --- Anfragen ----------------------------------------------------------------
// Schutz vor fremden Seiten (CSRF): Anfragen mit Herkunft nur vom eigenen Host.
function require_same_origin(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $ownHost = explode(':', $_SERVER['HTTP_HOST'] ?? '')[0];
    if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== $ownHost) {
        json_error('fremde Herkunft', 403);
    }
}

// Liest einen JSON-Body: nur application/json, höchstens 1 MB.
function json_body(): array {
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($contentType, 'application/json') !== 0) {
        json_error('nur application/json erlaubt', 415);
    }
    $raw = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
    if ($raw === false || strlen($raw) > MAX_BODY_BYTES) {
        json_error('Anfrage zu gross', 413);
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        json_error('ungültiges JSON', 400);
    }
    return $data;
}

// --- Sitzung -----------------------------------------------------------------
function session_days(): int {
    return defined('SESSION_DAYS') ? max(1, (int) SESSION_DAYS) : 90;
}

function start_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $dir = data_dir();
    ensure_data_dir($dir);
    $sessionDir = $dir . '/sessions';
    ensure_dir($sessionDir, 0700);

    $lifetime = session_days() * 86400;
    ini_set('session.gc_maxlifetime', (string) $lifetime);
    ini_set('session.gc_probability', '1');
    ini_set('session.gc_divisor', '100');
    ini_set('session.use_strict_mode', '1');
    session_save_path($sessionDir);
    session_name(SESSION_COOKIE);
    session_set_cookie_params([
        'lifetime' => $lifetime,
        'path' => '/',
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

// Ändert sich der Passwort-Hash in config.php, ändert sich der Stempel, und alle
// bisherigen Anmeldungen werden ungültig (z.B. bei verlorenem Handy).
function auth_stamp(): string {
    return hash('sha256', (string) FAMILY_PASSWORD_HASH);
}

// Bricht mit 401 ab, wenn keine gültige Anmeldung vorliegt. Anfragen ohne
// Sitzungs-Cookie legen keine Sitzungsdatei an.
function require_auth(): void {
    if (!isset($_COOKIE[SESSION_COOKIE])) {
        json_error('Nicht angemeldet.', 401);
    }
    start_session();
    $valid = !empty($_SESSION['auth'])
        && hash_equals(auth_stamp(), (string) ($_SESSION['stamp'] ?? ''));
    if (!$valid) {
        $_SESSION = [];
        session_destroy();
        json_error('Nicht angemeldet.', 401);
    }
    // Sitzung freigeben, damit parallele Anfragen derselben Anmeldung sich nicht blockieren.
    session_write_close();
}

// --- Sperre bei Fehlversuchen -----------------------------------------------
// Datei im Datenordner, pro Absender (als Hash gespeichert) die Zeitpunkte der
// Fehlversuche der letzten 15 Minuten.
function with_attempts(callable $fn) {
    $dir = data_dir();
    ensure_data_dir($dir);
    $fp = fopen($dir . '/login-attempts.json', 'c+');
    if (!$fp) {
        json_error('Datenspeicher nicht beschreibbar', 500);
    }
    flock($fp, LOCK_EX);
    $data = json_decode((string) stream_get_contents($fp), true);
    if (!is_array($data)) {
        $data = [];
    }
    $cutoff = time() - LOGIN_WINDOW_SECONDS;
    foreach ($data as $k => $times) {
        $data[$k] = array_values(array_filter((array) $times, fn($t) => $t >= $cutoff));
        if (!$data[$k]) {
            unset($data[$k]);
        }
    }
    $result = $fn($data);
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($data));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    return $result;
}

function client_key(): string {
    return hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

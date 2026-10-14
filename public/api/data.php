<?php
// Kleines Daten-Backend für die Haushalts-App.
// Speichert alle App-Daten (Mitglieder, Aufgaben, Belohnungen, Verlauf) in data.json.
//
// Ort der Datei: wie bei Abrakadata in einem Ordner AUSSERHALB des Webroots,
// gesetzt über DATA_DIR in api/config.php (siehe config.example.php).

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

const ALLOWED_KEYS = ['members', 'zones', 'tasks', 'rewards', 'log', 'statsResetAt', 'overallResetAt'];
const MAX_BODY_BYTES = 1048576; // 1 MB

function fail(int $code, string $msg): void {
    http_response_code($code);
    echo json_encode(['error' => $msg]);
    exit;
}

// Konfiguration laden. Ohne config.php startet die App bewusst nicht, statt
// die Daten im öffentlichen Ordner anzulegen.
if (!is_file(__DIR__ . '/config.php')) {
    error_log('larus: api/config.php fehlt (Vorlage: config.example.php)');
    fail(500, 'Konfiguration fehlt');
}
require_once __DIR__ . '/config.php';

function data_dir(): string {
    if (!defined('DATA_DIR') || DATA_DIR === '') {
        error_log('larus: DATA_DIR ist in api/config.php nicht gesetzt');
        fail(500, 'Datenspeicher nicht konfiguriert');
    }
    return rtrim((string) DATA_DIR, '/\\');
}

function ensure_data_dir(string $dir): void {
    if (!is_dir($dir) && !@mkdir($dir, 0770, true) && !is_dir($dir)) {
        error_log("larus: Datenordner kann nicht angelegt werden: $dir (Pfad und Schreibrechte prüfen, bei Plesk auch open_basedir)");
        fail(500, 'Datenordner nicht verfügbar');
    }
    if (!is_writable($dir)) {
        error_log("larus: Datenordner nicht beschreibbar: $dir");
        fail(500, 'Datenordner nicht beschreibbar');
    }
    // Zusätzlicher Schutz, falls der Ordner doch per HTTP erreichbar ist.
    $htaccess = $dir . '/.htaccess';
    if (!file_exists($htaccess)) {
        @file_put_contents($htaccess, "Require all denied\n");
    }
}

// Gibt es am neuen Ort noch keine Datei, wohl aber die alte api/data.json,
// wird sie einmalig unverändert kopiert. Die alte Datei bleibt bewusst liegen
// und muss von Hand gelöscht werden, sobald der Betrieb geprüft ist. Schlägt
// die Kopie fehl, bricht das Programm ab, statt eine leere Datei anzulegen.
function migrate_legacy_data(string $newPath): void {
    if (file_exists($newPath)) {
        return;
    }
    $oldPath = __DIR__ . '/data.json';
    if (!is_file($oldPath)) {
        return;
    }
    $contents = file_get_contents($oldPath);
    if ($contents === false) {
        error_log("larus: alte Datendatei nicht lesbar: $oldPath");
        fail(500, 'Datenübernahme fehlgeschlagen');
    }
    json_decode($contents, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        error_log("larus: alte Datendatei ist kein gültiges JSON: $oldPath");
        fail(500, 'Datenübernahme fehlgeschlagen');
    }
    if (file_put_contents($newPath, $contents, LOCK_EX) !== strlen($contents)) {
        @unlink($newPath);
        error_log("larus: Datenübernahme nach $newPath fehlgeschlagen");
        fail(500, 'Datenübernahme fehlgeschlagen');
    }
    @chmod($newPath, 0660);
    error_log("larus: Daten von $oldPath nach $newPath kopiert. Die alte Datei bitte nach einer Prüfung löschen.");
}

$dataDir = data_dir();
ensure_data_dir($dataDir);
$file = $dataDir . '/data.json';
migrate_legacy_data($file);

if (!file_exists($file)) {
    file_put_contents($file, json_encode(new stdClass()));
    @chmod($file, 0660);
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $fp = fopen($file, 'r');
    if (!$fp) fail(500, 'Datenspeicher nicht lesbar');
    flock($fp, LOCK_SH);
    $contents = stream_get_contents($fp);
    flock($fp, LOCK_UN);
    fclose($fp);

    $data = json_decode($contents, true);
    if (!is_array($data)) $data = [];

    echo json_encode($data);
    exit;
}

if ($method === 'POST') {
    // Schutz vor fremden Seiten (CSRF): nur JSON und nur vom eigenen Host.
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($contentType, 'application/json') !== 0) {
        fail(415, 'nur application/json erlaubt');
    }
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $ownHost = explode(':', $_SERVER['HTTP_HOST'] ?? '')[0];
    if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== $ownHost) {
        fail(403, 'fremde Herkunft');
    }

    $raw = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
    if ($raw === false || strlen($raw) > MAX_BODY_BYTES) {
        fail(413, 'Anfrage zu gross');
    }

    $input = json_decode($raw, true);
    if (!is_array($input)) {
        fail(400, 'ungültiges JSON');
    }

    $key = $input['key'] ?? null;
    if (!is_string($key) || !in_array($key, ALLOWED_KEYS, true)) {
        fail(400, 'ungültiger key');
    }

    $fp = fopen($file, 'c+');
    if (!$fp) fail(500, 'Datenspeicher nicht beschreibbar');
    flock($fp, LOCK_EX);
    $contents = stream_get_contents($fp);
    $data = json_decode($contents, true);
    if (!is_array($data)) $data = [];

    $data[$key] = $input['value'] ?? null;

    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($data));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);

    echo json_encode(['ok' => true]);
    exit;
}

fail(405, 'method not allowed');

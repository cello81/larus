<?php
// Kleines Daten-Backend für die Haushalts-App.
// Speichert alle App-Daten (Mitglieder, Aufgaben, Belohnungen, Verlauf) in data.json.
//
// Zugriff nur mit Anmeldung (siehe auth.php). Ort der Datei: wie bei Abrakadata
// in einem Ordner AUSSERHALB des Webroots, gesetzt über DATA_DIR in api/config.php.
require_once __DIR__ . '/lib/bootstrap.php';

const ALLOWED_KEYS = ['members', 'zones', 'tasks', 'rewards', 'log', 'statsResetAt', 'overallResetAt'];

// Als Erstes: ohne gültige Anmeldung geschieht hier nichts (auch keine Datenübernahme).
require_auth();

$dataDir = data_dir();
ensure_data_dir($dataDir);
$file = $dataDir . '/data.json';

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
        json_error('Datenübernahme fehlgeschlagen', 500);
    }
    json_decode($contents, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        error_log("larus: alte Datendatei ist kein gültiges JSON: $oldPath");
        json_error('Datenübernahme fehlgeschlagen', 500);
    }
    if (file_put_contents($newPath, $contents, LOCK_EX) !== strlen($contents)) {
        @unlink($newPath);
        error_log("larus: Datenübernahme nach $newPath fehlgeschlagen");
        json_error('Datenübernahme fehlgeschlagen', 500);
    }
    @chmod($newPath, 0660);
    error_log("larus: Daten von $oldPath nach $newPath kopiert. Die alte Datei bitte nach einer Prüfung löschen.");
}

migrate_legacy_data($file);

if (!file_exists($file)) {
    file_put_contents($file, json_encode(new stdClass()));
    @chmod($file, 0660);
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $fp = fopen($file, 'r');
    if (!$fp) json_error('Datenspeicher nicht lesbar', 500);
    flock($fp, LOCK_SH);
    $contents = stream_get_contents($fp);
    flock($fp, LOCK_UN);
    fclose($fp);

    $data = json_decode($contents, true);
    if (!is_array($data)) $data = [];

    json_out($data);
}

if ($method === 'POST') {
    require_same_origin();
    $input = json_body();

    $key = $input['key'] ?? null;
    if (!is_string($key) || !in_array($key, ALLOWED_KEYS, true)) {
        json_error('ungültiger key', 400);
    }

    $fp = fopen($file, 'c+');
    if (!$fp) json_error('Datenspeicher nicht beschreibbar', 500);
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

    json_out(['ok' => true]);
}

json_error('method not allowed', 405);

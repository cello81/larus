<?php
// Kleines Daten-Backend für die Haushalts-App.
// Speichert alle App-Daten (Mitglieder, Aufgaben, Belohnungen, Verlauf) in data.json.

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: same-origin');

$file = __DIR__ . '/data.json';

if (!file_exists($file)) {
    file_put_contents($file, json_encode(new stdClass()));
    chmod($file, 0664);
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $fp = fopen($file, 'r');
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
    $input = json_decode(file_get_contents('php://input'), true);
    $key = $input['key'] ?? null;

    if (!$key || !preg_match('/^[a-zA-Z0-9_]+$/', $key)) {
        http_response_code(400);
        echo json_encode(['error' => 'ungültiger key']);
        exit;
    }

    $fp = fopen($file, 'c+');
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

http_response_code(405);
echo json_encode(['error' => 'method not allowed']);

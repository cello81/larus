<?php
// Endpunkte: POST ?action=login, POST ?action=logout, GET ?action=me
// Anmeldung mit dem Familienpasswort (Hash: FAMILY_PASSWORD_HASH in config.php).
require_once __DIR__ . '/lib/bootstrap.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST' && $action === 'login') {
    require_same_origin();
    $body = json_body();
    $key = client_key();

    // Sperre gegen Durchprobieren, wie bei Abrakadata: 10 Fehlversuche in 15 Minuten.
    $attempts = with_attempts(fn(array &$d) => count($d[$key] ?? []));
    if ($attempts >= LOGIN_MAX_ATTEMPTS) {
        json_error('Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.', 429);
    }

    $password = $body['password'] ?? '';
    if (!is_string($password) || $password === '' || strlen($password) > 200) {
        json_error('Passwort erforderlich.');
    }

    if (!password_verify($password, (string) FAMILY_PASSWORD_HASH)) {
        with_attempts(function (array &$d) use ($key) {
            $d[$key][] = time();
        });
        json_error('Passwort falsch.', 401);
    }

    start_session();
    session_regenerate_id(true);
    $_SESSION['auth'] = true;
    $_SESSION['stamp'] = auth_stamp();
    with_attempts(function (array &$d) use ($key) {
        unset($d[$key]);
    });
    json_out(['ok' => true]);
}

if ($method === 'POST' && $action === 'logout') {
    require_same_origin();
    if (isset($_COOKIE[SESSION_COOKIE])) {
        start_session();
        $_SESSION = [];
        session_destroy();
    }
    json_out(['ok' => true]);
}

if ($method === 'GET' && $action === 'me') {
    require_auth();
    json_out(['ok' => true]);
}

json_error('Unbekannte Aktion.', 404);

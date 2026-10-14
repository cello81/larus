# Larus

Familien-App zur Verwaltung von Haushaltsaufgaben, Punkten und
Belohnungen. Läuft als PWA.

## Lokal entwickeln

```
npm install
npm run dev
```

Öffnet einen lokalen Server mit Live-Reload. Die App-Logik liegt in
`src/App.jsx`.

Hinweis: Lokal funktioniert das Speichern der Daten nicht, weil das
PHP-Backend (`public/api/data.php`) einen echten PHP-fähigen Server
braucht. Zum Testen mit echtem Speichern reicht `php -S
localhost:8000 -t dist` nach einem `npm run build`.

## Deployment (automatisch)

Bei jedem Push auf `main` baut eine GitHub Action die App und
veröffentlicht das Ergebnis auf dem Branch `deploy`. Plesk ist so
eingerichtet, dass es diesen Branch automatisch abholt und auf
`haushalt.marcini.ch` veröffentlicht (Webhook).

Ändern -> committen -> pushen -> nach ca. 1 Minute live. Kein
manuelles Bauen oder Hochladen mehr nötig.

## Wichtig

- Die Live-Daten der Familie (`data.json`, enthält auch die PINs)
  liegen AUSSERHALB des Webroots, im Ordner `DATA_DIR` (gleiches
  Muster wie bei Abrakadata). Sie werden nie versioniert (siehe
  `.gitignore`) und von einem Deployment nicht überschrieben.
- `public/api/config.php` gibt es nur auf dem Server und nie im Git.
  Vorlage: `public/api/config.example.php`. Dort `DATA_DIR` auf einen
  Ordner ausserhalb des Webroots setzen, z.B.
  `/var/www/vhosts/marcini.ch/larus-data`. Ohne `config.php` startet das
  Backend bewusst nicht.
- Beim ersten Aufruf nach der Umstellung kopiert `data.php` eine noch
  vorhandene `api/data.json` einmalig an den neuen Ort. Die alte Datei
  danach von Hand löschen.
- `public/api/data.php` ist das kleine Backend, das die Daten
  speichert. Bei Änderungen daran: vorsichtig testen, das ist die
  einzige serverseitige Logik.

## Anmeldung

Die App und die Daten sind durch ein Familienpasswort geschützt, das der
Server prüft (gleiches Muster wie bei Abrakadata, ohne Plesk-Passwortschutz):

- `api/auth.php` meldet an (`login`), ab (`logout`) und prüft (`me`).
  Die Sitzung liegt als Cookie auf dem Gerät und gilt standardmässig 400 Tage
  ab der letzten Nutzung (`SESSION_DAYS` in `config.php`). Browser erlauben
  keine längere Laufzeit; bei regelmässiger Nutzung wird sie bei jeder
  Anfrage erneuert und läuft nie ab.
- `api/data.php` antwortet ohne gültige Anmeldung nur mit `401`.
- Nach 10 falschen Eingaben von derselben Adresse ist die Anmeldung
  15 Minuten gesperrt.
- Der Hash des Passworts steht als `FAMILY_PASSWORD_HASH` in `api/config.php`
  (nur auf dem Server). Erzeugen mit
  `php -r "echo password_hash('NEUES-PASSWORT', PASSWORD_DEFAULT);"`.
  Wird der Hash geändert, sind alle Geräte abgemeldet (z.B. bei einem
  verlorenen Handy).
- Die persönlichen 4-stelligen Codes der Mitglieder bleiben eine reine
  Bequemlichkeit innerhalb der Familie und ersetzen kein Passwort.
- Fehlt `config.php` oder der Hash, startet die API bewusst nicht (`500`),
  statt offen zu sein.

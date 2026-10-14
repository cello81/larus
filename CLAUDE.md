# Larus

Familien-PWA für Haushaltsaufgaben, Punkte, Belohnungen und Sackgeld. Läuft auf
Metanet/Plesk unter `larus.marcini.ch`, auf demselben Server wie Abrakadata.

## Stack

- Frontend: React 19 + Vite + `vite-plugin-pwa`. Die ganze App liegt in `src/App.jsx`.
- Backend: kleines PHP ohne Framework in `public/api/` (wird beim Build nach `dist/api/` kopiert).
- Befehle: `npm ci`, `npm run dev`, `npm run build`, `npm run lint` (oxlint).

## Deployment (jeder Push auf `main` geht live)

Push auf `main` → GitHub Action baut (`npm ci`, `npm run build`) → schreibt `dist/` auf den
Branch `deploy` → Plesk zieht ihn per Git. Deshalb: erst lokal bauen und testen, dann pushen.
`dist/` ist nicht im Git. Actions sind per Commit-Hash festgeschrieben, Dependabot schlägt
Updates vor.

Die `public/.htaccess` (Security-Header, CSP) überschreibt beim Deployment eine eigene
`.htaccess` im Webroot.

## Backend und Anmeldung

- `api/auth.php`: `login`, `logout`, `me` mit einem Familienpasswort. Sitzung auf dem Server
  (400 Tage ab der letzten Nutzung), Sperre nach 10 Fehlversuchen in 15 Minuten.
- `api/data.php`: liest und schreibt die Daten, nur mit Anmeldung (sonst `401`). Schreiben nur
  für die Keys in `ALLOWED_KEYS`. **Kommt in `src/App.jsx` ein neuer `persist("…")`-Key dazu,
  muss er auch in `ALLOWED_KEYS` stehen**, sonst antwortet der Server mit `400`.
- `api/lib/bootstrap.php`: Konfiguration, Sitzung, Prüfung der Herkunft, JSON-Helfer.
- `api/config.php` gibt es nur auf dem Server (Vorlage `config.example.php`). Darin stehen
  `DATA_DIR` (Ordner ausserhalb des Webroots, hier liegen `data.json`, Sitzungen und die Liste
  der Fehlversuche) und `FAMILY_PASSWORD_HASH`. Fehlt etwas davon, antwortet die API mit `500`,
  statt offen zu sein. Ändert sich der Hash, sind alle Geräte abgemeldet.
- Nie committen: `config.php`, `data.json`, Passwörter, Hashes (siehe `.gitignore`). Das
  Repository ist öffentlich.
- Die 4-stelligen Codes der Mitglieder sind nur eine Bequemlichkeit in der Familie. Sie liegen
  im Klartext in den Daten und werden im Browser geprüft, nicht auf dem Server.

## Lokal testen (mit Backend)

`public/api/` in ein Testverzeichnis kopieren, dort eine `config.php` mit eigenem `DATA_DIR`
und einem Hash aus `php -r "echo password_hash('test', PASSWORD_DEFAULT);"` anlegen und mit
`php -S 127.0.0.1:8000 -t <Testverzeichnis>` starten. Die gebaute App (`dist/`) dazukopieren
für einen Test im Browser. `npm run dev` allein hat kein Backend.

## App-Regeln

- Texte in der Oberfläche auf Deutsch mit Schweizer Rechtschreibung (`ss` statt `ß`).
- Die Dringlichkeit von Aufgaben richtet sich nach den tatsächlich überfälligen Tagen, nicht nach
  einem auf die Häufigkeit normierten Verhältnis.
- Die App darf bei einem Ladefehler nie Standardwerte über die echten Daten speichern: Ladefehler
  zeigen einen Fehlerbildschirm (`LoadErrorScreen`), `401` zeigt die Anmeldung.
- CSP: Skripte nur von der eigenen Domain, keine Inline-Skripte. Inline-Styles sind erlaubt.
- Der Editor im GitHub-Webbrowser ist für komplette Neufassungen von JSX-Dateien unzuverlässig
  (automatisch geschlossene Tags). Dateien lieber komplett kopieren oder lokal bearbeiten.

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

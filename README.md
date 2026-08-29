# Larus

Familien-App zur Verwaltung von Haushaltsaufgaben, Punkten und
Belohnungen. Läuft als PWA auf `larus.marcini.ch`.

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

- `public/api/data.json` wird bewusst NICHT versioniert (siehe
  `.gitignore`). Es enthält die echten Live-Daten der Familie und
  wird vom Server selbst angelegt/gepflegt. Ein Deployment
  überschreibt es nicht.
- `public/api/data.php` ist das kleine Backend, das die Daten
  speichert. Bei Änderungen daran: vorsichtig testen, das ist die
  einzige serverseitige Logik.

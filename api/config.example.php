<?php
// Kopieren nach config.php und NUR auf dem Server ablegen (diese Datei nie committen!).
// config.php ist per .gitignore ausgeschlossen und wird nicht ausgeliefert.

// Ordner der Datendatei (absoluter Pfad, ohne Slash am Ende). Er muss
// AUSSERHALB des Webroots liegen, also nicht darin: gleiches Muster wie bei
// Abrakadata, z.B. ein Ordner neben dem Webroot:
// '/var/www/vhosts/marcini.ch/larus-data'
// Der Ordner wird beim ersten Aufruf angelegt, falls PHP dort schreiben darf
// (bei Plesk: open_basedir beachten). Gibt es dort noch keine Datei, wohl aber
// die alte api/data.json, wird sie einmalig dorthin kopiert. Die alte Datei
// bleibt liegen und muss nach einer Prüfung von Hand gelöscht werden.
define('DATA_DIR', '');

# kmbhelp-test

Fassung **0.1.0**. Der vollständige Nachweis steht in [docs/nachweis.md](docs/nachweis.md). Die Nummernfolge und die Regel „jede Änderung erhöht die Patchnummer“ stehen in [CHANGELOG.md](CHANGELOG.md).

Entwicklungsprüfung gegen den laufenden Helpdesk. Das ist keine Produktphase. `docs/status.md` bleibt unberührt, und die App ändert das Verhalten von KMBHelp nicht.

Kurzname in der Oberfläche: **kmbhelp**. Der öffentliche Host ist `https://kmbhelp.kmbcloud.at`. `kmhhelp` ist kein Host. Der LAN-Host `http://192.168.36.55` wird nur verwendet, wenn er dieselbe App ist. Die Zertifikatsprüfung bleibt am öffentlichen Host.

Die App bindet nur `127.0.0.1` und startet nicht, wenn `NODE_ENV=production` ist. Nicht veröffentlichen.

## Start

Im Ordner `apps/kmbhelp-test`:

```bash
pnpm install
pnpm dev
```

Oberfläche: `http://127.0.0.1:4317`

`pnpm test` und `pnpm typecheck` prüfen die lokale Logik, ohne ein Passwort zu erfinden.

## Zugangsdatei

Benutzername und Passwort stehen nicht im Repository. Beim Start fragt die Oberfläche danach, wenn die Datei fehlt. Der lokale Prüfdienst schreibt sie nach:

`~/.config/kmbhelp-test/credentials`

Modus `0600`, Verzeichnis `0700`. Ein Pfad innerhalb des Git-Checkouts wird abgelehnt. `.secrets/` und `.run/` sind zusätzlich ignoriert, falls jemand einen Pfad dorthin legt.

Warum diese Variante: Die Produktgeheimnisse liegen laut `ENTWICKLUNGSUMGEBUNG.md` in `/etc/kmbhelp/api.env`, Modus `0600`, außerhalb von Git. Diese Dev-App schreibt nicht in diese Produktdatei, weil dort andere Geheimnisse stehen und sie auf einem Arbeitsplatz fehlt. Eine eigene Datei im Benutzerverzeichnis übernimmt dasselbe Muster ohne Root und ohne Vermischung. Das Passwort geht nur als JSON an `127.0.0.1`, wird nicht zurückgegeben, nicht geloggt und nicht committet. Fehlt die Datei, schlägt die Anmeldung mit einem klaren Text fehl. Es wird kein Passwort erfunden.

Der Lauf des Prüfplans liegt in `apps/kmbhelp-test/.run/plan-run.json` (Modus `0600`, nicht im Git). Die leere Vorlage ist `plan/template.json`.

## Sprache

Reihenfolge, das erste veränderte Signal gilt:

1. `document.documentElement.lang`
2. Attribut `data-lang`
3. Sichtbare Beschriftungen (`Anmeldung`/`Sign in`, `Anleitungen`/`Guides`, `Suche`/`Search`)

`localStorage` `kmbhelp_lang` wird nur mitgelesen. Ein Treffer zählt erst, wenn sich die Oberfläche ändert.

## Hell/Dunkel

Nach dem Klick müssen sich die berechneten Farben ändern: `getComputedStyle` auf `body`, bei transparentem Hintergrund auf `documentElement`. Mitgeschrieben werden `data-theme` und die Klasse. `prefers-color-scheme` ist nur der Umgebungshinweis und kein Nachweis, dass der Umschalter wirkt. `localStorage` `kmbhelp_theme` wird mitgelesen.

Die eigene Darstellung dieser App nutzt `data-theme` und andere Schlüssel (`kmbhelp_test_lang`, `kmbhelp_test_theme`), damit sie die Schlüssel der Helpdesk-App nicht ersetzt.

## PDF

Die Schaltfläche **Als PDF** öffnet den Druckdialog des Browsers. `@media print` setzt eine helle, ruhige Seite.

## Live-Stand am 11. November 2026

Von dieser Umgebung aus: das Zertifikat von `kmbhelp.kmbcloud.at` ist zeitlich gültig, der Name passt nicht (`CN=wmd.at`). Die öffentliche Antwort auf `/` ist HTTP 404 `text/plain`. `/health` ist HTTP 200 ohne Inhalt. `192.168.36.55` ist hier nicht erreichbar. Ohne Zugangsdatei gibt es keine angemeldete Seitenliste und keine erfundenen Seiten.

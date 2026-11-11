# kmbhelp-test — Nachweis

Version 0.1.0, 11. November 2026 (Europe/Vienna).

Dieser Text ist die nachvollziehbare Fassung der Dev-App. Er beschreibt, was gebaut wurde, wie jede Prüfung entscheidet, was am 11. November 2026 gegen den laufenden Host beobachtet wurde, und wie die Fassung versioniert wird. Keine Zugangsdaten, keine Mandantendaten.

Die kurze Bedienung steht in `../README.md`. Die Nummernfolge steht in `../CHANGELOG.md`. Die Nummer selbst steht in `../VERSION`, `../package.json` und `../src/version.ts`.

## 1. Zweck

`kmbhelp-test` ist eine lokale Ergebnis-Seite. Sie prüft den laufenden Helpdesk und zeigt pro Prüfung eine Zeile: Knopf, Status, Name, bei Fehler die Begründung.

Kurzname in der Oberfläche: **kmbhelp**.  
Öffentlicher Host: `https://kmbhelp.kmbcloud.at`.  
Die Zeichenfolge `kmhhelp` ist kein Host. Sie kam einmal als Tippfehler vor und wird nicht abgefragt.

LAN-Host: `http://192.168.36.55`. Er wird nur herangezogen, wenn er dieselbe App ist. Die Zertifikatsprüfung bleibt am öffentlichen Host.

## 2. Abgrenzung

Die offene Produktphase in `docs/status.md` ist Phase 0 und bleibt offen. Diese App setzt sie nicht um.

Unverändert bleiben das Produktverhalten, `docs/status.md`, das Monorepo der Produktphase und die Dienste, die `docs/stack-entscheidung.md` ablehnt. Es gibt kein Next.js, kein Prisma, keine zweite Datenbank, keinen Message-Bus. Die App ist ein eigenes Paket unter `apps/kmbhelp-test` mit eigenem `package.json` und eigenem Lockfile. Zod liegt direkt in diesem Paket, nicht in `packages/shared`, weil dieses Paket zur Produktphase gehört.

Sprache der Oberfläche: Deutsch, mit englischer Umschaltung. Code auf Englisch. Diese Dokumentation auf Deutsch. Keine Emoji. Statuszeichen sind SVG: grüner Haken, rotes Kreuz. Layout bis 390px Breite.

Die App bindet nur `127.0.0.1` und beendet sich, wenn `NODE_ENV=production` ist. Sie wird nicht als öffentliche Web-App veröffentlicht.

## 3. Versionierung

Format: `0.1.PATCH`.

| Regel | Bedeutung |
|---|---|
| Erste Fassung | `0.1.0` |
| Jede inhaltliche Änderung | nur die Patchnummer steigt: `0.1.1`, `0.1.2`, … |
| Dieselbe Nummer | `VERSION`, `package.json` (`version`), `src/version.ts` (`APP_VERSION`) |
| Nachweis | Kopf dieses Dokuments und der passende Abschnitt in `CHANGELOG.md` |
| Git | ein Commit pro solcher Änderung, Push nach GitHub, Tag `v0.1.PATCH` |

Ein Test (`test/version.test.ts`) bricht ab, wenn `VERSION`, `package.json` und `src/version.ts` auseinanderlaufen oder der Changelog die Nummer nicht nennt.

Die Oberfläche zeigt `Version 0.1.0` unter der Überschrift. Dieselbe Zeile steht im Druck.

Tag `v0.1.0` zeigt auf den Baum, der diesen Nachweis enthält. Die Umsetzung der App davor ist Commit `a0e5ed8` auf dem Branch `cursor/kmbhelp-test-app-e6df`. Pull Request: `https://github.com/WPreier/KMBHelp/pull/6`.

## 4. Start

Voraussetzung: Node.js 22, pnpm, Google Chrome unter `/usr/bin/google-chrome` für die Browserprüfungen.

```bash
cd apps/kmbhelp-test
pnpm install
pnpm dev
```

Oberfläche: `http://127.0.0.1:4317`

```bash
pnpm test
pnpm typecheck
```

Der Dev-Server ist Vite im Middleware-Modus plus die Prüf-API auf demselben Port. API-Aufrufe verlangen den Host `127.0.0.1` oder `localhost` und bei Schreibaufrufen `Content-Type: application/json`. Antworten tragen `Cache-Control: no-store`.

## 5. Ergebnis-Seite

Reihenfolge von oben nach unten:

1. Kopf mit Fassung, Kurztext, Sprache, Hell/Dunkel der Prüf-App, Knopf **Als PDF**.
2. Formular für die Zugangsdaten, wenn sie fehlen. Liegen sie schon, steht dort, dass sie lokal gespeichert sind. Das Passwort wird nie angezeigt.
3. Sechs Zeilen, in dieser Reihenfolge: Zertifikat, Externe Links, Suche, Anmeldung, Sprache, Hell/Dunkel.
4. Abschnitt **Alle Tests** mit dem Knopf **Alle Tests ausführen**. Er führt nur die sechs Zeilen aus, der Reihe nach.
5. Abschnitt **Angemeldete Prüfung**. Der Knopf ist deaktiviert, solange keine Zugangsdatei liegt.

Jede Prüfzeile:

| Spalte | Inhalt |
|---|---|
| Knopf **T** | Sichtbarer Name `T`. Barrierefreie Beschreibung `diesen Test jetzt durchführen` (auf Englisch `run this test now`). |
| Status | Leer bis zum Lauf. Danach grüner Haken oder rotes Kreuz, als SVG, nicht als Emoji. Während des Laufs ein SVG-Ring. |
| Name | Deutsch oder Englisch, je nach Umschaltung der Prüf-App. |
| Zeile darunter | Nur bei Fehler die Begründung. Ohne Fehler ist diese Zeile nicht im Dokument. Bei Bestand kann eine sachliche Ergebniszeile stehen, zum Beispiel was gesucht wurde. |

Die eigene Sprache der Prüf-App liegt unter `kmbhelp_test_lang`, die eigene Darstellung unter `kmbhelp_test_theme`. Das sind nicht die Schlüssel der Helpdesk-App.

## 6. Zugangsdaten

Benutzername und Passwort stehen nicht im Repository und werden nicht erfunden.

Beim Start fragt die Oberfläche, wenn die Datei fehlt. Der Dienst schreibt:

`~/.config/kmbhelp-test/credentials`

Modus der Datei `0600`, Modus des Verzeichnisses `0700`. `chmod` wird nach dem Schreiben gesetzt, damit die umask die Rechte nicht aufweitet. Stimmt der Modus danach nicht, bricht das Speichern ab.

Ein Pfad innerhalb des Git-Checkouts wird abgelehnt. Zusätzlich sind `apps/kmbhelp-test/.secrets/` und `apps/kmbhelp-test/.run/` ignoriert, falls jemand einen Pfad dorthin legt.

Warum diese Variante: `ENTWICKLUNGSUMGEBUNG.md` legt Produktgeheimnisse nach `/etc/kmbhelp/api.env`, Modus 0600, außerhalb von Git. Diese Dev-App schreibt nicht in diese Datei. Dort liegen andere Geheimnisse, und auf einem Arbeitsplatz ist sie oft nicht vorhanden. Eine eigene Datei im Benutzerverzeichnis übernimmt dasselbe Muster ohne Root und ohne Vermischung.

Das Passwort geht nur als JSON-POST an `127.0.0.1`. Die Antwort nennt nur, ob eine Datei liegt, den Pfad und den Modus. Das Passwort kommt nicht zurück, steht nicht in Logs und nicht in Commits. Fehlermeldungen aus dem Browserlauf werden um Werte ab vier Zeichen gekürzt, wenn sie das Passwort oder den Benutzernamen enthalten. Auszüge aus der Zielseite ersetzen E-Mail-Adressen und Ziffernfolgen ab sechs Stellen.

Fehlt die Datei, endet die Zeile Anmeldung mit dem Text, dass die lokale Zugangsdatei fehlt und kein Passwort erfunden wird. Die angemeldete Prüfung startet dann nicht.

Der Lauf des Prüfplans liegt in `apps/kmbhelp-test/.run/plan-run.json`, Modus 0600, nicht im Git. Die committete Vorlage ist `plan/template.json` und enthält keine Seiten.

## 7. Hosts

| Name | Adresse | Verwendung |
|---|---|---|
| Öffentlich | `https://kmbhelp.kmbcloud.at` | Alle Prüfungen. Zertifikat nur hier. |
| LAN | `http://192.168.36.55` | Nur wenn `/health` wie der öffentliche Host antwortet. Sonst ein Satz im Bericht der Link-Zeile. |

Am 11. November 2026, geprüft von der Entwicklungsumgebung:

| Abruf | Ergebnis |
|---|---|
| DNS `kmbhelp.kmbcloud.at` | `185.44.54.99` |
| TLS | Let's Encrypt, `CN=wmd.at`, SAN `DNS:*.wmd.at`, `DNS:wmd.at`, gültig 2026-11-08 18:11:49 GMT bis 2027-02-06 18:11:48 GMT |
| Hostname | passt nicht zu `kmbhelp.kmbcloud.at` |
| `GET /` bei ignoriertem Namensfehler | HTTP 404, `text/plain`, Körper `404 page not found` |
| `GET /health` | HTTP 200, leerer Körper |
| `http://192.168.36.55` | von dieser Umgebung nicht erreichbar |

Browserprüfungen öffnen die Seite mit `ignoreHTTPSErrors`, damit ein Namensfehler der Zertifikatszeile die Oberfläche nicht verdeckt. Die Zeile Zertifikat prüft TLS getrennt.

## 8. Die sechs Prüfungen

### 8.1 Zertifikat

Verbindung mit Node `tls.connect` nach `kmbhelp.kmbcloud.at:443`, Servername derselbe Host. Das Zertifikat wird auch gelesen, wenn die Prüfung es ablehnt, damit die Begründung den Grund nennen kann.

Bestand, wenn alle drei Punkte gelten:

- `now` liegt zwischen `notBefore` und `notAfter`
- `tls.checkServerIdentity` meldet keinen Fehler
- die Autorisierungskette ist vertrauenswürdig, soweit Node sie getrennt vom Hostnamen meldet

Sonst rotes Kreuz. Die Begründung nennt Ablauf, Hostname oder Kette, je nachdem was fehlt. Bei gültigem Datum und falschem Namen steht das Zeitfenster mit in dem Satz, damit Ablauf und Name auseinanderzuhalten sind.

Beobachtung 11. November 2026: rot. Zeitlich gültig von 2026-11-08 bis 2027-02-06. Erwartet `kmbhelp.kmbcloud.at`. Ausgestellt für `CN=wmd.at`, SAN `*.wmd.at`, `wmd.at`.

### 8.2 Externe Links

Eine Zeile, Name **Externe Links**.

Ablauf:

1. `GET` der öffentlichen Origin mit normaler TLS-Prüfung.
2. Schlägt das am Zertifikatsnamen fehl, wird die Seite ein zweites Mal ohne Namensprüfung gelesen. Die Zertifikatszeile bleibt dafür zuständig. Der Bericht sagt das.
3. Ist die Antwort HTML, werden bis zu 15 Seiten derselben Origin gelesen und bis zu 30 externe `http`- und `https`-Links gesammelt. `mailto`, `tel`, `javascript` und Anker werden übersprungen.
4. Jeder externe Link wird mit normaler TLS-Prüfung abgerufen. Bestand eines Links: HTTP 200 bis 299 nach Weiterleitungen.
5. Parallel ein kurzer Blick auf `http://192.168.36.55/health`.

Bestand, wenn die Seite gelesen werden konnte und kein externer Link fehlschlägt. Null externe Links sind dann kein Fehler. Die Ergebniszeile nennt HTTP-Status, Inhaltstyp und die Anzahl.

Fehler, wenn die Seite nicht gelesen werden konnte oder mindestens ein externer Link fehlschlägt. Die Begründung listet die defekten Links, höchstens zwanzig, jeder mit URL und Grund.

Beobachtung 11. November 2026: grün. HTTP 404, `text/plain; charset=utf-8`, 0 externe Links. Abruf ohne Namensprüfung wegen des Zertifikats. LAN-Host nicht erreichbar. Die Zeile ist grün, weil kein defekter Link vorlag, nicht weil eine Helpdesk-Seite mit funktionierenden Links gefunden wurde. Das steht in der Ergebniszeile.

### 8.3 Suche

Headless Chrome öffnet den öffentlichen Host. Gesucht wird ein Suchfeld im Kopf: `input[type=search]`, `role=search`, Platzhalter oder Beschriftung Suche/Search.

Ein Suchbegriff wird nur aus sichtbarem Inhalt genommen, aus einer Region mit Anleitungen, Guides oder Tickets. Es wird kein Begriff erfunden. Danach Enter. Bestand, wenn der Begriff in der Antwort sichtbar ist. Die Zeile nennt Begriff und Auszug.

Beobachtung 11. November 2026: rot. Kein Suchfeld. Sichtbarer Text: `404 page not found`. Adresse `https://kmbhelp.kmbcloud.at/`. Es wurde nichts gesucht.

### 8.4 Anmeldung

Ohne Zugangsdatei: rot, mit dem Satz, dass die Datei fehlt und kein Passwort erfunden wird. Chrome startet dann nicht.

Mit Datei: Knopf oder Link **Anmeldung**, **Anmelden** oder **Sign in**, danach Benutzerfeld und Passwortfeld, dann Absenden. Bestand, wenn ein Abmelden sichtbar ist oder das Passwortfeld verschwindet und keine Fehlermeldung steht. Das Passwort wird nicht in das Ergebnis geschrieben.

Beobachtung 11. November 2026: rot, weil keine Zugangsdatei lag. Es wurde kein Passwort eingesetzt.

### 8.5 Sprache

Nach dem Umschalten muss sich die Oberfläche ändern. Gewertet wird das erste Signal, das sich ändert:

1. `document.documentElement.lang`
2. Attribut `data-lang` am Dokument
3. Sichtbare Beschriftungen: `Anmeldung`/`Sign in`, `Anleitungen`/`Guides`, `Suche`/`Search`

`localStorage` `kmbhelp_lang` wird nur mitgelesen. Ein Wechsel nur dort, ohne sichtbare Änderung, ist kein Bestand.

Der Umschalter wird als Knopf oder Link `DE`/`EN`, `Deutsch`/`English` gesucht, ersatzweise über einen Knopf Sprache/Language.

Beobachtung 11. November 2026: rot. Kein Umschalter. `html lang` und `data-lang` leer, sichtbare Beschriftung `none`. Gewertetes Verfahren deshalb `visible-labels`. Seite weiter `404 page not found`.

### 8.6 Hell/Dunkel

Nach dem Klick muss sich die berechnete Hintergrundfarbe ändern: `getComputedStyle(document.body).backgroundColor`, bei `transparent` oder `rgba(0, 0, 0, 0)` die Farbe von `documentElement`.

Mitgeschrieben werden `data-theme` und die Klasse am Dokument. `prefers-color-scheme` wird gelesen und im Text genannt. Sie ist nur der Umgebungshinweis und kein Nachweis, dass der Umschalter wirkt. `localStorage` `kmbhelp_theme` wird mitgelesen.

Ändert sich nur das Attribut und nicht die berechnete Farbe, ist die Zeile rot. Ändert sich die Farbe, ist sie grün, auch wenn kein `data-theme` gesetzt war. Das Verfahren steht im Text.

Beobachtung 11. November 2026: rot. Kein Umschalter. Berechneter Hintergrund `rgba(0, 0, 0, 0)` vor und nach dem nicht vorhandenen Klick. `prefers-color-scheme` war `light`.

## 9. Alle Tests und PDF

**Alle Tests ausführen** startet die sechs Zeilen nacheinander. Die angemeldete Prüfung hängt nicht daran.

**Als PDF** ruft `window.print()` auf. `@media print` setzt eine helle Seite, blendet das Zugangsformular und die Werkzeugleiste aus und lässt Namen, Status und Begründungen stehen. Im Druckdialog des Browsers ist das Ziel „Als PDF speichern“. Am 11. November 2026 öffnete Chrome diesen Dialog mit dem Ziel Save as PDF. Ein headlesser Lauf schrieb zusätzlich eine Datei, deren Kopf `%PDF-` ist.

## 10. Angemeldete Prüfung

Erst wenn die Zugangsdatei liegt. Sonst bleibt der Knopf aus, und der Text sagt, dass die Seitenliste auf Zugangsdaten wartet. Es wird keine Seite erfunden.

Wenn die Datei liegt und die Anmeldung gelingt:

1. Dieselbe Anmeldung wie in Abschnitt 8.4.
2. Links derselben Origin, ohne Abmelden, höchstens 15 Seiten.
3. Pro Seite die beobachtete Überschrift als Zweck. Lange Titel, E-Mail-Adressen, lange Ziffernfolgen und Einzeldatensätze (UUID oder lange Zahl im Pfad) werden nicht als Zweck übernommen. Der Satz lautet dann, dass der Zweck aus der Überschrift nicht übernommen wurde. Es wird nichts aus der Produktspezifikation ergänzt.
4. Pro Seite zwei Fälle, je eine Ergebniszeile: gültige und ungültige Eingabe.
5. Hat die Seite Felder, sind die gültigen Werte ersatzweise `Beispiel`, `dev-kmbhelp-test@example.com`, `https://example.com` und für Passwortfelder `Beispiel-nur-test`. Das echte Passwort wird in keine anderen Felder geschrieben. Die ungültige Eingabe ist leer oder formatfalsch (`kein-email`, `abc`).
6. Hat die Seite keine Felder, öffnet der gültige Fall die Seite, der ungültige Fall denselben Pfad plus `/kmbhelp-test-invalid`.
7. Der Lauf ist abgeschlossen, wenn jede Fallzeile bestanden hat. Vorher sagt die Seite, dass das noch nicht gilt.

Gespeichert wird:

| Ort | Inhalt | Im Git |
|---|---|---|
| `plan/template.json` | Schema, leere `pages` und `cases`, Status `waiting_for_credentials` | ja |
| `.run/plan-run.json` | letzter Lauf, Modus 0600 | nein |
| `/cursor/stores/self/docs/kmbhelp-testplan.md` | derselbe Plan als Markdown, wenn der Store existiert | nein, liegt außerhalb des Repos |

Stand 0.1.0: keine beobachteten Seiten, keine Fälle. Die Seitenliste wartet auf Zugangsdaten.

## 11. Was geprüft wurde

Am 11. November 2026, Europe/Vienna:

- `pnpm typecheck` ohne Fehler.
- `pnpm test`: 18 Tests, darunter Zertifikat (gültiges Fenster besteht, falscher Name fällt, abgelaufenes Zertifikat fällt), Links (keine Links bestehen, defekte Links werden aufgezählt), Plan (Vorlage leer, Fälle nur aus beobachteten Seiten), Zugangsdatei (Modus 0600, Pfad im Checkout wird abgelehnt), Schwärzung.
- Browser der Ergebnis-Seite bei 390×844 und 1280×800: leere Zeilen, rotes Kreuz mit Begründungszeile, grüner Haken mit Ergebniszeile, Knopf Alle Tests, Knopf Als PDF, kein horizontaler Überlauf.
- Bildschirmlauf: Zertifikat rot mit Begründung, Externe Links grün mit Bericht, Alle Tests sichtbar, Als PDF öffnet den Druckdialog. In die Felder Benutzername und Passwort wurde nichts geschrieben.

## 12. Dateien dieser Fassung

| Pfad | Rolle |
|---|---|
| `VERSION` | Nummer `0.1.0` |
| `CHANGELOG.md` | Nummernfolge und Bump-Regel |
| `docs/nachweis.md` | dieser Text |
| `README.md` | Start und Kurzfassung |
| `src/` | Ergebnis-Seite |
| `server/` | Prüfungen, Zugangsdatei, Plan |
| `plan/template.json` | leere Planvorlage |
| `test/` | lokale Tests ohne echtes Passwort |

# Entwicklungsumgebung — GitHub, Grok, Cursor

Zielrechner der Entwicklung: ein Arbeitsplatz der IT, nicht der Produktivserver. Produktion ist ein Linux-Rechner mit dem Namen `helpdesk.kmbcloud.at`. Bauen und Review passieren in Cursor. Grok ist das Modell. GitHub ist die einzige Quelle des Codes.

## 1. Werkzeuge auf dem Arbeitsplatz

| Werkzeug | Version | Wozu |
|---|---|---|
| Windows 11 oder Debian/Ubuntu | aktuell | Beides tragfähig. iOS-Builds brauchen zusätzlich einen Mac |
| Git | 2.45 oder neuer | |
| Node.js | 22 LTS | identisch zu Produktion |
| pnpm | 9 oder 10 | `corepack enable` |
| Docker Desktop oder Docker Engine | aktuell | nur für lokale PostgreSQL 17, nicht als Produktionspflicht |
| Cursor | aktuelle stabile Ausgabe | Editor und Agent |
| Grok als Modell in Cursor | das stärkste dort angebotene Grok-Modell für Code | nicht nebenbei ein zweites Modell im selben Branch wechseln |
| PostgreSQL-Client `psql` | 17 | Fehlersuche |
| Ein Browser | aktuell | Firefox oder Chromium |

Nicht nötig auf diesem Platz: Android Studio für den Alltag (EAS baut in der Cloud), ein Domänencontroller, ein Copy von BMD.

Prüfung:

```bash
node -v
pnpm -v
git --version
docker --version
```

Lokale Datenbank:

```bash
docker run -d --name kmbhelp-pg \
  -e POSTGRES_PASSWORD=kmbhelp-dev-only \
  -e POSTGRES_DB=kmbhelp \
  -p 5432:5432 \
  postgres:17
```

Dieses Passwort ist nur für den Entwicklungscontainer. Es kommt nicht auf den Server und nicht ins GitHub.

## 2. GitHub

Repository **privat**. Ein öffentliches Repo mit dieser Fachlogik ist ein unnötiges Risiko, auch ohne Zugangsdaten.

Vorschlag: Organisation der Kanzlei, Name `kmbhelp`, Default-Branch `main`.

Einmalig, mit einem Konto das die Organisation verwalten darf:

1. Neues privates Repository, ohne Lizenzdatei für eine Open-Source-Lizenz. Eine Zeile `Proprietary. No license granted.` in `LICENSE`.
2. Diesen Ordner `helpdesk/` als Wurzel des ersten Commits verwenden, oder seinen Inhalt in die Wurzel legen. Empfehlung: Inhalt wird die Wurzel, damit `docs/` und `apps/` nicht doppelt verschachtelt sind.
3. Branch-Schutz auf `main`: kein direktes Pushen, ein Review, Statuschecks `test` und `typecheck` müssen grün sein, sobald die Actions aus Phase 0 existieren. Bis dahin Review trotzdem Pflicht.
4. Keine GitHub-Actions-Secrets für AD-Passwörter. CI bekommt nur eine wegwerfbare PostgreSQL als Service-Container.
5. Environments `staging` und `production` anlegen, wenn ein zweiter Host existiert. Sonst nur `production`. Required reviewers für `production`.
6. `CODEOWNERS` mit den GitHub-Namen der IT-Verantwortlichen, sobald es sie als Benutzer gibt.

`.gitignore` mindestens:

```gitignore
node_modules/
dist/
.expo/
.env
.env.*
!.env.example
*.pem
*.pfx
*.dump
.DS_Store
```

Commit-Form: `add payroll priority guard`, nicht „update“. Eine Phase, ein Pull Request.

Was niemals in ein Issue kopiert wird: echte Lohnlisten, Mandantennamen aus einem echten Fall, AD-Passwörter, Graph-Client-Secrets, Screenshots mit Personen- oder Mandantendaten. Für Fehler reichen erfundene Beispiele (`Mandant Beispiel GmbH`).

## 3. Cursor

1. Cursor installieren, mit dem Firmenkonto anmelden, das GitHub privat lesen darf.
2. `git clone` des privaten Repos, Ordner in Cursor öffnen. Nicht über „Upload“ auf einen fremden Agenten-Dienst.
3. Modell auf Grok stellen und dort lassen, solange ein Branch offen ist. Modellwechsel mitten in einer Phase erzeugt widersprüchliche Muster.
4. Indexierung des Repos an. `node_modules` bleibt über `.gitignore` draußen.
5. Projektdateien, die Cursor automatisch mitliest:
   - `AGENTS.md` (kurz, verweist auf diesen Ordner)
   - `.cursor/rules/kmbhelp.mdc`
6. Erster Chat: den Inhalt von `PROMPT.md` unter der Linie einfügen und dazuschreiben: „Setze nur Phase 0 um.“
7. Nächster Chat, neues Gespräch, nachdem der PR gemergt ist: „Lies `docs/status.md` und setze nur Phase 1 um.“ Nicht die ganze Spezifikation ein zweites Mal diskutieren lassen.
8. Agent-Modus darf Dateien ändern. Vor dem Commit die Diff-Ansicht selbst lesen. Insbesondere Migrationen, Auth und den Mail-Worker.
9. Terminal in Cursor ist in Ordnung für `pnpm test`. Produktionszugänge nicht in dasselbe Terminal-Profil wie öffentliche Demos legen.

MCP, sobald Phase 8 existiert: Datei `.cursor/mcp.json` lokal, nicht committen. Vorlage `.cursor/mcp.json.example` zeigt nur die Form. Der Dienst-Token steht in der lokalen Datei.

## 4. Grok, und was Grok nicht sehen darf

Grok arbeitet hier als Modell in Cursor auf dem lokalen Checkout. Der Chatinhalt verlässt den Rechner Richtung Modellanbieter. Deshalb:

- Keine echten Mandantendaten in den Prompt kleben, um „ein Beispiel“ zu zeigen.
- Keine `.env` öffnen und den Agenten bitten, sie zu erklären.
- Die Fachregeln sind schon in `docs/` formuliert. Der Agent soll diese Dateien lesen, statt dass jemand Tickets aus dem Produktivsystem in den Chat kopiert.
- Wenn später ein KI-Provider **in der Anwendung** Tickettexte bewertet, ist das ein anderer Vertrag als der Coding-Agent. Den Anwendungs-Provider erst nach AVV und EU-Region anschließen (`docs/sicherheit.md`). Der Coding-Agent und der Ticket-Klassifizierer sind zwei getrennte Themen. Eine Mail an `helpdesk@kmbcloud.at` wird nur ein Ticket, wenn der Absender intern ist und dieser Provider JA antwortet. Helpdesk und Mitarbeiter werden vorher ausgeschlossen. Ist er nicht erreichbar, bleibt die Mail ungelesen. Der Anbietername steht in `AI_PROVIDER` und wählt die Adresse nicht. Die Adresse eines Anbieters mit eigenem Schlüssel bleibt `AI_ENDPOINT`. Microsoft 365 Copilot hat dort keinen Endpunkt und keinen Schlüssel. Der Prüfstand vom 28.10.2026 steht in `docs/schnittstellen.md`.

Grok außerhalb von Cursor (grok.com) nur für Fragen ohne Codeausschnitte aus der Auth und ohne Echtdaten. Ergebnisse, die gelten sollen, gehören als Markdown ins Repo, nicht in einen Chatverlauf.

## 5. Geheimnisse

| Geheimnis | Wo es liegt | Wo es nicht liegt |
|---|---|---|
| PostgreSQL-Produktion | `/etc/kmbhelp/api.env`, Modus 0600, User `kmbhelp` | Git, Cursor-Chat, Issue |
| Dieser Arbeitsplatz | `%LOCALAPPDATA%\kmbhelp\secrets.json` für Konten, Passwörter und Zertifikate, dazu `dev.env` für die Datenbank-URL. Nur der Benutzer. Die API liest beide, solange `NODE_ENV` nicht `production` ist. `.env` im Projektordner nimmt die übrigen Werte auf und darf kein Passwort und kein Zertifikat enthalten, weil der Ordner auf Google Drive liegt | Git |
| Graph Client-Secret | dieselbe Datei | |
| AD-Dienstkonto | dieselbe Datei | kein Domänenadmin |
| Session-Schlüssel | dieselbe Datei, lange Zufallswerte | |
| Lokales Admin-Passwort | nur Argon2id-Hash in der Datenbank, Tabelle `staff`, Spalte `password_hash`. Die Website kann es nicht ändern. `LOCAL_ADMIN_PASSWORD` gilt nur für den Augenblick von `pnpm install:helpdesk` | nicht im Klartext aufheben, nicht in `secrets.json` |
| Expo-Token | Rechner der Person, die Stores baut, oder EAS-Secret | nicht im Linux-Helpdesk nötig |
| GitHub | persönlicher Zugang oder SSH-Schlüssel | |

Vorlage der Variablennamen, ohne Werte, ist `.env.example` und wird in Phase 0 erzeugt.

## 6. Produktion, kurz

Linux, Node 22, PostgreSQL 17 auf demselben Rechner oder einem internen Datenbankrechner, nginx oder Apache davor, TLS mit dem Zertifikat der Kanzlei. Zwei systemd-Einheiten: `kmbhelp-api`, `kmbhelp-worker`. Die genaue Anleitung schreibt Phase 10 nach `docs/installation-linux.md`. Bis dahin nicht „schnell per scp“ deployen.

Der Server braucht ausgehende Verbindungen zu Microsoft Graph und zum später gewählten KI-Anbieter, und eine eingehende LDAPS-Verbindung zu `MADC1.kmbcloud.at:636`. Port 443 öffentlich nur, wenn anonyme Meldungen von außen gewollt sind. Staff- und Admin-Pfade bleiben per Allowlist auf das Kanzleinetz beschränkt, auch wenn die API denselben Host hat. Jede Verbindung aus `127.0.0.0/8` oder `::1` ist ohne Anmeldung frei, auch in Produktion. Eine weitergeleitete Adresse zählt nicht. Syslog geht zuerst an `192.168.191.215` Port 514 UDP, Name `KMBHelp`, Facility `local0`, Uhrzeit `+01:00`, Format RFC 5424, und lässt sich danach auf der Konfigurationsseite ändern. `SYSLOG_NAME`, `SYSLOG_FACILITY` und `SYSLOG_UTC_OFFSET` stehen in `.env`.

Uhrzeit per NTP. Ohne korrekte Uhr ist die 72-Stunden-Frist und der Kalender falsch.

## 7. iOS und Android

Eine Expo-Codebasis in `apps/mobile`. Alltagstest über Expo auf einem Geräte-Preview im Kanzleinetz gegen eine Staging-URL. Store-Builds nicht vom Helpdesk-Server.

Apple

- Ein Apple-Developer-Account der GmbH, nicht eines privaten Mitarbeiters.
- Ein Mac nur für den Fall, dass lokal signiert werden muss. Mit EAS Build kann der Mac entfallen, der Developer-Account nicht.
- App-Id festlegen, zum Beispiel `at.kmbcloud.helpdesk`.
- Interne Verteilung über TestFlight, bevor etwas im öffentlichen App Store liegt. Für eine reine interne App ist der öffentliche Store der falsche Ort; Apple Business Manager oder TestFlight reichen.

Google

- Play-Console-Konto der GmbH.
- Interner Test-Track.
- App-Id dieselbe Rückwärtsdomäne.

Die Click-Strecke steht in `docs/mobile-stores.md`. Der erste Satz sagt, dass Zertifikate, Store-Richtlinien und die Konten der GmbH nachgezogen werden.

Lokale MFA der App (Biometrie oder Gerätecode) ist zusätzlich zur Server-MFA. Sie schützt das Gerät, sie ersetzt LDAPS nicht.

## 8. Reihenfolge der ersten Woche

1. Privates GitHub-Repo und Branch-Schutz.
2. Dieser Baum als Commit `add kmbhelp specification`.
3. Cursor öffnen, Grok wählen, Phase 0.
4. PR lesen, mergen, lokal `pnpm test`.
5. Erst dann Phase 1.
6. Parallel die Rückfragen aus `PROMPT.md` klären (Graph, LDAPS, KI-Anbieter, Logos, URLs, IP-Netz). Ohne diese Antworten sind Phasen 0, 1, 2 und 5 trotzdem baubar. Phase 3, 4 und 6 warten auf die Zugänge.

## 9. Stündliche Datenbanksicherung

Die Sicherung liegt im selben Ordner wie das Zugriffsprotokoll: `%LOCALAPPDATA%\kmbhelp\backups`. Die Datei heißt `kmbhelp-yyyyMMdd-HH.backup` und ist ein `pg_dump` im Custom-Format. Dateien, die älter als sieben Tage sind, löscht das Skript. Das Kennwort bleibt in `dev.env` und steht nicht in der Aufgabenplanung.

Das Skript im Repository ist `scripts/backup-database.ps1`. Die geplante Aufgabe `KMBHelp-Database-Backup` startet die Kopie unter `%LOCALAPPDATA%\kmbhelp\backup-database.ps1`, stündlich, solange dieser Windows-Benutzer angemeldet ist. Ein Dump gehört nicht ins Git und nicht auf das Laufwerk der Ablage. Auf dem Linux-Server gilt `docs/installation-linux.md`: dort sichert `scripts/backup-database.mjs` nach `/var/backups/kmbhelp`.

Zurückspielen, nur auf eine leere Testdatenbank:

`pg_restore --dbname postgresql://…/kmbhelp_restore --clean --if-exists datei.backup`

## 10. Testreste

Die Datenbanktests laden die Arbeitsplatz-Umgebung, damit sie dieselbe lokale Datenbank `kmbhelp` verwenden. Integrationstests schreiben in diese Datenbank. Jeder solche Test merkt sich seine Zeilen und löscht sie am Ende des Tests über `deleteTestResidue` in `packages/db/src/testing/cleanup.ts`. `createTestStaff` trägt die Person in diese Liste ein, sobald der Test sie übergibt. Nach dem gesamten API-Testlauf räumt `sweepTestArtifacts` zusätzlich auf: Adressen auf `@example.com` und `@example.invalid`, Anzeigenamen `Phase*`, `Dash Agent`, `Dash Lead`, `Dash Other`, `Test Staff` und `Factory Tester`, Break-Glass-Benutzer `breakglass-*`, Verzeichnis-Testkonten `agent-<kennzeichnung>@kmbcloud.at`, Tickets mit einer UUID im Betreff, Lieferanten `Dash *` und `Scan AG` mit Zweck `Scan`, sowie die dazu gehörenden Ereignisse. Die Trigger für nur anhängbare Zeilen werden dafür in derselben Transaktion aus- und wieder eingeschaltet. Helpdesk und die benannten Mitarbeiter fallen nicht unter diese Muster. Die Testzeile `automation@kmbhelp.invalid` entfernt die Migration `0011_remove_automation_staff`. Die Anwendung selbst löscht keine Mitarbeiter. `pnpm test` führt die Pakete nacheinander aus, damit das Aufräumen am Ende der API-Tests keine Zeile löscht, die ein anderes Paket gerade prüft.

## 11. Mindest-Check vor dem ersten echten Benutzer

- Öffentliche Ticketliste zeigt einen angelegten Betreff nicht.
- Ausgeschiedenes AD-Konto (in einer Test-OU) kommt nicht mehr hinein, obwohl der Passkey noch auf dem Gerät liegt.
- Zweite Zustellung derselben Mail erzeugt kein zweites Ticket.
- Änderung am 2. des Monats ohne Ausnahmegrund scheitert.
- Backup der Helpdesk-Datenbank wurde einmal zurückgespielt, nicht nur kopiert.
- `ADMIN_IP_ALLOWLIST` von einem Mobilfunknetz aus geprüft: Admin-Seite verweigert.

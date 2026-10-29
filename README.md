# KMBHelp — Spezifikation und Entwicklungsumgebung

Paket für **KMB Steuerberatung & Partner GmbH**.

Markenname der Anwendung: **KMBHelp**
Host und DNS-Name: `helpdesk.kmbcloud.at`
Postfach: `helpdesk@kmbcloud.at`

Die fachliche Vorgabe steht in `docs/` und in `PROMPT.md`. Phase 3 meldet Staff an: Verzeichnis, Passkey oder TOTP, lokaler Admin. Der Start prüft `MADC1.kmbcloud.at` und schreibt Syslog nach RFC 5424. Der erste Empfänger ist `192.168.191.215` Port 514 UDP, der Name `KMBHelp`, die Facility `local0`, die Uhrzeit `+01:00`. Die Konfigurationsseite ändert und prüft jeden Wert. Die Verwaltung liest `HelpdeskAdmins` und deaktiviert fehlende Mitarbeiter, ohne sie zu löschen. Jede Verbindung aus `127.0.0.0/8` oder `::1` öffnet die Verwaltung ohne Anmeldung, auch in Produktion. Einstellungen ohne Geheimnis stehen in `.env` im Projektordner. Ein gespeicherter Wert ohne Geheimnis liegt in `app_setting` und gilt vor `.env`. Die Auslieferung steht in `ConfigDefaults.md`. Der Mail-Worker ist Phase 4.

| Datei | Inhalt |
|---|---|
| [docs/prompt.md](docs/prompt.md) | Fachliche Anfrage: Umfang, Prozesse, Schnittstellen. |
| [PROMPT.md](PROMPT.md) | Kopierfertiger Arbeitsauftrag an Grok in Cursor. Phasen, Verbote, Akzeptanz. |
| [ENTWICKLUNGSUMGEBUNG.md](ENTWICKLUNGSUMGEBUNG.md) | Rechner, GitHub, Cursor, Grok, Geheimnisse, Build, iOS, Android. |
| [docs/installation-linux.md](docs/installation-linux.md) | Debian, systemd, nginx oder Apache, PostgreSQL-Rolle, Backup, Upgrade. |
| [docs/betriebsskizze.drawio](docs/betriebsskizze.drawio) | Prozesse, Verzeichnisse, Speicher, API, MCP, Mail, Kalender und KI. |
| [docs/stack-entscheidung.md](docs/stack-entscheidung.md) | Warum TypeScript, PostgreSQL, Fastify, Vite, Expo. |
| [docs/sicherheit.md](docs/sicherheit.md) | WTBG, DSGVO, was öffentlich sein darf und was nicht. |
| [docs/schnittstellen.md](docs/schnittstellen.md) | Mail, Web, Admin, API, MCP, Graph, AD. |
| [docs/ticketkatalog.md](docs/ticketkatalog.md) | Fachfälle, Priorität, Katalog. |
| [docs/prozesse/](docs/prozesse/) | Ein Markdown pro Prozess. |

## Entwicklung

Werkzeuge und der lokale PostgreSQL-Container stehen in [ENTWICKLUNGSUMGEBUNG.md](ENTWICKLUNGSUMGEBUNG.md). Node 22 und pnpm 10.

```bash
node -v
pnpm -v
git --version
docker --version

docker run -d --name kmbhelp-pg \
  -e POSTGRES_PASSWORD=kmbhelp-dev-only \
  -e POSTGRES_DB=kmbhelp \
  -p 5432:5432 \
  postgres:17

pnpm install
cp .env.example .env
```

Unter Windows PowerShell heißt der Kopierbefehl ebenfalls `cp .env.example .env`.

In `.env` das Passwort des lokalen Containers eintragen. Die Datei bleibt außerhalb von Git.

```bash
pnpm db:migrate
pnpm db:seed
pnpm test
pnpm typecheck
pnpm dev
```

`pnpm dev` startet die API auf `http://127.0.0.1:3000` und die Seite auf `http://127.0.0.1:5173`. Gesundheit: `GET /api/health`. Ohne erreichbare Datenbank antwortet die API mit 503.

Der Mail-Worker (`pnpm dev:worker`) liest `helpdesk@kmbcloud.at` nach `WORKER_SCHEDULE`, sobald die Graph-Werte gesetzt sind. Jede Mail geht an den lokalen Ollama-Server `OLLAMA_URL`, Modell `OLLAMA_MODEL`. SUPPORT wird ein Ticket, auch mit einer neuen Kategorie. Eine eindeutige Wichtigkeit setzt P1, P2 oder P3. ANTWORT und ABSCHLUSS ändern ein bestehendes Ticket. FREMD und SPAM werden nur gelesen markiert. Die Antwort an den Melder nennt Nummer und Listen-Link und liegt als Entwurf im Ordner Entwürfe von `helpdesk@kmbcloud.at`. Sie wird nicht verschickt. Die Fehlermail nach einer Abfrage über 5 Minuten geht an `MAIL_ERROR_TO` und wird verschickt. Der erste freie Mitarbeiter bekommt einen Termin mit Betreff `Neues Ticket` plus Mail-Betreff, der kompletten Mail und einem direkten Link. Ist Ollama nicht erreichbar, bleibt die Mail ungelesen und es entsteht nichts. Die Prüfung hat keinen API-Endpunkt und kein MCP-Werkzeug. Ohne Graph-Zugangsdaten protokolliert der Worker `not_configured` und stürzt nicht ab. `GET /api/health` zeigt den Worker, die Seite bleibt erreichbar. Zugriffe auf Seiten und Mails stehen im Protokoll unter `/verwaltung/protokoll`. Das Dashboard steht unter `/mitarbeit/dashboard`. Ein Mitarbeiter sieht eigene Zahlen, Leitung und Admin die Kanzlei. Das Tortendiagramm zählt jede Meldung einmal und ergibt 100 Prozent. Eine überzogene Fernwartung verlinkt auf `/mitarbeit/ticket/{nummer}`. Dort bearbeitet ein Mitarbeiter das offene Ticket. Die Zufriedenheit setzt nur die Antwort des Benutzers, und nur mit konfiguriertem KI-Anbieter. Die stündliche Datenbanksicherung liegt neben dem Zugriffsprotokoll, siehe `ENTWICKLUNGSUMGEBUNG.md`. Der MCP-Server spricht nur die HTTP-API. Cursor trägt ihn ein, wie `.cursor/mcp.json.example` zeigt. Der Dienst-Token bleibt außerhalb des Git.

Nur eine Phase pro Branch. Externe Zugänge (AD, Graph, KI-Anbieter) nicht raten.

## Logos

Die Kopfzeile verwendet die hellen und dunklen Dateien aus `brand/`. Links KMB Steuerberatung, rechts Malama nach `https://malama.at`. Die Feinarbeit an den Flächen folgt.

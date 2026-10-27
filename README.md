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

Der Mail-Worker (`pnpm dev:worker`) liest `helpdesk@kmbcloud.at` nach `WORKER_SCHEDULE`, sobald die Graph-Werte gesetzt sind. Eine Mail wird nur dann ein Ticket, wenn der Absender zu `INTERNAL_MAIL_DOMAINS` gehört, nicht Helpdesk und kein aktiver Mitarbeiter ist, und die Prüfung JA antwortet (`is_support`). Die Antwort nennt dann Nummer und Listen-Link, der erste freie Mitarbeiter bekommt einen Termin mit Betreff `Neues Ticket` plus Mail-Betreff, der kompletten Mail und einem direkten Link. Ist die KI nicht erreichbar, bleibt die Mail ungelesen und es entsteht nichts. Dieselbe Prüfung liegt auf `POST /api/v1/mail/review` und im MCP-Werkzeug `review_mail`. Ohne Graph-Zugangsdaten protokolliert der Worker `not_configured` und stürzt nicht ab. `GET /api/health` zeigt den Worker, die Seite bleibt erreichbar. Zugriffe auf Seiten und Mails stehen im Protokoll unter `/verwaltung/protokoll`. Das Dashboard steht unter `/mitarbeit/dashboard`. Ein Mitarbeiter sieht eigene Zahlen, Leitung und Admin die Kanzlei. Das Tortendiagramm zählt jede Meldung einmal und ergibt 100 Prozent. Eine überzogene Fernwartung verlinkt auf `/mitarbeit/ticket/{nummer}`. Die stündliche Datenbanksicherung liegt neben dem Zugriffsprotokoll, siehe `ENTWICKLUNGSUMGEBUNG.md`.

Nur eine Phase pro Branch. Externe Zugänge (AD, Graph, KI-Anbieter) nicht raten.

## Logos

Die Kopfzeile verwendet die hellen und dunklen Dateien aus `brand/`. Links KMB Steuerberatung, rechts Malama nach `https://malama.at`. Die Feinarbeit an den Flächen folgt.

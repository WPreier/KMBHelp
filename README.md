# KMBHelp — Spezifikation und Entwicklungsumgebung

Paket für **KMB Steuerberatung & Partner GmbH**.

Markenname der Anwendung: **KMBHelp**
Host und DNS-Name: `helpdesk.kmbcloud.at`
Postfach: `helpdesk@kmbcloud.at`

Die fachliche Vorgabe steht in `docs/` und in `PROMPT.md`. Phase 2 erfasst Tickets, zeigt die reduzierte öffentliche Liste, FAQ und Suche. Die Staff-Anmeldung folgt in Phase 3.

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

Der Mail-Worker (`pnpm dev:worker`) protokolliert `not_configured`, solange Graph-Zugangsdaten fehlen, und stürzt nicht ab.

Nur eine Phase pro Branch. Externe Zugänge (AD, Graph, KI-Anbieter) nicht raten.

## Logos

Noch nicht enthalten. Dateien hier ablegen, bevor Phase 2 startet:

- `brand/kmb-logo.svg` — KMB Steuerberatung, links in der Kopfzeile
- `brand/malama-logo.svg` — rechts, Linkziel `https://malama.at`

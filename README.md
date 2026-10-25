# KMBHelp — Spezifikation und Entwicklungsumgebung

Paket für **KMB Steuerberatung & Partner GmbH**.

Markenname der Anwendung: **KMBHelp**
Host und DNS-Name: `helpdesk.kmbcloud.at`
Postfach: `helpdesk@kmbcloud.at`

Dieses Verzeichnis ist **kein laufendes Programm**. Es ist die eingefrorene Vorgabe plus der Prompt, mit dem Cursor und Grok das System in einem privaten GitHub-Repository bauen.

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

## So wird daraus Software

1. Entwicklungsumgebung nach [ENTWICKLUNGSUMGEBUNG.md](ENTWICKLUNGSUMGEBUNG.md) aufsetzen.
2. Dieses Verzeichnis als ersten Commit in das private Repo `kmbhelp` legen.
3. In Cursor das Modell Grok wählen und [PROMPT.md](PROMPT.md) als ersten Auftrag verwenden.
4. Nur eine Phase pro Sitzung mergen. Externe Zugänge (AD, Graph, KI-Anbieter) nicht raten — der Prompt verlangt Rückfrage.

## Logos

Noch nicht enthalten. Dateien hier ablegen, bevor Phase 2 startet:

- `brand/kmb-logo.svg` — KMB Steuerberatung, links in der Kopfzeile
- `brand/malama-logo.svg` — rechts, Linkziel `https://malama.at`

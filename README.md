# KMBHelp — Spezifikation und Entwicklungsumgebung

Paket für **KMB Steuerberatung & Partner GmbH** (im Auftrag einmal „Partzner“ geschrieben; maßgeblich ist der Firmenwortlaut im Firmenbuch, Konstante `LEGAL_NAME`).

Markenname der Anwendung: **KMBHelp**
Host und DNS-Name: `helpdesk.kmbcloud.at`
Postfach: `helpdesk@kmbcloud.at` (im Auftrag steht einmal `helpdek@` — das ist ein Tippfehler und wird nicht verwendet)

Dieses Verzeichnis ist **kein laufendes Programm**. Es ist die eingefrorene Vorgabe plus der Prompt, mit dem Cursor und Grok das System in einem privaten GitHub-Repository bauen.

| Datei | Inhalt |
|---|---|
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

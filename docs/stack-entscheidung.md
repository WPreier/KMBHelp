# ADR-001 — Stack

Status: entschieden. Der umsetzende Agent ändert das nur mit einer neuen ADR und Begründung.

## Entscheidung

| Schicht | Wahl | Nicht |
|---|---|---|
| Sprache | TypeScript, strict, ESM | PHP, C#, Java, gemischte Sprachen |
| Laufzeit | Node.js 22 LTS | |
| API und Mail-Worker | Fastify 5 | NestJS (zu viel Gerüst für diese KMU), Django |
| Web | React 19, Vite, React Router, statischer Build | Next.js als Pflicht (Node-only Hosting erschwert Apache/nginx-Dateien) |
| Mobile | Expo (React Native), eine Codebasis | zwei native Projekte, Flutter |
| Datenbank | PostgreSQL 17 | MySQL, SQL Server, MongoDB, SQLite in Produktion |
| SQL-Zugriff | Drizzle ORM + SQL-Migrationen in Git | Prisma |
| Validierung | Zod, daraus OpenAPI | handgeschriebene DTOs |
| Staff-Auth | LDAPS gegen `MADC1.kmbcloud.at`, Gruppe `Helpdesk`, danach Passkey (WebAuthn) oder TOTP | Passwörter in der App speichern, „Vertrau der E-Mail“ |
| Break-glass | ein lokaler Admin, Argon2id, nur Installationsgeheimnis | AD-Konto als einziger Admin |
| Mail und Kalender | Microsoft Graph, getrennte App-Registration | IMAP-Polling, wenn das Postfach in M365 liegt |
| KI | austauschbarer Provider hinter `packages/ai`, EU-Verarbeitung, kein Training auf Tickets | Tickettext ungefiltert an ein US-Modell |
| MCP | eigenes Paket `apps/mcp`, spricht nur die versionierte HTTP-API | Direktzugriff des MCP auf die Datenbank |
| Reverse Proxy | nginx oder Apache, beide Konfigurationen mitliefern | Caddy als einzige Option |
| Prozesssteuerung | systemd auf Linux | Docker als Produktionspflicht |
| Pakete | pnpm Workspaces | npm-Verschachtelung, Yarn |
| Tests | Vitest, Supertest, Playwright für die Weboberfläche | |

## Warum TypeScript für Grok und Cursor

Grok und Cursor erzeugen in TypeScript die verlässlichsten Diffs: eine Sprache für API, Web, Worker, MCP und die App, gemeinsame Zod-Typen, keine stillen Vertragsbrüche zwischen Mail-Worker und Web. Python wäre für die KI-Bewertung ebenfalls tragfähig, würde aber ein zweites Ökosystem, zweite Migrationen und zweite Reviews erzwingen. Das ist für eine Kanzlei-KMU der teurere Weg.

## Warum PostgreSQL

Gefordert sind relationale Daten, ein weit verbreitetes System, Linux oder Windows, und bis zu 100 Zugriffe pro Sekunde. Produktion und Arbeitsplatz verwenden Major-Version 17.

100 Zugriffe pro Sekunde sind für PostgreSQL keine Sonderlast. Eine einzelne Instanz mit Pool (Größenordnung 20 Verbindungen) und normalen Indizes liegt darüber, solange keine Volltextsuche über Anhänge in derselben Transaktion passiert. PostgreSQL läuft auf Linux (Produktion, `helpdesk.kmbcloud.at`) und auf Windows (falls ein Admin lokal prüft). JSONB hält KI-Rohentscheidungen, ohne eine zweite Datenbank. Deutscher Volltext (`german`) reicht für FAQ und gelöste Tickets, bis ein Suchdienst wirklich nötig wird. Den gibt es in Phase 1 nicht.

MariaDB wäre möglich. PostgreSQL ist für neue TypeScript-Projekte die üblichere, von beiden Agenten besser belegte Wahl.

## Warum die Weboberfläche statisch hinter nginx und Apache liegt

Die Fachseiten sind dokumentenartig und müssen auf beiden Webservern liegen. Vite baut Dateien nach `apps/web/dist`. nginx und Apache liefern sie aus und proxen `/api/` an Fastify (`127.0.0.1:3000`). Dieselbe Node-App bedient API, OpenAPI und den Worker-Einstieg. Apache ist die Alternative, nicht ein zweiter Codepfad.

## Warum Expo

Eine Codebasis für iOS und Android, Zugriff auf Kamera ist nicht nötig, lokale MFA über `expo-local-authentication` und sichere Ablage über `expo-secure-store`. Die App spricht nur HTTPS gegen `https://helpdesk.kmbcloud.at`. Store-Builds laufen über EAS, nicht über einen Linux-Server der Kanzlei.

## Was bewusst nicht gebaut wird

Kein Problem-Management-Board, kein Change-Advisory-Board mit fünf Rollen, keine CMDB-Suite. Geräte, Lizenzen, Zertifikate und Portale sind einfache Tabellen mit Besitzer und Ablaufdatum.

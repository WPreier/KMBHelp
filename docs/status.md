# Status

Phase 2 ist umgesetzt. Der nächste Auftrag lautet: Phase 3 aus `PROMPT.md`.

| Phase | Inhalt | Stand |
|---|---|---|
| 0 | Gerüst, Health, Platzhalterseite | erledigt |
| 1 | Schema, Katalog, Priorität | erledigt |
| 2 | Öffentliches Web, Staff-API, Test-Auth nur außerhalb Produktion | erledigt |
| 3 | AD, MFA, lokaler Admin | offen |
| 4 | Graph Mail und Kalender | offen |
| 5 | Übrige Prozessregeln | offen |
| 6 | KI hinter Provider | offen |
| 7 | Dashboard | offen |
| 8 | MCP | offen |
| 9 | Staff-Oberflächen, Playwright | offen |
| 10 | Installation Linux, nginx, Apache | offen |
| 11 | Expo, Store-Dokumentation | offen |
| 12 | Härtung, Betrieb, Notfallblatt | offen |

## Phase 0 — Abnahme

- [x] pnpm-Workspace, TypeScript strict, ESLint, Prettier, Vitest
- [x] Drizzle-Anbindung und leere Migration
- [x] `GET /api/health`
- [x] `.env.example` ohne Geheimnisse
- [x] Platzhalterseite mit Wortmarken, `kmbhelp_lang`, `kmbhelp_theme`
- [x] `pnpm test` und `pnpm typecheck`

Start: `pnpm install`, PostgreSQL wie in `ENTWICKLUNGSUMGEBUNG.md`, `.env` aus `.env.example`, `pnpm db:migrate`, `pnpm dev`.

## Phase 1 — Abnahme

- [x] Schema für Tickets, Ereignisse, Katalog, Staff, Skills, Freeze, Lieferanten, Assets, Lizenzen, Zertifikate, Portale, Beschaffung, Wissen, FAQ, Access-Log, Sessions, WebAuthn
- [x] `ticket_event` ist nur anhängbar
- [x] `internet_message_id` ist eindeutig
- [x] Katalog, FAQ-Stubs, Freeze-Fenster und Beschaffungsgrenzen aus `docs/ticketkatalog.md`
- [x] Priorität: Lohn oder Finanzamt fällig oder überfällig ist P1, auch wenn P3 gemeldet wird
- [x] Test-Fabrik für Staff, in Produktion nicht erreichbar und von der API nicht importiert
- [x] `pnpm test` und `pnpm typecheck`

Start: `pnpm db:migrate`, danach `pnpm db:seed`. Die Datenbank heißt `kmbhelp`.

## Phase 2 — Abnahme

- [x] Ticket anlegen, Priorität aus Frist und Wirkung, Geheimlink nur mit E-Mail
- [x] Öffentliche Liste ohne Betreff, Text, Absender und Kommentare
- [x] FAQ-Seiten, leer bis die Kanzlei veröffentlicht
- [x] Suche über den Datenbank-Volltext, Satz „Treffer wegen Kategorie/Titel“, austauschbar
- [x] Staff-Liste: offen, plus höchstens 10 in Arbeit oder zuletzt geschlossen, mit Dauer
- [x] Test-Header nur außerhalb Produktion und nur mit `ALLOW_TEST_AUTH=1`
- [x] `pnpm test` und `pnpm typecheck`

Start: `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`. Seite auf `http://127.0.0.1:5173`.

Die Logo-Dateien und die Adressen für www, Home und Wiki fehlen. Die Kopfzeile zeigt die Wortmarken; die drei Links bleiben ohne Ziel.

## Offene Rückfragen

- Graph Admin-Consent und Kalender-Reichweite
- LDAPS-Dienstkonto und Gruppen-DN
- KI-Anbieter mit AVV, EU
- URLs für www, Home, Wiki
- Logos in `brand/`
- Apple- und Google-Konten der GmbH
- `ADMIN_IP_ALLOWLIST`

# Status

Phase 3 ist umgesetzt. Der nächste Auftrag lautet: Phase 4 aus `PROMPT.md`.

| Phase | Inhalt | Stand |
|---|---|---|
| 0 | Gerüst, Health, Platzhalterseite | erledigt |
| 1 | Schema, Katalog, Priorität | erledigt |
| 2 | Öffentliches Web, Staff-API, Test-Auth nur außerhalb Produktion | erledigt |
| 3 | AD, MFA, lokaler Admin | erledigt |
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

- [x] Ticket anlegen, Priorität aus Frist und Wirkung. Kein Geheimlink und keine E-Mail dafür
- [x] Öffentliche Liste als einzeilige Tabelle mit Köpfen ID, Text, Alter, Ablauf bis, dazu Offen, Priorität, Erledigt. Zeilen hell und dunkel, Rahmen wie die Eingabefelder
- [x] Zurücksetzen leert das Formular. Sprache und Darstellung sitzen als Flagge, Sonne und Mond in der Kopfzeile
- [x] Datum `dd.MM.yyyy`. Priorität: Sehr wichtig, bitte heute noch, bei Gelegenheit
- [x] Offen, inaktiv, abgelaufen, geschlossen. Geschlossen bleibt geschlossen. Wiederöffnen informiert alle als Ereignis
- [x] Links www, Home, Wiki und übrige externe Links in einem neuen Fenster. Suche rechts von Wiki
- [x] FAQ-Seiten, leer bis die Kanzlei veröffentlicht
- [x] Suche über den Datenbank-Volltext, Satz „Treffer wegen Kategorie/Titel“, austauschbar
- [x] Staff-Liste: offen, plus höchstens 10 in Arbeit oder zuletzt geschlossen, mit Dauer
- [x] Test-Header nur außerhalb Produktion und nur mit `ALLOW_TEST_AUTH=1`
- [x] `pnpm test` und `pnpm typecheck`

Start: `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`. Seite auf `http://127.0.0.1:5173`.

Die Kopfzeile zeigt die Logos aus `brand/`, hell und dunkel. Weiße Flächen und das dunkle Malama-Zeichen sind noch nicht fein ausgearbeitet. Die Kopfzeile verlinkt www, Home und Wiki.

## Phase 3 — Abnahme

- [x] Erste Anmeldung prüft das AD-Passwort über die Verzeichnis-Schnittstelle. Das Passwort wird nicht gespeichert
- [x] Danach Passkey oder TOTP. Eine wartende Sitzung erreicht keine Ticketinhalte
- [x] Spätere Anmeldung mit E-Mail plus Code oder Passkey, ohne erneutes AD-Passwort, solange das Konto aktiv und in HelpdeskAdmins ist
- [x] Genau ein lokaler Admin, Passwort Argon2id. Anlegen über `pnpm install:helpdesk`
- [x] Admin-Seiten: Passwort, MFA zurücksetzen, Skills und Kategorien. Leere Adressliste verweigert jeden Zugriff
- [x] `login_audit` nur anhängbar, ohne Passwort oder Code
- [x] `pnpm test` und `pnpm typecheck`

Start: `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`. Anmeldung auf `http://127.0.0.1:5173/anmelden`. Den lokalen Admin legt `pnpm install:helpdesk` an, wenn `LOCAL_ADMIN_USERNAME` und `LOCAL_ADMIN_PASSWORD` in der Shell stehen. Danach die Werte aus der History entfernen.

Die Gruppe ist `HelpdeskAdmins`. Die Verwaltung gilt für `192.168.36.0/24` und `192.168.191.0/24`. Dienstkonto, Passwort und das MADC1-Zertifikat liegen in `%LOCALAPPDATA%\kmbhelp\secrets.json`, nicht im Git und nicht im Projektordner.

Der Start prüft `MADC1.kmbcloud` und den konfigurierten Domänencontroller. Ist einer nicht erreichbar, geht die Meldung `directory.unreachable` ins Prozesslog und per Syslog an UDP 514. Meldungen und Konfiguration sieht nur der lokale Admin, unter `/verwaltung/meldungen` und `/verwaltung/konfiguration`. Die Auslieferung steht in `ConfigDefaults.md`.

## Offene Rückfragen

- Graph Admin-Consent und Kalender-Reichweite
- KI-Anbieter mit AVV, EU
- Apple- und Google-Konten der GmbH

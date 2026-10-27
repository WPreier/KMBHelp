# Status

Phase 4 ist umgesetzt. Der nächste Auftrag lautet: Phase 5 aus `PROMPT.md`.

| Phase | Inhalt | Stand |
|---|---|---|
| 0 | Gerüst, Health, Platzhalterseite | erledigt |
| 1 | Schema, Katalog, Priorität | erledigt |
| 2 | Öffentliches Web, Staff-API, Test-Auth nur außerhalb Produktion | erledigt |
| 3 | AD, MFA, lokaler Admin | erledigt |
| 4 | Graph Mail und Kalender | erledigt |
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

Die Gruppe ist `HelpdeskAdmins`. Die Verwaltung gilt für `192.168.36.0/24` und `192.168.191.0/24`. Jede Verbindung aus `127.0.0.0/8` oder `::1` öffnet die Verwaltungsseiten ohne Anmeldung, auch in Produktion. Eine weitergeleitete Adresse zählt nicht. Dienstkonto, Passwort und das MADC1-Zertifikat liegen in `%LOCALAPPDATA%\kmbhelp\secrets.json`, nicht im Git und nicht im Projektordner. Einstellungen ohne Geheimnis stehen in `.env` im Projektordner. Ein auf der Konfigurationsseite gespeicherter Wert ohne Geheimnis liegt in `app_setting` unter `config.NAME` und gilt beim nächsten Start vor `.env`.

Der Start prüft nur `MADC1.kmbcloud.at`. Ist der Domänencontroller nicht erreichbar, geht die Meldung `directory.unreachable` ins Prozesslog und per Syslog. Der erste Empfänger ist `192.168.191.215` Port 514 UDP, der APP-NAME ist `KMBHelp`, die Facility `local0`, die Uhrzeit `+01:00` über `SYSLOG_UTC_OFFSET`, das Format RFC 5424. Der lokale Admin ändert und prüft jeden Konfigurationswert unter `/verwaltung/konfiguration`. Meldungen sieht er unter `/verwaltung/meldungen`. `/verwaltung` liest `HelpdeskAdmins`, legt neue Mitarbeiter über die E-Mail-Adresse an und kann fehlende Einträge nur deaktivieren. `staff.active` ist der Status aktiv oder inaktiv. Inaktive stehen unter „Inaktive Mitarbeiter“. Neue Tickets bieten nur Aktive an. Vorhandene Tickets zeigen das Kürzel auch bei inaktiven Mitarbeitern. Die Auslieferung steht in `ConfigDefaults.md`.

## Phase 4 — Abnahme

- [x] Worker ohne Tenant-Werte protokolliert `not_configured` und stürzt nicht ab
- [x] Graph-Client hinter einem Interface. Der Contract-Test benutzt aufgezeichnete Payloads und ruft den echten Tenant nicht auf
- [x] Dieselbe `internetMessageId` erzeugt ein Ticket und eine Antwort
- [x] Antwort mit Nummer und Link auf die öffentliche Liste. Kein Geheimlink
- [x] Kalendereintrag beim ersten freien Mitarbeiter mit der passenden Kenntnis. Betreff `Neues Ticket` plus Mail-Betreff, Körper mit der kompletten Mail und dem Link. Dauer `CALENDAR_DEFAULT_MINUTES` (30), Start nach P1/P2/P3
- [x] Ohne Treffer im Text gilt `FALLBACK_CATEGORY`, Auslieferung `printer`. Ohne KI
- [x] Wiederöffnen informiert alle aktiven Mitarbeiter, sobald Graph konfiguriert ist
- [x] `GET /api/health` zeigt den Worker. Die Seite bleibt erreichbar, wenn er steht
- [x] `pnpm test` und `pnpm typecheck`

Start: `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`, zusätzlich `pnpm dev:worker`. Ohne `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID` und `GRAPH_CLIENT_SECRET` bleibt der Worker bei `not_configured`. Die Antwortadresse ist `PUBLIC_ORIGIN`. Der Abruf folgt `WORKER_SCHEDULE`. P1 beginnt nach `CALENDAR_DELAY_P1` Minuten (0), P2 nach 60, P3 nach 240. Die Bereitschaft ist `ONCALL_EMAIL` und bleibt leer, bis eine Adresse gespeichert ist. Kategorien stehen in der Tabelle `category` und kommen aus `packages/db/src/catalog.ts` über `pnpm db:seed`. Eine Seite zum Anlegen von Kategorien gibt es nicht.

## Phase 9 — noch nicht bauen

Die Staff-Oberfläche ist weiterhin Phase 9. Der folgende Auftrag wird dort erledigt, nicht vorher. Verbindlich ist zusätzlich `docs/prozesse/14-bearbeitung.md`.

- [ ] Eine Ticketseite `/mitarbeit/ticket/{nummer}` für angemeldete Mitarbeiter. Jeder Mitarbeiter darf jedes offene Ticket bearbeiten und jedes Feld ändern, außer die Zufriedenheit. Der Kalender verlinkt diesen Pfad bereits.
- [ ] Erledigt setzt das Ticket auf geschlossen und sendet eine Mail mit Betreff `Ticket` plus Nummer und dem Text: das Ticket ist gelöst, und wenn es zur Zufriedenheit gelöst wurde, würde man sich über eine kurze Antwort freuen.
- [ ] Diese Antwort liest die KI, hängt sie an das Ticket und trägt die Zufriedenheit ein. Drei Zustände, als SVG und nicht als Emoji: zufrieden gelb, neutral grün, unzufrieden orange. Nur der Benutzer ändert das, nie der Mitarbeiter.
- [ ] Der Mitarbeiter kann eine Erklärung am Ticket speichern.
- [ ] Ein Knopf sendet an den Auftraggeber: ich arbeite jetzt an diesem Ticket. Absender ist `GRAPH_MAILBOX`.
- [ ] Eine Rückfrage wird am Ticket gespeichert und als Mail an den Benutzer gesendet.
- [ ] Die Seite listet Helpdesk-Mails, die noch kein Ticket sind, und kann jede davon von Hand in ein Ticket umwandeln.
- [ ] Wird ein Mail als Ticket angenommen, merkt sich die KI den Grund. Wird ein Ticket als Fehlinterpretation markiert, wird genau dieses Ticket gelöscht und der Grund gespeichert, damit ein Mail künftig kein Ticket erzeugen darf. Das ist keine allgemeine Löschfunktion.
- [ ] Helpdesk-Mails dürfen zur Prüfung an Grok oder einen Grok-Agenten, aber nur hinter dem Provider aus Phase 6 und nur wenn Endpunkt, Region und AVV gesetzt sind. Sonst kein Aufruf.
- [ ] Der Agent meldet, ob ein Mail ein Ticket werden soll, dazu Kategorie, Priorität, Benutzer und einen verfügbaren Mitarbeiter. Die Verfügbarkeit kommt aus dem Microsoft-365-Kalender. Der Mitarbeiter erhält eine Mail mit Ticketnummer, allen Angaben und dem Originalmail als Anhang.

## Offene Rückfragen

- Graph Admin-Consent und Kalender-Reichweite
- KI-Anbieter mit AVV, EU
- Apple- und Google-Konten der GmbH

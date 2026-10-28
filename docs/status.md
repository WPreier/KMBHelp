# Status

Phase 9 ist auf `phase/09-bearbeitung` committet. Als Nächstes ist Phase 10 zu prüfen: die Linux-Installation in `docs/installation-linux.md`, sobald der Branch `phase/10-installation` vorliegt. Die Ticketseite steht auf `http://127.0.0.1:5173/mitarbeit/ticket/{nummer}`. Ausgehende Mails liegen als Entwurf im Ordner Entwürfe von `helpdesk@kmbcloud.at`.

| Phase | Inhalt | Stand |
|---|---|---|
| 0 | Gerüst, Health, Platzhalterseite | erledigt |
| 1 | Schema, Katalog, Priorität | erledigt |
| 2 | Öffentliches Web, Staff-API, Test-Auth nur außerhalb Produktion | erledigt |
| 3 | AD, MFA, lokaler Admin | erledigt |
| 4 | Graph Mail und Kalender | erledigt |
| 5 | Übrige Prozessregeln | erledigt |
| 6 | KI hinter Provider | erledigt |
| 7 | Dashboard | erledigt |
| 8 | MCP | erledigt |
| 9 | Staff-Oberflächen, Playwright | erledigt |
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
- [x] `FALLBACK_CATEGORY` (Auslieferung `printer`) gilt erst, nachdem die KI die Mail als Support bestätigt hat und keine Katalogkategorie nennt. Ohne erreichbare KI entsteht aus der Mail kein Ticket
- [x] Wiederöffnen informiert alle aktiven Mitarbeiter, sobald Graph konfiguriert ist
- [x] `GET /api/health` zeigt den Worker. Die Seite bleibt erreichbar, wenn er steht
- [x] `pnpm test` und `pnpm typecheck`

Start: `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`, zusätzlich `pnpm dev:worker`. Ohne `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID` und `GRAPH_CLIENT_SECRET` bleibt der Worker bei `not_configured`. Die Antwortadresse ist `PUBLIC_ORIGIN`. Der Abruf folgt `WORKER_SCHEDULE`. P1 beginnt nach `CALENDAR_DELAY_P1` Minuten (0), P2 nach 60, P3 nach 240. Die Bereitschaft ist `ONCALL_EMAIL` und bleibt leer, bis eine Adresse gespeichert ist. Kategorien stehen in der Tabelle `category` und kommen aus `packages/db/src/catalog.ts` über `pnpm db:seed`. Eine Seite zum Anlegen von Kategorien gibt es nicht.

## Phase 5 — Abnahme

- [x] Änderung im Stoppfenster ohne `exception_reason` antwortet 422. Mit Begründung wird sie gespeichert. Ohne Rückfalltext keine Genehmigung
- [x] Beschaffung: unter der ersten Grenze direkt, bis zur zweiten Grenze ein Vorgesetzten-Token, darüber `manual`. Grenzen über die Verwaltung änderbar, Voreinstellung 100 und 500
- [x] Der Token-Link zeigt nur Artikel und Betrag. Er liest das Ticket nicht
- [x] Fernwartung lehnt einen Lieferanten ohne Freigabe oder ohne AVV- und Verschwiegenheitsdatum ab
- [x] Backup-Test ohne ja/nein zu „echt zurückgespielt“ wird nicht geschlossen. Danach entsteht das Folgeticket in 90 Tagen
- [x] Sicherheitsvorfall startet als P1 mit `deadline_at` = Entdeckung plus 72 Stunden. Herabstufen nur mit Begründung
- [x] Offboarding ohne letzten Arbeitstag wird abgelehnt. Die Checkliste hängt am Ticket
- [x] Zertifikate erinnern bei 30 und bei 7 Tagen. Berechtigungen alle 180 Tage je Portal, Aufbewahrung alle 365 Tage je Datenort. IP-Zeilen älter als `ACCESS_LOG_RETENTION_DAYS` werden gelöscht
- [x] Die Regeln liegen in der API. Die Formularseite `/mitarbeit/vorgaenge` ist auf Wunsch entfernt. Die Genehmigungsseite `/beschaffung/:token` bleibt
- [x] `pnpm test` und `pnpm typecheck`

Start: `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`. Die Vorgänge ruft die API auf. Eine eigene Formularseite gibt es nicht. Die Beschaffungsgrenzen und zusätzlichen Stoppfenster speichert der lokale Admin.

## Phase 6 — Abnahme

- [x] Anbieter hinter `@kmbhelp/ai`. Ohne https-Endpunkt, EU-Region, Schlüssel und AVV kein Aufruf und das Verhalten von Phase 2
- [x] SVNR, IBAN, Kreditkartenmuster und Geburtsdatum werden vor dem Modell maskiert
- [x] Entscheidung als JSON: Kategorie, Priorität, Kenntnis, Konfidenz, `auto_reply_allowed`, `is_support`
- [x] Helpdesk-Mail wird nur bei `is_support: true` ein Ticket. Ohne erreichbare KI bleibt sie ungelesen und erzeugt nichts
- [x] Neutrale Prüfung über `POST /api/v1/mail/review` und MCP `review_mail`. Der Auftrag steht mehrzeilig in `AI_MAIL_PROMPT`. JA setzt `is_support`. Der Anbietername `AI_PROVIDER` ist austauschbar, die Adresse bleibt `AI_ENDPOINT`
- [x] Vor dem Modell: nur `INTERNAL_MAIL_DOMAINS`, nie `helpdesk`, das Postfach oder ein aktiver Mitarbeiter
- [x] Syslog für jeden externen Schritt. Zugriffsprotokoll in `activity_log` und `%LOCALAPPDATA%\kmbhelp\activity.log`, sichtbar unter `/verwaltung/protokoll`, filterbar und als Text, CSV oder PDF
- [x] Automatisch schließen nur bei Allowlist, Konfidenz ab 0,85, ohne personenbezogene Muster und mit veröffentlichter FAQ. Sonst Mensch
- [x] `model_decision` speichert Modell, Eingabe-Hash und Ausgabe, nicht den Tickettext
- [x] Staff-Suche mit Begründung und Link. Öffentliche Suche ohne Modell und ohne Klartext im Protokoll
- [x] `pnpm test` und `pnpm typecheck`

Start: `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`, zusätzlich `pnpm dev:worker`. Die Suche bleibt auf `http://127.0.0.1:5173`. Solange die vier KI-Felder leer sind, gilt der Satz „Treffer wegen Kategorie/Titel“, und eine Helpdesk-Mail bleibt ungelesen. `AI_AUTO_REPLY_CATEGORIES` bleibt leer, bis die Kanzlei Kategorien freigibt.

## Phase 7 — Abnahme

- [x] `GET /api/v1/staff/dashboard` mit Tag, Woche, Monat, Quartal und Jahr nach `Europe/Vienna`
- [x] Rolle `agent` sieht nur zugewiesene Tickets. `lead`, `admin` und der lokale Admin sehen die Kanzlei
- [x] Eingänge, Erledigungen, offene P1, Median bis zur ersten Reaktion, Median bis zur Lösung, Aufwand in Minuten
- [x] Überzogene Fernwartung mit Falldaten und Link auf `/mitarbeit/ticket/{nummer}`
- [x] Tortendiagramm: Mails, Webtickets, Erledigt, offene P1, P2 und P3, zusammen 100 Prozent
- [x] Seite `/mitarbeit/dashboard`, ohne Anmeldung keine Zahlen
- [x] `pnpm test` und `pnpm typecheck`

Start: `pnpm dev`. Das Dashboard steht auf `http://127.0.0.1:5173/mitarbeit/dashboard`. Aus `127.0.0.0/8` ohne Anmeldung, sonst als angemeldeter Mitarbeiter.

Am 27.10.2026 wurden zuerst 610 fehlgeschlagene Test-Tickets entfernt und je Kategorie zwei behalten. Danach wurden auch diese Reste, die Personen mit Namen `Phase*` und die übrigen Testpersonen und Testlieferanten gelöscht. Die Append-only-Trigger an `ticket_event` und `login_audit` werden dafür nur in der Testfabrik kurz ausgeschaltet und danach wieder eingeschaltet. Jeder Integrationstest löscht seine eigenen Zeilen. Die Formularseite `/mitarbeit/vorgaenge` ist entfernt. Die stündliche Sicherung steht in `ENTWICKLUNGSUMGEBUNG.md`.

## Phase 8 — Abnahme

- [x] `apps/mcp` spricht nur die HTTP-API. Es gibt kein SQL-Werkzeug
- [x] Lesen: Gesundheit, Kategorien, Staff-Liste, ein Ticket, Dashboard, Prozessdaten, Mail-Prüfung
- [x] Staff-Aktionen spiegeln die vorhandenen POST-Routen. Admin-Routen und die öffentliche Beschaffungsentscheidung sind keine Werkzeuge
- [x] Dienst-Token `MCP_SERVICE_TOKEN`, mindestens 16 Zeichen. Er ist kein Mitarbeiter und sieht die Kanzlei. Der Token liegt nicht im Git. Die API liest ihn nach einem Neustart
- [x] `.cursor/mcp.json.example` zeigt, wie Cursor den Server einträgt. Die echte Datei `.cursor/mcp.json` bleibt ignoriert
- [x] `pnpm test` und `pnpm typecheck`

Start: `pnpm db:migrate`, denselben Token in die lokale Geheimdatei und in die Cursor-Umgebung schreiben, API neu starten. `KMBHELP_API_ORIGIN` ist `http://127.0.0.1:3000`.

## Phase 9 — Abnahme

Die Formularseite `/mitarbeit/vorgaenge` bleibt entfernt. Die Bearbeitung steht auf `/mitarbeit/ticket/{nummer}`. Verbindlich ist `docs/prozesse/14-bearbeitung.md`.

- [x] Dieselbe Ticketseite bearbeiten: jeder Mitarbeiter darf jedes offene Ticket ändern, außer die Zufriedenheit.
- [x] Erledigt setzt das Ticket auf geschlossen und legt eine Mail als Entwurf ab, Betreff `Ticket` plus Nummer und der Text: das Ticket ist gelöst, und wenn es zur Zufriedenheit gelöst wurde, würde man sich über eine kurze Antwort freuen.
- [x] Diese Antwort liest die KI, hängt sie an das Ticket und trägt die Zufriedenheit ein. Drei Zustände, als SVG und nicht als Emoji: zufrieden gelb, neutral grün, unzufrieden orange. Nur der Benutzer ändert das, nie der Mitarbeiter. Ohne Endpunkt, EU-Region, Schlüssel und AVV bleibt die Antwort ungelesen.
- [x] Der Mitarbeiter kann eine Erklärung am Ticket speichern.
- [x] Ein Knopf legt an den Auftraggeber einen Entwurf ab: ich arbeite jetzt an diesem Ticket. Absender ist `GRAPH_MAILBOX`. Ohne Microsoft 365 antwortet die Aktion, dass der Entwurf nicht angelegt werden kann.
- [x] Eine Rückfrage wird am Ticket gespeichert und als Entwurf an den Benutzer abgelegt.
- [x] Die Seite listet Helpdesk-Mails, die noch kein Ticket sind, und kann jede davon von Hand in ein Ticket umwandeln.
- [x] Wird ein Mail als Ticket angenommen, merkt sich die Anwendung den Grund. Wird ein Ticket als Fehlinterpretation markiert, wird genau dieses Ticket gelöscht und der Grund gespeichert, damit ein Mail künftig kein Ticket erzeugen darf. Das ist keine allgemeine Löschfunktion.
- [x] Die Prüfung selbst liegt seit Phase 6 auf `POST /api/v1/mail/review` und dem MCP-Werkzeug `review_mail`, nur mit Endpunkt, EU-Region, Schlüssel und AVV. Sonst kein Aufruf. Gespeicherte Gründe gehen in den nächsten Auftrag mit.
- [x] Der Agent meldet, ob ein Mail ein Ticket werden soll, dazu Kategorie, Priorität, Benutzer und einen verfügbaren Mitarbeiter. Die Verfügbarkeit kommt aus dem Microsoft-365-Kalender. Der Mitarbeiter erhält eine Mail mit Ticketnummer, allen Angaben und dem Originalmail als Anhang.
- [x] Playwright-Rauchtest: Ticket anlegen, die Beschreibung steht nicht in der öffentlichen Liste, Sprache und Darstellung wechseln.
- [x] `pnpm test` und `pnpm typecheck`

Start: `pnpm dev`. Die Ticketseite steht auf `http://127.0.0.1:5173/mitarbeit/ticket/{nummer}`. Der Rauchtest ist `pnpm --filter @kmbhelp/web e2e`.

## Offene Rückfragen

- Graph Admin-Consent und Kalender-Reichweite
- Apple- und Google-Konten der GmbH

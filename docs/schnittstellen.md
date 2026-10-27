# Schnittstellen

Basis-URL Produktion: `https://helpdesk.kmbcloud.at`
API: `https://helpdesk.kmbcloud.at/api/v1`
OpenAPI: `https://helpdesk.kmbcloud.at/api/docs`
Gesundheit: `https://helpdesk.kmbcloud.at/api/health`

## 1. E-Mail

- Postfach `helpdesk@kmbcloud.at`.
- Abruf über Microsoft Graph (`Mail.Read`, `Mail.Send`, `Calendars.ReadWrite` als Application-Permission mit Admin-Consent). Der Takt steht in `WORKER_SCHEDULE`. Auslieferung: 00:00–08:00 alle 30 Minuten, 08:00–12:00 alle 10 Minuten, 12:00–12:30 nicht, 12:30–17:00 alle 10 Minuten, 17:00–24:00 alle 30 Minuten. Die Uhr ist `SYSLOG_UTC_OFFSET`. Der Prozess schreibt trotzdem etwa jede Minute einen Herzschlag, damit `GET /api/health` ihn nicht als ausgefallen wertet.
- Idempotenz über `internetMessageId`. Dieselbe Mail erzeugt nie ein zweites Ticket und keine zweite Antwort.
- Ein Ticket entsteht nur, wenn die KI `is_support` mit `true` bestätigt. Ist sie nicht konfiguriert oder antwortet sie nicht, bleibt die Mail ungelesen: kein Ticket, keine Antwort, kein Termin. Eine ausdrückliche Ablehnung markiert die Mail als gelesen und erzeugt ebenfalls kein Ticket. Danach gewinnt die Kategorie des Modells, wenn sie im Katalog steht. Sonst der längste Kategorie-Name im Betreff oder Text, und wenn keiner trifft, `FALLBACK_CATEGORY`. Auslieferung ist `printer` (Drucker). Der Code muss in der Tabelle `category` stehen. Priorität kommt aus Frist und Wirkung und wird vom Modell nicht herabgestuft. Die Zuordnung nimmt den ersten aktiven Mitarbeiter mit passender Kenntnis, der im Kalender frei ist. Der Termin beginnt `CALENDAR_DELAY_P1` (0), `CALENDAR_DELAY_P2` (60) oder `CALENDAR_DELAY_P3` (240) Minuten nach dem Anlegen. Ist der Platz belegt, rückt er in 30-Minuten-Schritten. Ohne Microsoft-365-Freigabe bleibt der erste passende Mitarbeiter, und es wird kein Termin erfunden.
- Antwort an den Absender von `GRAPH_MAILBOX` mit Nummer und Link auf die öffentliche Liste. Einen Geheimlink gibt es nicht.
- Kalendereintrag beim Bearbeiter: Betreff `Neues Ticket` plus Mail-Betreff. Der Körper enthält die komplette Mail, Absender und den Link `/mitarbeit/ticket/{nummer}`. Diese Seite folgt in Phase 9. Die Dauer ist `CALENDAR_DEFAULT_MINUTES`, Auslieferung 30. Sobald Phase 6 eine Dauer zwischen 5 und 480 Minuten nennt, gilt diese Zahl für genau dieses Ticket. Zu viel Text löscht der Mitarbeiter im Kalender selbst. Eine P1-Mail an `ONCALL_EMAIL` geht nur, wenn die Adresse gesetzt und Graph konfiguriert ist.
- Wird ein inaktives Ticket wieder geöffnet, geht eine Mail an alle aktiven Mitarbeiter: `Ticket {nummer} ist wieder offen`, plus der Listen-Link. Ohne Graph bleibt das Ereignis stehen, der Worker sendet es nach, sobald die Werte gesetzt sind.
- Der Worker ist ein eigener Prozess `kmbhelp-worker`. Ohne Tenant-Werte protokolliert er `not_configured` und stürzt nicht ab. Die Webseite funktioniert weiter, wenn er steht. `GET /api/health` zeigt `worker` als `up`, `down` oder `not_configured`. `down` macht die API nicht unerreichbar.

## 2. Benutzer-Web

- Ticket erfassen.
- Öffentliche Übersicht nach Abteilung nur in der reduzierten Form aus `docs/sicherheit.md`.
- Sprache aus `Accept-Language`, umschaltbar Deutsch / Englisch, weitere Sprachen als zusätzliche JSON-Dateien ohne Codeänderung. Wahl in einem Cookie `kmbhelp_lang`.
- Helligkeit in Cookie `kmbhelp_theme` (`light` oder `dark`), zusätzlich `prefers-color-scheme` als Startwert.
- Kein Cookie-Banner. Es werden nur technisch nötige Cookies gesetzt (Sprache, Theme). Das ist eine Produktentscheidung der Kanzlei; die Software lädt keine Tracker.
- Kopfzeile: links das KMB-Logo, dann `www` nach `https://kmb-steuerberatung.at`, `Home` nach `https://home.kmbcloud.at`, `Wiki` nach `https://wiki.kmbcloud.at`. Rechts von Wiki ein kleines Suchfeld ohne Beschriftung, der Knopf ist eine Lupe. Danach kleine Flaggen für Deutsch und Englisch, dann Sonne und Mond für Hell und Dunkel, links vom Malama-Logo. Ziel von Malama ist `https://malama.at`. Hell nutzt `kmb-logo--light.png` und `malama-logo-light.svg`, Dunkel nutzt `kmb-logo-dark.png` und `malama-logo-dark.svg`. Externe Links öffnen ein neues Fenster. Dieselbe Hintergrundfarbe trägt den Balken darunter mit `KMBHelp` und dem Satz „IT Helpdesk für die KMB Steuerberatung“. Darunter, nah am Balken, liegen „Ticket erfassen“ und „Anleitungen“.
- Datumseingaben im Format `dd.MM.yyyy`. Die öffentliche Liste ist eine einzeilige Tabelle mit den Köpfen ID, Text, Alter und Ablauf bis. Die Zeilen wechseln hell und dunkel. Die Tabelle hat denselben leichten Rahmen und Schatten wie die Eingabefelder. Neben „Ticket anlegen“ steht „Zurücksetzen“ und leert das Formular.
- Bedienbar mit Tastatur, auf schmalen Displays eine Spalte. Touch-Ziele sind mindestens 44px, die Flaggen- und Darstellungs-Knöpfe in der Kopfzeile sind kleiner.

## 3. IT-Mitarbeiter-Web

- Offene Tickets.
- Höchstens 10 Tickets, die in Arbeit oder kürzlich geschlossen sind, mit Beschreibung und Dauer bis zur Lösung.
- Nur nach Staff-Anmeldung.

## 4. FAQ

- Redaktionell gepflegte kurze Anleitungen.
- Startbestand als leere Struktur plus die im Ticketkatalog genannten Stichworte (ELDA, Smartcard, VPN, Scanstau, FinanzOnline, Virenscanner), Texte schreibt die Kanzlei.

## 5. Gelöste Tickets

- Staff sieht den durchsuchbaren Bestand gelöster Tickets.
- Öffentlich nur, was als Wissensartikel freigegeben und redigiert wurde.

## 6. KI-Suche

- Auf allen inhaltlichen Seiten ein Suchfeld.
- Durchsucht FAQ, freigegebene Artikel und — nur für Staff — Tickettexte.
- Ergebnis: Link, Titel, kurze Begründung warum der Treffer passt. Keine freie Nacherzählung von Mandantendaten in der öffentlichen Suche.
- Die Begründung kommt vom Modell und wird mit den Treffer-Ids gespeichert, wenn ein Staff sucht. Öffentliche Suche speichert nur den Suchbegriff-Hash und die Zeit, nicht den Klartext, sofern der Begriff personenbezogen sein könnte. Einfacher und verbindlich: öffentliche Suchanfragen werden nicht dauerhaft im Klartext gespeichert.

## 7. Dashboard

- Nur Staff. `GET /api/v1/staff/dashboard?range=day|week|month|quarter|year`. Ohne Anmeldung 401. Localhost zählt als Kanzlei.
- Rolle `agent` sieht Tickets, die ihm zugewiesen sind. Rolle `lead`, `admin` und der lokale Admin sehen die Kanzlei.
- Der Zeitraum folgt `Europe/Vienna`. Die Woche beginnt am Montag. Offene P1 sind der aktuelle Bestand, nicht der Zeitraum.
- Eingänge sind Tickets mit `created_at` im Zeitraum. Erledigungen sind Tickets mit `closed_at` im Zeitraum. Der Aufwand ist die Summe von `effort_minutes` dieser Erledigungen. Eine Erledigung ohne Minuten zählt als 0. Die Minuten werden beim Schließen durch einen Mitarbeiter eingetragen. Die öffentliche Liste fragt sie nicht ab.
- Die erste Reaktion ist das erste Ereignis `assigned`, `reply`, `closed` oder `priority_changed` nach dem Anlegen. Die Lösung ist `closed_at` minus `created_at`. Beide Mediane sind in Minuten, gerundet. Fehlt ein Wert, steht `null`.
- Eine Fernwartung, deren Fenster vorbei ist und die kein `ended_at` hat, erscheint mit Nummer, Betreff, Kategorie, Priorität, Status, Lieferant, Kontoname und Fenster. Der Link führt auf `/mitarbeit/ticket/{nummer}`. Der Beschreibungstext steht dort, nicht in der Liste.
- Das Tortendiagramm teilt jede Meldung genau einmal zu. Noch nicht erledigte Mails sind „Mails“, noch nicht erledigte Web- und App-Tickets sind „Webtickets“, die übrigen nicht erledigten Meldungen stehen nach P1, P2 und P3. „Erledigt“ sind die im Zeitraum geschlossenen. Die gerundeten Anteile ergeben 100 Prozent. Die nicht erledigten Anteile sind der aktuelle Bestand.
- Die Seite ist `/mitarbeit/dashboard`. Die Ticketseite ist nur für Mitarbeiter und enthält die Beschreibung. Die öffentliche Liste bleibt ohne Text, Melder und Kommentare. Bearbeiten kommt in Phase 9.

## 8. Admin, nur intern und nur authentifiziert

- Lokales Admin-Passwort ändern.
- MFA eines Staff-Kontos zurücksetzen.
- Kenntnisse, Aufgaben und Kategorien je Helpdesk-Mitarbeiter.
- Diese Zuordnung ist die Eingabe für die KI-Zuteilung zusammen mit dem Kalender.
- Graph-Berechtigung `Calendars.ReadWrite` auf die Postfächer der Helpdesk-Mitarbeiter, nicht auf die ganze Firma, soweit der Tenant das hergibt (Application Access Policy).

## 9. Öffentliche Seiten ohne Benutzerkonto

Siehe Sicherheitsdokument. Anonym ist erlaubt. IP-Log ist Pflicht.

## 10. Staff-Anmeldung

Wie in `docs/sicherheit.md`. Domäne `kmbcloud.at`, Server `MADC1.kmbcloud.at`, Gruppe `HelpdeskAdmins` unter `kmb/Sicherheitsgruppen`. Das Dienstkonto und das Zertifikat von MADC1 liegen nur in der lokalen Datei außerhalb des Projektordners.

`POST /api/v1/auth/login` prüft beim ersten Mal das Passwort. Für AD-Konten ruft das die Verzeichnis-Schnittstelle auf. Fehlen `LDAPS_URL`, Bind-DN, Bind-Passwort, Basis-DN oder Gruppen-DN, antwortet die API mit 503 und speichert nichts. Ein Test-Double ersetzt das Verzeichnis in den Tests. Das Passwort steht weder in der Datenbank noch im Audit. `login_audit` ist nur anhängbar. Wird ein Konto gelöscht, bleibt die Zeile und der Verweis wird leer.

Ist MFA eingerichtet, genügen E-Mail und TOTP oder Passkey. Die Mitgliedschaft wird dabei erneut geprüft. Wer nicht mehr in HelpdeskAdmins ist, erhält dieselbe öffentliche Ablehnung wie bei einem falschen Passwort. Das Audit nennt `not_member`.

Die Sitzung heißt `kmbhelp_session`, `HttpOnly`, `SameSite=Lax`, `Secure` nur über https. Der CSRF-Wert heißt `kmbhelp_csrf` und ist für die Seite lesbar. Änderungen senden ihn als `x-kmbhelp-csrf`. Eine Sitzung mit offener MFA-Einrichtung darf keine Staff-Tickets lesen.

Passkey und TOTP: `POST /api/v1/auth/totp/setup`, `POST /api/v1/auth/totp/confirm`, `POST /api/v1/auth/webauthn/register/options`, `POST /api/v1/auth/webauthn/register/verify`, `POST /api/v1/auth/webauthn/login/options`, `POST /api/v1/auth/webauthn/login/verify`. Abmelden: `POST /api/v1/auth/logout`.

`WEBAUTHN_RP_ID` und `WEBAUTHN_ORIGIN` überschreiben die Vorgaben. Sonst gilt in Produktion `helpdesk.kmbcloud.at`, lokal `127.0.0.1` und `http://127.0.0.1:5173`.

## 11. Lokaler Admin

Bei `scripts/install.ts` einmalig abgefragt oder über Umgebungsvariable, die danach aus der Shell-History entfernt wird. Es gibt genau einen solchen Account. Das Passwort liegt als Argon2id-Hash.

`GET /api/v1/admin/staff` liest `HelpdeskAdmins`, gleicht sie über die E-Mail-Adresse ab und listet Konten, Skills und Kategorien ohne Passwort-Hash und ohne TOTP-Geheimnis. Der Name ist `cn`. `POST /api/v1/admin/directory/read` wiederholt den Abgleich. `POST /api/v1/admin/directory/deactivate` setzt ausgewählte Konten inaktiv, wenn sie nicht mehr in der Gruppe sind. Mitarbeiter werden nie gelöscht. `POST /api/v1/admin/password` ändert das eigene Passwort. `POST /api/v1/admin/staff/:id/mfa/reset` löscht TOTP, Passkeys und Sitzungen. `POST /api/v1/admin/staff/:id/access` ersetzt Skills und Kategorien.

Diese Routen verlangen den lokalen Admin, eine fertige Sitzung, den CSRF-Header und eine Adresse aus `192.168.36.0/24` oder `192.168.191.0/24`. Eine leere Liste verweigert in Produktion jeden Zugriff von außen. Jede Verbindung, deren Socket in `127.0.0.0/8` oder `::1` liegt, ist ohne Anmeldung frei, auch in Produktion. Eine weitergeleitete Adresse zählt dafür nicht. Steht ein Reverse-Proxy auf demselben Rechner, darf er öffentliche Besucher nicht als Verbindung von `127.0.0.1` an die API durchreichen.

`GET /api/v1/auth/session` sagt nur, ob die eigene Sitzung fertig ist und ob sie der lokale Admin ist.

`GET /api/v1/admin/notices` und `PATCH /api/v1/admin/notices/:code` pflegen den Meldungskatalog. `GET /api/v1/admin/configuration` zeigt jeden Wert mit Erklärung und Prüfung. Geheimnisse kommen nur als gesetzt oder fehlend zurück. `POST /api/v1/admin/configuration/value` speichert einen Wert. `POST /api/v1/admin/configuration/value/check` prüft den eingegebenen Wert, ohne ihn zu speichern. `POST /api/v1/admin/configuration/check` prüft erneut und löst die fehlgeschlagenen Meldungen aus. `POST /api/v1/admin/configuration/syslog` speichert Host, Port, APP-NAME und Facility. `POST /api/v1/admin/configuration/syslog/test` übergibt ein UDP-Datagramm an die eingegebene Adresse. Der gespeicherte Wert gilt vor der Umgebungsdatei. Anfangswert ist `192.168.191.215` Port `514`, Name `KMBHelp`, Facility `local0`. Das Format ist RFC 5424. Die Auslieferung steht in `ConfigDefaults.md`.

## 12. Prozessregeln

Die Formularseite `/mitarbeit/vorgaenge` ist entfernt. Die Schnittstellen der Vorgänge bleiben. Aus `127.0.0.0/8` ohne Anmeldung, sonst mit fertiger Mitarbeitersitzung.

- `POST /api/v1/staff/changes` speichert eine Änderung. Liegt der Termin in `change_freeze`, fehlt ohne `exceptionReason` die Speicherung (422). `POST .../approve` verlangt einen Rückfalltext.
- `POST /api/v1/staff/procurement` setzt den Weg aus `procurement_policy`: unter `directBelow` direkt, bis `tokenUntil` mit Einmal-Token, darüber `manual`. Der Token gilt 7 Tage. `POST /api/v1/procurement/decision` zeigt Artikel und Betrag und nimmt nur diese Entscheidung an.
- `POST /api/v1/staff/suppliers` legt einen Lieferanten als `draft` an. Freigabe braucht AVV-Datum und Verschwiegenheitsdatum. Fernwartung ohne diese Freigabe antwortet 422.
- `POST /api/v1/staff/backup-tests/:number/close` verlangt `restored` ja oder nein und legt das Folgeticket auf 90 Tage.
- `POST /api/v1/staff/security-incidents` setzt P1 und `deadline_at` auf 72 Stunden nach `detectedAt`.
- `POST /api/v1/staff/offboarding` verlangt den letzten Arbeitstag und legt die Checkliste an.
- `POST /api/v1/staff/certificates/remind` erzeugt je Zertifikat höchstens ein Ticket für 30 Tage und eines für 7 Tage.
- `POST /api/v1/staff/reviews/run` erzeugt offene Review-Tickets je Portal (180 Tage) und je Aufbewahrungsort (365 Tage) und löscht `access_log`-Zeilen, die älter als `ACCESS_LOG_RETENTION_DAYS` sind. Standard 90.

## 13. Datenbank

PostgreSQL 17. Eine Instanz, benutzt von API und Worker. Schema nur über Migrationen.

## 14. HTTP-API

Alle fachlichen Aktionen, die Web, App, Worker oder MCP auslösen, gehen durch `/api/v1`. Keine zweite Geschäftslogik in der Oberfläche.

Ressourcen mindestens:

- `POST /api/v1/tickets` anonym, begrenzt. Optional ein aktiver Mitarbeiter. Inaktive Mitarbeiter werden abgelehnt. Der Kalender dazu ist `GET /api/v1/staff/:id/availability`. Ohne Microsoft-365-Freigabe bleibt er unverbunden und erfindet keine Termine.
- `GET /api/v1/staff/assignable` nur aktive Mitarbeiter
- `GET /api/v1/tickets/public` Arbeitsliste mit Nummer, Betreff, den ersten drei Zeichen der Mitarbeiter-E-Mail, Status, Priorität, Alter und Fälligkeit. Kein Beschreibungstext, kein Absender, keine Kommentare. Ein inaktiver Mitarbeiter bleibt an vorhandenen Tickets sichtbar.
- `POST /api/v1/tickets/public/:number` schaltet offen und inaktiv, ändert die Priorität oder schließt dauerhaft
- `POST /api/v1/tickets/public/:number/ask` schickt von `GRAPH_MAILBOX` eine Rückfrage an den zugeordneten Mitarbeiter: Betreff `Ticket` plus Nummer, der sichtbare Text, der Link und der Satz „Benutzer fragt wann das gelöst ist“. Ohne Graph antwortet die API 503.
- `GET|PATCH /api/v1/staff/tickets`
- Der Header `X-Kmbhelp-Test-Staff` mit der E-Mail eines Staff-Kontos gilt nur, wenn `ALLOW_TEST_AUTH=1` gesetzt ist und `NODE_ENV` nicht `production` ist. In Produktion darf die Variable nicht gesetzt sein. Ohne diese Freigabe wird der Header ignoriert. Eine fertige Sitzung gilt auch ohne den Header.
- `POST /api/v1/staff/tickets/:id/comments`
- `POST /api/v1/staff/tickets/:id/close`
- Katalog, FAQ, Wissen, Dashboard-Zahlen, Admin-Zuordnung, Beschaffung, Änderungen, Backup-Tests, Sicherheitsvorfälle, Assets
- `GET /api/v1/health`

Staff-Routen: Session-Cookie, `Secure`, `HttpOnly`, `SameSite=Lax`, plus CSRF-Header.

## 15. MCP

`apps/mcp` spricht nur die versionierte HTTP-API. Der Dienst-Token `MCP_SERVICE_TOKEN` hat mindestens 16 Zeichen. Er ist kein Mitarbeiter, sieht die Kanzlei und wird keinem Ticket zugewiesen. Ein Vorgang über den Token hat keinen Bearbeiter. Der Token liegt nicht im Git. Cursor startet den Server aus dem Repository mit `.cursor/mcp.json`. Das Beispiel ist `.cursor/mcp.json.example`. Die echte Datei bleibt ignoriert. `KMBHELP_API_ORIGIN` zeigt auf die API.

Werkzeuge zum Lesen: `health`, `list_categories`, `list_staff_tickets`, `get_ticket`, `dashboard`, `list_processes`, `review_mail`. Werkzeuge für die Staff-Aktionen spiegeln die POST-Routen der Vorgänge. Es gibt keine SQL-Konsole und keinen Zugriff auf die Admin-Routen. `review_mail` schickt den Prompt nicht mit. Den besitzt der Server.

## 16. Apps

Expo-App für die Funktionen der Punkte 2, 3, 4 und 6 sowie das Dashboard (Punkt 7). Staff-Bereiche verlangen die Server-MFA und zusätzlich eine lokale Geräte-MFA (Biometrie oder Gerätecode), bevor Ticketinhalte gezeichnet werden. Öffentliches Erfassen ist ohne Konto möglich.

## 17. Installation

Siehe `ENTWICKLUNGSUMGEBUNG.md` und die vom Agenten zu schreibenden Dateien `docs/installation-linux.md` und `docs/mobile-stores.md`.

## 18. KI

Der Anbieter sitzt hinter `@kmbhelp/ai`. Ein Aufruf braucht `AI_ENDPOINT` (https), `AI_REGION` (EU), `AI_API_KEY` und `AI_AVV_REFERENCE`. Fehlt eines, bleibt die Suche beim Verhalten von Phase 2: Volltext und der Satz „Treffer wegen Kategorie/Titel“. `AI_PROVIDER` nennt den Anbieter, Auslieferung `grok`. Der Name wählt keine Adresse. Gemini und Deepseek verwenden denselben Aufruf mit einem anderen Namen und derselben `AI_ENDPOINT`.

Die Mailprüfung ist eine Funktion. `POST /api/v1/mail/review` und das MCP-Werkzeug `review_mail` rufen sie auf. Der Worker auch. Der Auftrag liegt in `AI_MAIL_PROMPT`. Die Antwort beginnt mit JA oder NEIN. Nur JA setzt `is_support` auf true. Die Funktion legt kein Ticket an. Das tut nur der Worker, und nur nach JA. Vorher prüft sie die Domäne aus `INTERNAL_MAIL_DOMAINS` und schließt `helpdesk`, das Postfach und aktive Mitarbeiter aus, ohne das Modell zu fragen. Eine unlesbare Antwort markiert die Mail als gelesen. Keine Antwort lässt sie ungelesen.

Vor dem Modell werden SVNR, IBAN, Kreditkartenmuster und offensichtliche Geburtsdaten maskiert. Die JSON-Entscheidung mit `category`, `priority`, `skill`, `confidence`, `auto_reply_allowed` und `faq_slug` folgt nur nach einem JA und steuert Kategorie, Priorität und die automatische FAQ. Die Entscheidung eines erzeugten Tickets wird als `ticket_event` `model_decision` gespeichert: Modellname, Eingabe-Hash, Ausgabe, ob automatisch geantwortet wurde. Der Tickettext steht nicht im Ereignis.

Jeder externe Schritt schreibt Syslog: Modellprüfung, Klassifikation, Abruf und Gelesen-Markierung bei Graph. Ohne Mailtext und ohne Schlüssel. Seitenaufrufe gehen an `POST /api/v1/activity` mit dem Pfad ohne Query. `GET /api/v1/staff/activity` listet `activity_log` für localhost oder einen angemeldeten Mitarbeiter. Query `from` und `to` sind `yyyy-mm-dd` in `+01:00`, `q` sucht in Akteur, Art, Ziel und Detail, `format` ist `txt`, `csv` oder `pdf`. Ohne Datum sind es die letzten 30 Tage. Die Datei daneben liegt unter `ACTIVITY_LOG_FILE` oder `%LOCALAPPDATA%\kmbhelp\activity.log`, nicht im Projektordner.

Automatisch geschlossen wird nur, wenn die Kategorie in `AI_AUTO_REPLY_CATEGORIES` steht, die Konfidenz mindestens 0,85 ist, das Modell zustimmt, der Text keine der maskierten Daten enthält und `faq_slug` eine veröffentlichte FAQ mit Text ist. Die Antwort ist dieser FAQ-Text plus die Ticketnummer. Sonst bleibt das Ticket beim Menschen. Eine Regel-Priorität wird vom Modell nicht herabgestuft.

`GET /api/v1/search` bleibt begrenzt. Öffentlich geht der Suchtext nicht an ein Modell und nicht ins Protokoll. Für einen angemeldeten Mitarbeiter kann das Modell einen Begründungssatz liefern. Treffer auf Tickets verlinken `/mitarbeit/ticket/{nummer}`. Der gespeicherte Suchsatz hängt am Hash der Anfrage, nicht am Klartext.

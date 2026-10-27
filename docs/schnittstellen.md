# Schnittstellen

Basis-URL Produktion: `https://helpdesk.kmbcloud.at`
API: `https://helpdesk.kmbcloud.at/api/v1`
OpenAPI: `https://helpdesk.kmbcloud.at/api/docs`
Gesundheit: `https://helpdesk.kmbcloud.at/api/health`

## 1. E-Mail

- Postfach `helpdesk@kmbcloud.at`.
- Abruf über Microsoft Graph (`Mail.Read`, `Mail.Send`, `Calendars.ReadWrite` als Application-Permission mit Admin-Consent). Der Takt steht in `WORKER_SCHEDULE`. Auslieferung: 00:00–08:00 alle 30 Minuten, 08:00–12:00 alle 10 Minuten, 12:00–12:30 nicht, 12:30–17:00 alle 10 Minuten, 17:00–24:00 alle 30 Minuten. Die Uhr ist `SYSLOG_UTC_OFFSET`. Der Prozess schreibt trotzdem etwa jede Minute einen Herzschlag, damit `GET /api/health` ihn nicht als ausgefallen wertet.
- Idempotenz über `internetMessageId`. Dieselbe Mail erzeugt nie ein zweites Ticket und keine zweite Antwort.
- Ohne KI-Anbieter gilt eine Regel: der längste Kategorie-Name im Betreff oder Text gewinnt. Trifft keiner zu, gilt `FALLBACK_CATEGORY`. Auslieferung ist `printer` (Drucker). Der Code muss in der Tabelle `category` stehen. Priorität kommt aus Frist und Wirkung. Die Zuordnung nimmt den ersten aktiven Mitarbeiter mit passender Kenntnis, der im Kalender frei ist. Der Termin beginnt `CALENDAR_DELAY_P1` (0), `CALENDAR_DELAY_P2` (60) oder `CALENDAR_DELAY_P3` (240) Minuten nach dem Anlegen. Ist der Platz belegt, rückt er in 30-Minuten-Schritten. Ohne Microsoft-365-Freigabe bleibt der erste passende Mitarbeiter, und es wird kein Termin erfunden.
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

- Nur Staff, Rolle `agent` sieht eigene Zahlen, Rolle `lead` und `admin` die Kanzlei.
- Umschalter: Tag, Woche, Monat, Quartal, Jahr.
- Eingänge, Erledigungen, offene P1, Medianzeit bis zur ersten Reaktion, Medianzeit bis zur Lösung, Aufwand in Minuten (Pflichtfeld beim Schließen).

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

## 12. Datenbank

PostgreSQL 17. Eine Instanz, benutzt von API und Worker. Schema nur über Migrationen.

## 13. HTTP-API

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

## 14. MCP

`apps/mcp` spricht die HTTP-API mit einem Dienst-Token der Rolle `automation`. Werkzeuge spiegeln die API, keine SQL-Konsole. Der Token liegt nicht im Git.

## 15. Apps

Expo-App für die Funktionen der Punkte 2, 3, 4 und 6 sowie das Dashboard (Punkt 7). Staff-Bereiche verlangen die Server-MFA und zusätzlich eine lokale Geräte-MFA (Biometrie oder Gerätecode), bevor Ticketinhalte gezeichnet werden. Öffentliches Erfassen ist ohne Konto möglich.

## 16. Installation

Siehe `ENTWICKLUNGSUMGEBUNG.md` und die vom Agenten zu schreibenden Dateien `docs/installation-linux.md` und `docs/mobile-stores.md`.

# Schnittstellen

Basis-URL Produktion: `https://helpdesk.kmbcloud.at`
API: `https://helpdesk.kmbcloud.at/api/v1`
OpenAPI: `https://helpdesk.kmbcloud.at/api/docs`
Gesundheit: `https://helpdesk.kmbcloud.at/api/health`

## 1. E-Mail

- Postfach `helpdesk@kmbcloud.at`.
- Abruf jede Minute über Microsoft Graph (`Mail.Read`, `Mail.Send` als Application-Permission mit Admin-Consent).
- Idempotenz über `internetMessageId`. Dieselbe Mail erzeugt nie ein zweites Ticket.
- Bewertung durch den KI-Dienst: Kategorie, Priorität, benötigte Kenntnis, ob eine FAQ-Antwort erlaubt ist.
- Zuordnung eines Menschen mit passender Kenntnis und freiem Kalenderfenster.
- Antwort an den Absender mit Ticketnummer. Einen Geheimlink gibt es nicht.
- Kalendereintrag beim Bearbeiter: Betreff ohne Mandantendetails wenn möglich, Körper mit Beschreibung und Link auf die Staff-Ticketseite, Dauer aus der Kategorie-Vorgabe.
- Einfache, erlaubte Antworten: Ticket auf erledigt, Mail an den Absender, Info-Mail an den IT-Mitarbeiter, Ereignis im Audit.
- Der Worker ist ein eigener systemd-Dienst `kmbhelp-worker`. Die Webseite funktioniert weiter, wenn der Worker steht; der Gesundheitsstatus zeigt das.

## 2. Benutzer-Web

- Ticket erfassen.
- Öffentliche Übersicht nach Abteilung nur in der reduzierten Form aus `docs/sicherheit.md`.
- Sprache aus `Accept-Language`, umschaltbar Deutsch / Englisch, weitere Sprachen als zusätzliche JSON-Dateien ohne Codeänderung. Wahl in einem Cookie `kmbhelp_lang`.
- Helligkeit in Cookie `kmbhelp_theme` (`light` oder `dark`), zusätzlich `prefers-color-scheme` als Startwert.
- Kein Cookie-Banner. Es werden nur technisch nötige Cookies gesetzt (Sprache, Theme). Das ist eine Produktentscheidung der Kanzlei; die Software lädt keine Tracker.
- Kopfzeile: links Logo KMB, dann `www` nach `https://kmb-steuerberatung.at`, `Home` nach `https://home.kmbcloud.at`, `Wiki` nach `https://wiki.kmbcloud.at`. Rechts von Wiki ein kleines Suchfeld ohne Beschriftung, der Knopf ist eine Lupe. Danach kleine Flaggen für Deutsch und Englisch, dann Sonne und Mond für Hell und Dunkel, links von Malama. Ziel von Malama ist `https://malama.at`. Externe Links öffnen ein neues Fenster. Dieselbe Hintergrundfarbe trägt den Balken darunter mit `KMBHelp` und dem Satz „IT Helpdesk für die KMB Steuerberatung“. Darunter, nah am Balken, liegen „Ticket erfassen“ und „Anleitungen“.
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

Wie in `docs/sicherheit.md`. Domäne `kmbcloud.at`, Server `MADC1.kmbcloud.at`, Gruppe `Helpdesk`.

## 11. Lokaler Admin

Bei `scripts/install.ts` einmalig abgefragt oder über Umgebungsvariable, die danach aus der Shell-History entfernt wird. Es gibt genau einen solchen Account.

## 12. Datenbank

PostgreSQL 17. Eine Instanz, benutzt von API und Worker. Schema nur über Migrationen.

## 13. HTTP-API

Alle fachlichen Aktionen, die Web, App, Worker oder MCP auslösen, gehen durch `/api/v1`. Keine zweite Geschäftslogik in der Oberfläche.

Ressourcen mindestens:

- `POST /api/v1/tickets` anonym, begrenzt
- `GET /api/v1/tickets/public` Arbeitsliste mit Nummer, Betreff, Status, Priorität, Alter und Fälligkeit. Kein Beschreibungstext, kein Absender, keine Kommentare
- `POST /api/v1/tickets/public/:number` schaltet offen und inaktiv, ändert die Priorität oder schließt dauerhaft
- `GET|PATCH /api/v1/staff/tickets`
- Bis Phase 3 authentifiziert der Header `X-Kmbhelp-Test-Staff` mit der E-Mail eines Staff-Kontos, und nur wenn `ALLOW_TEST_AUTH=1` gesetzt ist und `NODE_ENV` nicht `production` ist. In Produktion darf die Variable nicht gesetzt sein. Ohne diese Freigabe wird der Header ignoriert.
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

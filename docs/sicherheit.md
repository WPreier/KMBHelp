# Sicherheit, Verschwiegenheit, Nachweis

Organisatorische Orientierung für die Software. Keine Rechtsberatung. WTBG (Österreich), DSGVO und — falls deutsche Mandanten geführt werden — GoBD bleiben Sache der Kanzlei.

## Grundsatz

Tickets können Mandantennamen, Lohnarten, SV-Nummern oder FinanzOnline-Bezüge enthalten, sobald ein Mensch sie hineinschreibt. Die Software darf das nicht noch verbreiten.

## Abweichung von „alles ohne Anmeldung lesbar“

Die Wunschvorgabe, Benutzerseiten und Tickets ohne Authentifizierung und auch anonym vollständig zu zeigen, widerspricht der Verschwiegenheit, sobald in einem Betreff ein Mandant steht.

Verbindlich für die Umsetzung:

| Oberfläche | Ohne Anmeldung | Mit Staff-Anmeldung |
|---|---|---|
| Ticket anlegen (Web, App) | ja, mit Ratenlimit | ja |
| Liste offener Tickets nach Abteilung | Eine Zeile je Ticket mit Köpfen ID, Text, Alter, Ablauf bis, dazu Offen, Priorität und Erledigt. Kein Beschreibungstext, kein Absender, keine Kommentare | volle Arbeitsliste |
| Ticketdetail mit Beschreibung | nein. Es gibt keinen Geheimlink | ja |
| Kommentare, Anhänge, KI-Begründung | niemals öffentlich | ja, nach Rolle |
| FAQ | ja, redaktionell freigegeben | ja |
| Gelöste Tickets als Wissen | nur redigierte Artikel, nie der Roh-Tickettext | Rohtext nur Staff |
| Dashboard, Admin, Zuordnung, Kalender | nein | ja |
| API-Schreibzugriffe auf fremde Tickets | nur Status und Priorität der öffentlichen Liste, siehe unten | ja |

Anonim anlegen bleibt möglich. Die IP wird gespeichert. Eine E-Mail für einen Geheimlink wird nicht abgefragt. Den Geheimlink gibt es nicht. Die Nummer steht in der öffentlichen Liste. Beschreibung, Absender und Kommentare bleiben dort unsichtbar. Datumseingaben haben die Form `dd.MM.yyyy`. Die Prioritäten heißen in der Oberfläche „Sehr wichtig“, „bitte heute noch“ und „bei Gelegenheit“.

Die öffentliche Arbeitsliste kennt die Status `open`, `inactive`, `expired` und `closed`. Weitere Status bleiben für spätere Prozesse. Ein offenes Ticket mit Fälligkeit vor heute wird `expired`. Die Checkbox setzt `open` auf `inactive`. Ist es `inactive`, öffnet sie es wieder und speichert, dass alle zu informieren sind. Ist Graph konfiguriert, legt der Worker die Mail an alle aktiven Mitarbeiter als Entwurf im Ordner Entwürfe ab. Sonst bleibt das Ereignis stehen, bis die Werte gesetzt sind. Es wird nichts verschickt. `expired` und `closed` schaltet die Checkbox nicht um. Der Knopf Erledigt setzt `closed`. Ein geschlossenes Ticket kann nicht wieder geöffnet werden. Die Priorität in der Liste ist eine spätere menschliche Änderung und wird als Ereignis festgehalten.

## IP-Adressen

- Tabelle `access_log`: Zeitpunkt, IP, Pfad, Methode, Ticket-Id falls vorhanden, User-Agent gekürzt.
- Zweck: Missbrauch nachvollziehen.
- Aufbewahrung: 90 Tage, dann löschen. Konfigurierbar, nicht unendlich.
- Keine Anzeige von IPs auf öffentlichen Seiten.
- Eintrag ins Verzeichnis der Verarbeitungstätigkeiten ist Aufgabe der Kanzlei, die Software liefert den Export.

## Anmeldung Staff

1. Erste Anmeldung: E-Mail, Passwortprüfung per LDAPS gegen `kmbcloud.at` auf `MADC1.kmbcloud.at`, Konto aktiv, Mitglied der Gruppe `HelpdeskAdmins`. Der Gruppenpfad ist `kmbcloud.at/kmb/Sicherheitsgruppen/HelpdeskAdmins`, der LDAP-DN `CN=HelpdeskAdmins,OU=Sicherheitsgruppen,OU=kmb,DC=kmbcloud,DC=at`.
2. Unmittelbar danach Passkey (WebAuthn) oder TOTP. Ohne abgeschlossene MFA kein Zugang zu Admin, Dashboard oder Ticketinhalt.
3. Jede spätere Anmeldung: E-Mail plus Passkey oder TOTP. Zusätzlich prüft ein Dienstkonto, dass das AD-Konto noch aktiv und in `HelpdeskAdmins` ist. Sonst bleibt ein ausgeschiedener Mitarbeiter über seinen Passkey im System.
4. AD-Passwörter werden nie gespeichert, nie geloggt, nie an die KI gegeben.
5. Ein lokales Admin-Konto, Benutzername bei der Installation festgelegt, Passwort Argon2id. Es setzt MFA zurück und pflegt Kenntnisse. Es ist kein Alltags-Agent. Das Passwort ist vorgegeben und kann auf der Website nicht geändert werden. `POST /api/v1/admin/password` antwortet mit 403. Der Klartext steht in keiner Datei. Der Argon2id-Hash liegt in der Datenbank, Tabelle `staff`, Spalte `password_hash`. Angelegt wird er mit `pnpm install:helpdesk`, solange `LOCAL_ADMIN_PASSWORD` in der Shell steht. Danach wird die Variable nicht gespeichert. Andere Geheimnisse, darunter das Passwort des Verzeichnis-Dienstkontos, liegen in der Entwicklung in `%LOCALAPPDATA%\kmbhelp\secrets.json` und in Produktion in `/etc/kmbhelp/kmbhelp.env`.

Admin-Oberflächen zusätzlich nur aus `192.168.36.0/24` und `192.168.191.0/24`, dort mit Anmeldung. Jede Verbindung, deren Socket in `127.0.0.0/8` oder `::1` liegt, öffnet Verwaltung und Konfiguration ohne Passwort, Passkey oder Einmalcode. Das gilt auch in Produktion. Eine Adresse in `X-Forwarded-For` zählt dafür nicht: nur der Socket entscheidet. Die API hört in der Entwicklung auf `127.0.0.1`. Ein Reverse-Proxy auf demselben Rechner darf öffentliche Besucher deshalb nicht als Verbindung von `127.0.0.1` durchreichen, sonst sähe die API jeden Besucher als localhost. Die Linux-Beispiele setzen `API_HOST` auf die interne Adresse des Servers und lassen den Proxy dieselbe Adresse verwenden. Dateien und Ablauf stehen in `docs/installation-linux.md`. Ein IP-Filter allein ist außerhalb von localhost kein Zugangsschutz.

Systemmeldungen gehen zusätzlich als RFC-5424-Syslog per UDP an den Server, den der lokale Admin auf der Konfigurationsseite speichert. Der APP-NAME ist `KMBHelp`, die Facility `local0`, der Empfänger zuerst `192.168.191.215` Port `514`. Die Uhrzeit trägt `+01:00`, nicht `Z`. Der HOSTNAME der Zeile ist der Rechnername. Kategorien sind Informational, Warning und Error. Eine ignorierte Meldung wird nicht ausgelöst. Der Text enthält kein Passwort und kein Zertifikat.

Die Verwaltung liest `HelpdeskAdmins` und gleicht sie über die E-Mail-Adresse mit der Datenbank ab. Der angezeigte Name kommt aus `cn`. Neue Mitglieder werden angelegt. Wer nur noch in der Datenbank steht, kann deaktiviert werden. Die Anwendung löscht Mitarbeiter-Zeilen nicht. Die Testfabrik entfernt nur Zeilen, die ein Test selbst angelegt hat, und nur außerhalb von Produktion.

## KI

- Eine Mail an `helpdesk@kmbcloud.at` geht an den lokalen Ollama-Server `OLLAMA_URL`, Modell `OLLAMA_MODEL`. Auslieferung ist `http://192.168.191.131:11434` und `qwen2.5:7b`. Jeder Absender wird geprüft. Der Auftrag und die Mail, nur mit `From`, `To`, `Cc`, `Date`, `Subject`, `Message-ID`, `In-Reply-To`, `References` und dem maskierten Text, gehen direkt an `POST /api/chat`. Das ist kein API-Endpunkt von KMBHelp und kein MCP-Werkzeug. Eine Abfrage wartet höchstens 5 Minuten. SUPPORT legt ein Ticket an, erzeugt die genannte Kategorie, wenn sie fehlt, und setzt P1, P2 oder P3 nur bei einer eindeutigen Wichtigkeit. Fehlt sie, fragt der Worker einmal nach. Bleibt sie unklar, gilt die Rechnung aus Wirkung. ANTWORT hängt den Text an das Ticket aus der Nummer oder aus `In-Reply-To`. ABSCHLUSS schließt das letzte offene Ticket desselben Absenders. FREMD und SPAM werden gelesen markiert und erzeugen kein Ticket. Dauert eine Abfrage zu lange, geht eine Fehlermail an `MAIL_ERROR_TO` (`helpdesk@ppc.at`) und die Mail wird ein Ticket mit P3 und `FALLBACK_CATEGORY`. Ist der Server nicht erreichbar, bleibt die Mail ungelesen. Eine unlesbare Antwort wird nach einer Wiederholung gelesen markiert.
- `AI_ENDPOINT` prüft Mails nicht mehr. `AI_PROVIDER` und `AI_MAIL_PROMPT` bleiben Felder der Konfiguration und wählen den Mailserver nicht. Microsoft 365 Copilot ist damit nicht ausgewählt. Der Prüfstand vom 28.10.2026 steht in `docs/schnittstellen.md`.
- Jeder Aufruf nach außen, also Modell und Microsoft Graph, schreibt eine Syslog-Zeile ohne Mailtext und ohne Schlüssel. Jeder Seiten- und Mailzugriff schreibt eine Zeile in `activity_log` und, außerhalb des Projektordners, nach `%LOCALAPPDATA%\kmbhelp\activity.log`. Darin stehen Zeitpunkt, Akteur, Art, Ziel, ein kurzer Entscheid und die IP. Kein Mailtext. `/verwaltung/protokoll` zeigt das einem angemeldeten Mitarbeiter oder localhost und kann nach Datum und Suchtext filtern und als Text, CSV oder PDF ausgeben.
- Vor dem Modell: SVNR, IBAN, Kreditkartenmuster, offensichtliche Geburtsdaten maskieren.
- Vertrag: Auftragsverarbeitung, keine Verwendung zu Trainingszwecken, Verarbeitungsort EU, soweit der gewählte Anbieter das hergibt. Vor der ersten echten Ticketmail den Anbieter festlegen. Nicht still auf einen Consumer-Endpunkt gehen.
- Automatisch schließen nur wenn: Kategorie auf der Allowlist, Konfidenz ab Schwellwert (Start 0.85), keine personenbezogenen Mandantendaten mehr im Text, Antwort aus einem freigegebenen FAQ-Baustein. Sonst Mensch. Eine eingehende Helpdesk-Mail löst dieses Schließen nicht aus.
- Jede KI-Entscheidung als `ticket_event` speichern: Modell, Zeitpunkt, Eingabe-Hash, Ausgabe, ob automatisch geantwortet wurde.

## Weitere Mindestregeln in der Software

1. Jeder Vorfall hat ein Ticket, auch Anruf und „kurz im Vorbeigehen“. Dafür gibt es die Quelle `phone` und `walkin`.
2. Kein gemeinsames Agenten-Passwort. Admin-Konten der Fachsoftware sind nicht Gegenstand dieser App, aber das Wissensartikel-Muster „getrennte Adminkonten“ ist Pflichtinhalt.
3. Offboarding-Checkliste ist ein Request-Typ mit Sperrliste und Fälligkeit „letzter Arbeitstag“, nicht ein Freitext.
4. Berechtigungsreview: wiederkehrende Aufgabe, Intervall 180 Tage, erzeugt Tickets pro System.
5. Änderungsstopp: konfigurierbare Fenster. Vorschlag zum Start, änderbar: Werktage 1.–5. (Lohnvorlauf) und ein gepflegter Abgabeterminkalender. Eine Änderung in einem Stoppfenster braucht eine begründete Ausnahme, die im Ticket steht.
6. Backup-Test: eigener Vorgang mit Datum, Was wurde zurückgespielt, Ergebnis, nächster Termin in 90 Tagen.
7. Sicherheitsvorfall: Feld `detected_at`, abgeleitete Frist `detected_at + 72h`, Status offen bis Geschäftsführung und Datenschutz als informiert markiert sind. Die App ersetzt nicht die Meldung.
8. Anhänge: Typallowlist, Größenlimit, kein Ausführen. Hinweis in der Oberfläche: keine Mandantenbelege in den Helpdesk, dafür den freigegebenen Mandantenkanal.
9. Rate-Limit auf anonyme POST-Endpunkte und auf die KI-Suche.
10. Audit-Ereignisse sind append-only. Kein Update, kein Delete aus der Anwendung heraus. Die einzige Ausnahme ist eine Fehlinterpretation: genau dieses Ticket aus einer Mail wird gelöscht, der Grund bleibt in `mail_lesson`, und künftig erzeugt diese Mail kein Ticket. Alle anderen Ereignisse bleiben append-only.

## Nachweise, die ein Ticket erzeugen können muss

Zeitstempel, Wer, Quelle (mail, web, app, phone, walkin, api), Priorität und Begründung, Bearbeiter, jede Statusänderung, Kalendereintrag-Id, ob KI geantwortet hat, Schließung, Wiedereröffnung.

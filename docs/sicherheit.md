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
| Liste offener Tickets nach Abteilung | Eine Zeile je Ticket: Nummer, Betreff, Alter, „Ablauf bis“, Offen, Priorität, Erledigt. Kein Beschreibungstext, kein Absender, keine Kommentare | volle Arbeitsliste |
| Ticketdetail mit Beschreibung | nein. Es gibt keinen Geheimlink | ja |
| Kommentare, Anhänge, KI-Begründung | niemals öffentlich | ja, nach Rolle |
| FAQ | ja, redaktionell freigegeben | ja |
| Gelöste Tickets als Wissen | nur redigierte Artikel, nie der Roh-Tickettext | Rohtext nur Staff |
| Dashboard, Admin, Zuordnung, Kalender | nein | ja |
| API-Schreibzugriffe auf fremde Tickets | nur Status und Priorität der öffentlichen Liste, siehe unten | ja |

Anonim anlegen bleibt möglich. Die IP wird gespeichert. Eine E-Mail für einen Geheimlink wird nicht abgefragt. Den Geheimlink gibt es nicht. Die Nummer steht in der öffentlichen Liste. Beschreibung, Absender und Kommentare bleiben dort unsichtbar. Datumseingaben haben die Form `dd.MM.yyyy`. Die Prioritäten heißen in der Oberfläche „Sehr wichtig“, „bitte heute noch“ und „bei Gelegenheit“.

Die öffentliche Arbeitsliste kennt die Status `open`, `inactive`, `expired` und `closed`. Weitere Status bleiben für spätere Prozesse. Ein offenes Ticket mit Fälligkeit vor heute wird `expired`. Die Checkbox setzt `open` auf `inactive`. Ist es `inactive`, öffnet sie es wieder und speichert, dass alle zu informieren sind. Der Versand dieser Nachricht folgt mit der Mail in Phase 4. `expired` und `closed` schaltet die Checkbox nicht um. Der Knopf Erledigt setzt `closed`. Ein geschlossenes Ticket kann nicht wieder geöffnet werden. Die Priorität in der Liste ist eine spätere menschliche Änderung und wird als Ereignis festgehalten.

## IP-Adressen

- Tabelle `access_log`: Zeitpunkt, IP, Pfad, Methode, Ticket-Id falls vorhanden, User-Agent gekürzt.
- Zweck: Missbrauch nachvollziehen.
- Aufbewahrung: 90 Tage, dann löschen. Konfigurierbar, nicht unendlich.
- Keine Anzeige von IPs auf öffentlichen Seiten.
- Eintrag ins Verzeichnis der Verarbeitungstätigkeiten ist Aufgabe der Kanzlei, die Software liefert den Export.

## Anmeldung Staff

1. Erste Anmeldung: E-Mail, Passwortprüfung per LDAPS gegen `kmbcloud.at` auf `MADC1.kmbcloud.at`, Konto aktiv, Mitglied der Gruppe `Helpdesk`.
2. Unmittelbar danach Passkey (WebAuthn) oder TOTP. Ohne abgeschlossene MFA kein Zugang zu Admin, Dashboard oder Ticketinhalt.
3. Jede spätere Anmeldung: E-Mail plus Passkey oder TOTP. Zusätzlich prüft ein Dienstkonto, dass das AD-Konto noch aktiv und in `Helpdesk` ist. Sonst bleibt ein ausgeschiedener Mitarbeiter über seinen Passkey im System.
4. AD-Passwörter werden nie gespeichert, nie geloggt, nie an die KI gegeben.
5. Ein lokales Admin-Konto, Benutzername bei der Installation festgelegt, Passwort Argon2id. Es setzt MFA zurück und pflegt Kenntnisse. Es ist kein Alltags-Agent.

Admin-Oberflächen zusätzlich nur aus dem internen Netz (`ADMIN_IP_ALLOWLIST`). Authentifizierung bleibt Pflicht. Ein IP-Filter allein ist kein Zugangsschutz.

## KI

- Vor dem Modell: SVNR, IBAN, Kreditkartenmuster, offensichtliche Geburtsdaten maskieren.
- Vertrag: Auftragsverarbeitung, keine Verwendung zu Trainingszwecken, Verarbeitungsort EU, soweit der gewählte Anbieter das hergibt. Vor der ersten echten Ticketmail den Anbieter festlegen. Nicht still auf einen Consumer-Endpunkt gehen.
- Automatisch schließen nur wenn: Kategorie auf der Allowlist, Konfidenz ab Schwellwert (Start 0.85), keine personenbezogenen Mandantendaten mehr im Text, Antwort aus einem freigegebenen FAQ-Baustein. Sonst Mensch.
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
10. Audit-Ereignisse sind append-only. Kein Update, kein Delete aus der Anwendung heraus.

## Nachweise, die ein Ticket erzeugen können muss

Zeitstempel, Wer, Quelle (mail, web, app, phone, walkin, api), Priorität und Begründung, Bearbeiter, jede Statusänderung, Kalendereintrag-Id, ob KI geantwortet hat, Schließung, Wiedereröffnung.

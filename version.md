# Version

Aktueller Stand: **V 0.2.12**

| | |
|---|---|
| Datum | 07.11.2026 |
| Commit | dieser Stand, Branch `phase/12-haerten` |
| Branch | `phase/12-haerten` |
| Datei auf dem Server | `/opt/kmbhelp/version.md` |

## Zählung

Die Fassung wird `V 0.1.1` geschrieben. Die drei Stellen sind Major, Minor und Patch.

| Stelle | Name | Wann sie steigt |
|---|---|---|
| 0 | Major | Erst wenn der Kunde tatsächlich mit KMBHelp arbeitet. |
| 2 | Minor | Nur wenn Wolfgang das ausdrücklich sagt. Am 07.11.2026 hat er die Minor 2 freigegeben. |
| 12 | Patch | Bei jedem Update, das auf den Server `kmbhelp` kommt. Der Patchstand läuft weiter und beginnt nicht wieder bei 0. |

Ein Update ist ein Commit, der auf `kmbhelp` eingespielt wird. Im selben Commit steht der neue Abschnitt in dieser Datei. Die nächste Änderung wird **V 0.2.13**. Die Minor-Stelle bleibt 2, bis Wolfgang eine weitere Minor freigibt. Die Major-Stelle bleibt 0, bis der Kunde damit arbeitet. Die erste Major danach heißt **V 1.0.0**.

Gezählt wird nur diese Datei. Die `version` in `package.json` bleibt `0.0.0` und ist keine Kundenfassung.

## Änderungen

### V 0.2.12 — 07.11.2026

Phase 11 ist abgeschlossen. Phase 12 härtet die App und prüft sie im Betrieb. Die Dienste stehen auf der Seite Tests. KI-Mailtest prüft eine E-Mail mit derselben Ollama-Schnittstelle wie der Worker und nennt die Dauer in Sekunden. Die Helpdesk-Mailbox zeigt ungelesene Nachrichten mit den Feldern der KI-Prüfung. T öffnet den Mailtest, U/G setzt gelesen oder ungelesen. Beides ist nur für Administratoren.

### V 0.1.11 — 07.11.2026

`.env.example` und `infra/kmbhelp.env.example` nennen jeden aktuellen Konfigurationsschlüssel. Geheimnisse bleiben leer. Die Arbeitsplatzvorlage benutzt `127.0.0.1` und `http://127.0.0.1:5173`. Die Servervorlage benutzt die interne Adresse und `https://helpdesk.kmbcloud.at`. Die echten Dateien `.env` und `/etc/kmbhelp/kmbhelp.env` werden nicht ersetzt.

### V 0.1.10 — 07.11.2026

Die Dienste stehen am Anfang der Konfiguration. Der Knopf T prüft den jeweiligen Dienst sofort. Die Blöcke Syslog-Server und Lokaler SMTP sind dort entfernt. Nach der Anmeldung nennt die Seite Rolle und E-Mail, darunter steht Abmelden. Der QR-Code und der lesbare Code gehören zum angemeldeten Konto. Das Passkey-Feld nutzt die E-Mail darüber. Teste Passkey jetzt prüft die Zahl. Anmeldung, Prüfung und Abmeldung gehen ins Protokoll und per Syslog. `LOG_ROTATE_DAYS` benennt die Protokolldateien alle 30 Tage um.

### V 0.1.9 — 07.11.2026

Die Anmeldeseite nennt den langen Hinweis zu Domänen und Ticketrechten nicht mehr. Der Passkey-Satz sagt Windows Konto. Der QR-Code steht unter dem Knopf Mit Passkey anmelden.

### V 0.1.8 — 07.11.2026

Jedes Konto aus `EMAIL_AUTH_DOMAINS` meldet sich mit dem Active-Directory-Passwort an. Die Gruppe helpdesk oder HelpdeskAdmins ist Administrator und sieht alle Tickets. Andere Konten sind Benutzer, sehen nur eigene Tickets und können sie nicht schließen. Mails an den Mitarbeiter nennen „Ausgelöst durch“ und den Namen. Das Cookie gilt 30 Tage und wird erneuert, wenn es älter als einen Tag ist. Abmelden löscht Cookie und Sitzung. Ohne Anmeldung bleibt nur die Anmeldeseite. Ein QR-Code öffnet die Passkey-Anmeldung, nachdem das Konto einmal angemeldet war.

### V 0.1.7 — 07.11.2026

Auf der Ticketseite steht die Checkbox ohne Beschriftung und in normaler Größe links neben PDF erstellen. Ist sie gesetzt, lautet der Hinweis „Setze Ticket inaktiv“, sonst „Aktiviere Ticket“. Der Link Index ist von dieser Seite entfernt.

### V 0.1.6 — 07.11.2026

Das Menü heißt Dashboard, Ticket erfassen, Meine offenen Tickets, Alle offenen Tickets, Abgeschlossene Tickets. Meine offenen Tickets zeigt nur die offenen Tickets des angemeldeten Helpdesk-Kontos. Ticket abschließen speichert zuerst und fragt, ob das Ticket geschlossen werden soll. Die Checkbox Ticket offen setzt aktiv oder inaktiv sofort in der Datenbank.

### V 0.1.5 — 06.11.2026

Die Mitarbeiterauswahl liest die aktiven Helpdesk-Konten aus der Datenbank und nicht aus dem Active Directory. Auf der Ticketseite speichert eine Änderung nur diese Adresse und schickt dem neuen Mitarbeiter die Übertragungsmail. Der Knopf M sendet dieselbe Rückfrage wie die Liste. PDF erstellen lädt dasselbe PDF wie der Abschluss herunter, ohne das Ticket zu schließen. Verwerfen lädt den Text neu. Die Wiki-Knöpfe erklären sich beim Darüberfahren. Der Link Index öffnet die Archivseite.

### V 0.1.4 — 06.11.2026

Jedes Ticket speichert die E-Mail-Adresse des Mitarbeiters. Sie steht in den offenen und abgeschlossenen Listen, beim Erfassen und beim Ändern. Fehlt eine Zuordnung, steht `helpdesk@kmbcloud.at`.

### V 0.1.3 — 06.11.2026

Anhänge werden vor dem Hochladen auf Typ und Größe geprüft und danach auf den Inhalt. Die Grenzen stehen in `TICKET_FILE_TYPES` und `TICKET_FILE_MAX_BYTES`. Die Konfiguration ist alphabetisch sortiert. `OLLAMA_` heißt `MAILCHECK_KI_`, `SMTP_` heißt `MAIL_SMTP_`, `NOTICE_` heißt `MAIL_NOTICE_DIGEST`, `AI_MAIL_` heißt `MAIL_AI_` und die übrigen `AI_` heißen `SEARCH_AI_`. Ein alter Name gilt weiter, solange der neue Name leer ist. Offene Tickets ist der erste Menüpunkt. Das KI-Protokoll zeigt Auftrag und Antwort getrennt und die Antwortzeit in Sekunden.

### V 0.1.2 — 06.11.2026

Die sichtbare Ticketnummer ist die zweistellige Jahreszahl, ein Bindestrich und vier Stellen, zum Beispiel `26-0091`. Fertig merkt den Abschluss vor. An Werktagen um 23:00 Uhr schreibt der Worker das Archiv nach `/var/lib/kmbhelp/archiv/{code}/`, inklusive `index.html`. Die Ticketseite zeigt den Text formatiert, speichert ihn, und nennt Änderungszeit und letzten Bearbeiter. Die Liste Abgeschlossene Tickets zeigt Fazit und Summary. Die Suche hat die Bereiche Fazit, Summary und Ticket.

### V 0.1.1 — 06.11.2026

Erste geführte Fassung. Der Server läuft auf Commit `e2cad45`.

Am 06.11.2026 schreibt jeder Graph-Zugriff auf `helpdesk@kmbcloud.at` eine Zeile nach `mail.log`: Posteingang, Gelesen, Entwurf, Versand und die Kalenderabfrage, mit Postfach, Dauer und Ergebnis. Betreff und Empfänger stehen bei Entwurf und Versand dabei. Jede Anfrage an das Modell schreibt nach `ki.log`: Host, Modell, Dauer, HTTP-Status, Antwort und den maskierten Auftrag. Die Protokollseite zeigt die vier Dateien Aktivität, Fehler, Mail und KI, jede mit CSV und PDF.

Darin enthalten ist die bisherige Arbeit seit dem 26.10.2026:

| Datum | Commit | Was dazukam |
|---|---|---|
| 26.10.2026 | `fbb170c` | Ticket-Schema, Katalog und Prioritätsregel |
| 26.10.2026 | `783c0a5` | Öffentliche Ticketseiten und die Arbeitsliste |
| 26.10.2026 | `0e005fb` | Öffentliche Seite an die Firmenliste angepasst |
| 26.10.2026 | `1e3956b` | Sprache, Darstellung und Zurücksetzen in der Kopfzeile |
| 26.10.2026 | `4ca2d99` | Mitarbeiter-Anmeldung, Startprüfung und Hinweise |
| 27.10.2026 | `418879c` | Syslog in Ortszeit, inaktive Mitarbeiter bekommen keine neuen Tickets |
| 27.10.2026 | `38291b0` | Geplanter Mailabruf und Kalendertermin |
| 27.10.2026 | `7baeda2` | Regeln für Freeze, Beschaffung und Prüfungen |
| 27.10.2026 | `4205f6c` | Prüfung der Support-Mail und Zugriffsprotokoll |
| 27.10.2026 | `15d74c1` | Dashboard zeigt jedes Ticket einmal |
| 28.10.2026 | `6cff376` | MCP-Dienst, Testreste entfernt |
| 28.10.2026 | `21929c8` | Bearbeitung durch Mitarbeiter, Ausgang bleibt Entwurf |
| 28.10.2026 | `d2fafe3` | Linux-Installation und Betriebsskizze |
| 28.10.2026 | `44b6d9a` | Linux-Anleitung abgenommen |
| 28.10.2026 | `a8d03c2` | Expo-App mit Gerätesperre vor dem Mitarbeiterdetail |
| 28.10.2026 | `8396afc` | App wird aus dem App-Ordner geladen |
| 28.10.2026 | `7db4a99` | App-Formular entspricht der Website |
| 28.10.2026 | `9aece10` | Büro bearbeitet Kenntnisse und Kategorien |
| 29.10.2026 | `3553512` | Mailprüfung über den lokalen Ollama-Server, Modell `qwen2.5:7b` |
| 03.11.2026 | `ee26129` | Tagesmail der offenen Warnungen, Postfix in der Gesundheitsprüfung |
| 03.11.2026 | `28e79fa` | Migration liest die Server-Umgebung |
| 03.11.2026 | `a6eaec3` | Grund einer fehlgeschlagenen Anmeldung, API-Fehler im Protokoll |
| 03.11.2026 | `936740e` | QR-Code für den Einmalcode, lokaler Admin im Büro ohne Einmalcode |
| 03.11.2026 | `4631a93` | Neuer Domänencode sofort, lokaler Admin in der Verwaltung |
| 03.11.2026 | `dedc119` | `install:helpdesk` ersetzt den vorhandenen lokalen Admin |
| 03.11.2026 | `da0a5a1` | `activity.log`, `error.log` und `mail.log`, die Antwort wartet nicht |
| 03.11.2026 | `5f7d4f3` | Dienststatus im Dashboard, Protokolltabellen, Katalogübertragung |
| 03.11.2026 | `e8f4354` | Katalogimport nimmt den Dateipfad nach `--` an |
| 04.11.2026 | `3ed5890` | Mitarbeiterliste nur noch mit Anmeldung, localhost oder Diensttoken |
| 06.11.2026 | `e2cad45` | Postfachzugriff in `mail.log`, Modellanfrage ausführlich in `ki.log` |

# Anfrage — IT-Helpdesk KMBHelp

Baue einen IT-Helpdesk für interne Benutzer der KMB Steuerberatung und Partner GmbH. Das ist eine KMU-Steuerkanzlei mit Lohnverrechnung.

## Zusammenfassung

- Umfangreiche IT-Helpdesk-App für KMB Steuerberatung & Partner GmbH. Markenname: KMBHelp
- Tickets werden per Mail oder im Browser erstellt
- Mit einer Web-App, einer Smartphone-App oder per E-Mail können Tickets angezeigt und bearbeitet werden

Die Kanzlei verarbeitet fremde Steuer- und Lohndaten unter berufsrechtlicher Verschwiegenheit (in Österreich vor allem WTBG) plus DSGVO. Ein Ausfall am Lohnlauf oder an einem Abgabetag ist kein Komfortproblem, sondern ein Mandats- und Haftungsrisiko. Der Helpdesk muss deshalb Fristen, Berechtigungen und Nachweisbarkeit genauso behandeln wie „Drucker geht nicht“.

Sprachen: Deutsch, Englisch, weitere nach Bedarf zum Umschalten.

## Prozesse, die abgebildet sein müssen

| Prozess | Warum gerade hier | Was der Helpdesk konkret tut |
| --- | --- | --- |
| **Störungsmanagement** | Lohnlauf, UVA, FinanzOnline, ELDA und Scanner dürfen nicht liegen bleiben | Ticket mit Auswirkung: blockiert der Vorfall eine Abgabe oder nur einen Arbeitsplatz? |
| **Anforderungen (Service Requests)** | Zugänge, Geräte, Lizenzen, Portal-User, Virenscanner | Standardkatalog statt Freitext: neuer User, Recht erweitern, Laptop, Scanplatz |
| **Identität und Berechtigungen (Joiner–Mover–Leaver)** | Need-to-know ist Berufspflicht, nicht Nice-to-have | Konto anlegen, Rolle nach Aufgabe und Mandat, am letzten Tag alles sperren |
| **Fernwartung und externe IT** | AVV allein reicht berufsrechtlich nicht | Eigener Admin-Account, MFA, Verschwiegenheitsvereinbarung, Zugriff nur auf Zuruf und protokolliert |
| **Änderungen und Patches** | Updates von BMD, RZL, DATEV, Agenda, Windows, M365 | Kein Update in der Lohnwoche; Test, Fenster, Rückfall |
| **Backup und Wiederherstellung** | Datenverlust bei Lohn- und Buchhaltungsdaten ist existenzkritisch | Täglich, getrennt vom Netz (3-2-1), Wiederherstellung mindestens quartalsweise testen |
| **Sicherheits- und Datenschutzvorfall** | Ransomware, Phishing, falsch versandte Lohnzettel | Isolieren, Geschäftsführung und Datenschutz informieren, 72-Stunden-Frist im Blick |
| **Geräte, Lizenzen, Fachsysteme** | Teure Kanzleisoftware, viele Portale, wenig Leute | Wer hat welches Gerät, welche Lizenz, welches Zertifikat, welches Portal-Login |
| **Mandantendatenaustausch** | USB-Stick und private Mail sind das übliche Leck | Freigegebener Kanal: Portal oder verschlüsselter Transfer, nicht WhatsApp |
| **Aufbewahrung und Löschung** | Steuer- und Lohnunterlagen haben lange Fristen, DSGVO verlangt Löschkonzept | IT weiß, wo Daten liegen, wie Backup und Archiv davon ausgenommen bzw. mitgezogen werden |
| **Lieferanten- und Cloud-Freigabe** | FinanzOnline, M365, Backup-Cloud, Scan-Dienst | Vorher prüfen: Standort, AVV, Unterauftragnehmer, Verschwiegenheit |
| **Wissen** | Dieselben Störungen kehren jeden Monat wieder | Kurze Anleitungen: ELDA-Fehler, Smartcard, VPN, Scanstau, „FinanzOnline hängt“. Siehe Ticket-System, FAQ und IT-Dokumentation mit allen gelösten Tickets |
| **Bestellungen, Beschaffung** | Beschaffung bzw. Bestellung von Hardware und Software | Alle Benutzer können neue Hardware und Software bestellen. Unter 100 Euro ohne Bestätigung durch den Vorgesetzten, 100 bis 500 Euro mit Workflow und Bestätigung durch den Vorgesetzten, alles darüber muss manuell bearbeitet werden |

## Was als Ticketkatalog existieren muss

Der Helpdesk muss diese Fachfälle erkennen und richtig priorisieren, auch wenn die Lösung beim Softwarehaus liegt:

- **Lohn:** Abrechnungslauf, ELDA/SV-Meldung, SEPA/Bankdatei, Jahreslohnzettel, Dienstgeberkonto, Zertifikat abgelaufen
- **Steuer:** FinanzOnline, LogistH, BMD, BMDGhost, UVA, Zusammenfassende Meldung, E-Rechnung, Belegbild/DMS, Export für die Betriebsprüfung
- **Arbeitsplatz:** Scanner und Drucker (der Belegfluss ist geschäftskritisch), Virenscanner auf dem eigenen Arbeitsplatz-PC, Homeoffice/VPN, MFA
- **Zugriff:** neuer Mitarbeiter, Rollenwechsel zwischen Lohn und Steuer, Austritt, Praktikant, externer Betreuer
- **Sicherheit:** Phishing-Mail mit Mandantenbezug, verlorenes Notebook, offenes Postfach

Priorität hängt an der Frist, nicht an der Lautstärke. Blockierter Lohnlauf oder Abgabetag ist P1. Ein einzelner Scanplatz am 3. des Monats ist P2. „Outlook-Signatur“ ist P3.

## Mindestregeln, sonst bleibt es Theorie

1. **Ein Ticketweg.** Auch Anrufe und „kurz im Vorbeigehen“ werden erfasst. Sonst gibt es keinen Nachweis gegenüber Mandant, Kammer oder Datenschutzbehörde.
2. **Getrennte Admin-Konten.** Niemand arbeitet mit dem Domänenadmin in der Lohnsoftware.
3. **MFA überall**, wo Mandanten- oder Lohndaten liegen: M365, VPN, FinanzOnline, Kanzleisoftware, Backup.
4. **Offboarding am letzten Arbeitstag**, nicht „irgendwann“: AD/M365, VPN, Fachsoftware, Portale, E-Mail-Weiterleitung, Notebook, Token.
5. **Berechtigungsreview** mindestens halbjährlich: verwaiste Konten sind in Kanzleien der Normalbefund.
6. **Änderungsstopp** in der Lohnwoche und vor bekannten Abgabeterminen.
7. **Wiederherstellungstest** mit echtem Rückspielen einer Lohndatenbank, nicht nur „Backup war grün“.
8. **Keine Mandantendaten** in privaten Messengern, privaten Clouds oder auf unverschlüsselten Sticks. Notebooks mit Festplattenverschlüsselung.

## Was eine KMU bewusst nicht bauen muss

Kein separates Problem-Management-Board, kein CAB mit fünf Rollen, kein CMDB-Projekt. Ein Ticketsystem, eine einseitige Rollenmatrix, eine Änderungsnotiz („was, wann, von wem, Rückfall“) und ein Notfallblatt (wen anrufen, wie isolieren, wo das Backup liegt, wer mit Mandanten spricht) reichen. Incident, Request, Berechtigungen, Change, Backup und Security-Incident sind die sechs Prozesse, ohne die der Rest nicht trägt.

Das ist eine organisatorische Orientierung, keine Rechtsberatung. Verschwiegenheits- und Aufbewahrungsdetails sollte die Kanzlei mit Berufsrecht und Datenschutz abgleichen, besonders wenn deutsche Mandanten und damit GoBD dazukommen.

## Schnittstellen

1. E-Mail-Schnittstelle zu `helpdesk@kmbcloud.at`. Eingehende Mails werden vom Service nach `WORKER_SCHEDULE` gelesen und später mit KI-Unterstützung bewertet. Jede Mail wird als Ticket erfasst, ein Mitarbeiter mit dem nötigen Fachwissen eingetragen, und der Absender erhält eine Ticketnummer mit zugewiesenem Bearbeiter. Einfache Antworten kann die KI sofort direkt erstellen, als erledigtes Ticket eintragen und den IT-Mitarbeiter per Mail informieren. Das Ticket wird in der Datenbank erstellt und der zugewiesene Mitarbeiter erhält einen Eintrag in seinem Terminkalender. Der Betreff ist `Neues Ticket` plus der Mail-Betreff. Der Körper enthält die komplette Mail und einen direkten Link zur Ticket-Seite. Die Dauer beginnt bei `CALENDAR_DEFAULT_MINUTES` (30) und kann später von der KI ersetzt werden. P1 startet mit der Erstellung, P2 eine Stunde danach, P3 vier Stunden danach.
2. Webseite für die Benutzer zur Erfassung von Tickets und zum Ansehen von offenen Tickets nach Abteilungen.
3. Webseite für die IT-Mitarbeiter mit offenen Tickets und maximal 10 bereits in Arbeit oder geschlossenen Tickets, mit Beschreibung und Zeit bis zur Lösung.
4. Webseite mit FAQ.
5. Webseite mit allen gelösten Tickets und Beschreibungen.
6. Auf allen Webseiten eine KI-unterstützte Suche nach allen Informationen, Aufbereitung mit Link zur jeweiligen Seite und Zusammenfassung, warum diese Seite für diese Suche gefunden wurde.
7. Dashboard als Chef-Seite: eine Webseite mit Anzeige der Tickets und Erledigungen, Zeiten und Aufwand nach Zeitraum, umschaltbar nach Tag, Woche, Monat, Quartal und Jahr.
8. Eine Admin-Seite, die nur intern erreichbar ist. Dort kann man das Passwort des Admin-Benutzers ändern, die MFA zurücksetzen und Helpdesk-Mitarbeitern Kenntnisse, Aufgaben und Kategorien zuordnen, damit der KI-Helfer zu jedem eingereichten Ticket gleich einen passenden Mitarbeiter gemeinsam mit dem Kalender des Mitarbeiters zuordnen kann. KMBHelp muss dazu auf den Microsoft-365-Kalender jedes Helpdesk-Mitarbeiters zugreifen und dort lesen und neue Termine erstellen können.
9. Die Benutzerseiten und Tickets sind frei verfügbar und dürfen von jedem ohne Authentifizierung, auch anonym, benutzt werden. Bei jedem Zugriff werden die IP-Adressen in der zentralen Datenbank aufgezeichnet, um Fehlverhalten dokumentieren und nachfassen zu können.
10. Die Administrationsseiten und das Dashboard dürfen nur von authentifizierten Benutzern geöffnet werden. Die Anmeldung erfolgt per E-Mail und Rückfrage bei der Windows-Active-Directory-Domäne `kmbcloud.at` am Server `MADC1.kmbcloud.at` bei der Benutzergruppe HelpdeskAdmins. Das Passwort muss gegen das Windows-Passwort geprüft werden. Bei der ersten Anmeldung muss eine MFA-Challenge oder ein Passkey erzeugt und beim Benutzer hinterlegt werden. Nachfolgende Anmeldungen erfolgen mit E-Mail und MFA-Challenge oder Passkey. Die Verwaltung ist nur aus `192.168.36.0/24` und `192.168.191.0/24` erreichbar. Jede Verbindung aus `127.0.0.0/8` oder `::1` ist ohne Anmeldung frei, auch in Produktion. Eine weitergeleitete Adresse zählt dafür nicht.
11. Es gibt einen Admin-Account mit lokalem Benutzernamen und Passwort, das bei der Installation der Software einmalig festgelegt wird.
12. Eine zentrale Datenbank, die vom Server mit den Webseiten und vom Service für die Mailabfrage in Punkt 1 benutzt wird. Der KI-Agent soll entscheiden, welche. Parameter: bis zu 100 Zugriffe pro Sekunde, relational, am Markt oft verwendet, für Linux oder Windows.
13. Eine API zur Fernsteuerung aller oben genannten Services.
14. Ein MCP zur Fernsteuerung der API und aller oben genannten Services.
15. Je eine iOS- und Android-App mit einer gemeinsamen Codebasis, die auf die Punkte 2, 3, 4, 6 und 7 zugreifen kann. Die App muss mit einer lokalen MFA abgesichert sein.
16. Eine Installationsprozedur, um die App auf allen nötigen Systemen installieren zu können. Eine eigene Dokumentation für die Einbindung der iOS- und Android-Apps über deren Developer-Zugänge. Dieser Teil wird voraussichtlich noch verfeinert.

## Allgemeines zur Erstellung der App

Der Server heißt `helpdesk.kmbcloud.at`, sowohl Servername als auch Webname. Die E-Mail-Adresse ist `helpdesk@kmbcloud.at`. Die Schnittstellen müssen in einer Programmiersprache geschrieben sein, die Grok und Cursor auch künftig gut verstehen. Die Webseiten müssen auf Linux mit nginx und Apache gehostet werden können. Die Programmiersprache bleibt dem KI-Agenten überlassen, er muss die Wahl aber erklären. Die Webseite muss mehrsprachig sein und auf die Spracheinstellung des Clients reagieren. Sie muss professionell aussehen und auf PC, Mac, Tablets und Smartphones benutzbar sein. Sie muss eine Umschaltung Hell/Dunkel enthalten. Oben steht das Logo KMB Steuerberatung mit Links zu mehreren internen Webseiten (www, Home, Wiki), rechts das Malama-Logo mit einem Link zu `malama.at`. Es müssen keine Cookie-Meldungen gezeigt werden. Einstellungen der Webseite werden in Cookies gespeichert, die am PC des Benutzers liegen. Wenn ein Zugang zu einem externen System nötig ist, muss der KI-Agent zurückfragen. Alle Dateien im Verzeichnis `helpdesk` sind für den KI-Agenten frei verfügbar. Jeder einzelne Schritt und jeder einzelne Teilprozess muss in einer lokalen Markdown-Datei dokumentiert und damit festgehalten werden. Namen und Bezeichnungen folgen der üblichen Praxis auf GitHub.

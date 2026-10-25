# Ticketkatalog und Priorität

## Typen

Jeder Vorgang ist ein Ticket mit `type`:

| type | Prozessdokument |
|---|---|
| `incident` | prozesse/01-stoerung.md |
| `request` | prozesse/02-service-request.md |
| `access` | prozesse/03-identitaet.md |
| `remote_support` | prozesse/04-fernwartung.md |
| `change` | prozesse/05-aenderung.md |
| `backup_test` | prozesse/06-backup.md |
| `security_incident` | prozesse/07-sicherheitsvorfall.md |
| `asset` | prozesse/08-geraete-lizenzen.md |
| `data_exchange` | prozesse/09-mandantendaten.md |
| `retention` | prozesse/10-aufbewahrung.md |
| `supplier` | prozesse/11-lieferanten.md |
| `knowledge` | prozesse/12-wissen.md |
| `procurement` | prozesse/13-beschaffung.md |

## Fachliche Kategorien (Auswahlliste, nicht nur Freitext)

Lohn

- Abrechnungslauf
- ELDA / SV-Meldung
- SEPA / Bankdatei
- Jahreslohnzettel
- Dienstgeberkonto
- Zertifikat abgelaufen

Steuer

- FinanzOnline
- LogistH
- BMD
- BMDGhost
- UVA
- Zusammenfassende Meldung
- E-Rechnung
- Belegbild / DMS
- Export Betriebsprüfung

Arbeitsplatz

- Scanner
- Drucker
- Virenscanner am Arbeitsplatz-PC
- Homeoffice / VPN
- MFA

Zugriff

- neuer Mitarbeiter
- Rollenwechsel Lohn / Steuer
- Austritt
- Praktikant
- externer Betreuer

Sicherheit

- Phishing mit Mandantenbezug
- verlorenes Notebook
- offenes Postfach

Beschaffung

- Hardware
- Software

Der Freitext bleibt für die Beschreibung. Die Kategorie ist Pflicht.

## Priorität

Priorität folgt der Frist und der Wirkung, nicht der Tonlage.

| Stufe | Regel | Beispiele |
|---|---|---|
| P1 | Abgabe, Lohnlauf oder eine Kanzlei-weite Sicherheitslage ist blockiert oder die Frist ist heute | Lohnlauf steht, FinanzOnline am Abgabetag, Ransomware |
| P2 | ein Arbeitsplatz oder ein Gerät, der Belegfluss ist beeinträchtigt, aber die Kanzlei kann ausweichen | ein Scanplatz am 3. des Monats |
| P3 | kein Fristbezug | Outlook-Signatur |

Die KI schlägt die Stufe vor. Ein Mensch kann sie ändern. Die Änderung ist ein Audit-Ereignis mit Pflichtbegründung.

Zusätzlich das Feld `impact`: `filing` (Abgabe), `payroll` (Lohnlauf), `workplace` (ein Platz), `cosmetic`.

`impact` in `filing` oder `payroll` und Fälligkeit heute oder überfällig erzwingt P1, auch wenn die KI P3 sagt.

## Standardkatalog für Requests

Statt leerem Formular wählt der Melder einen Eintrag. Jeder Eintrag hat Kategorie, Typ, Kenntnis (`skill`), Zielminuten, Checkliste:

- Benutzer anlegen
- Recht erweitern
- Laptop
- Scanplatz
- Virenscanner prüfen
- Portal-Benutzer
- Zertifikat erneuern
- Offboarding letzter Arbeitstag
- Änderung mit Rückfall planen
- Backup zurückspielen (Test)
- Lieferant freigeben
- Bestellung Hardware
- Bestellung Software

Weitere Einträge sind Admin-Daten, kein Deployment.

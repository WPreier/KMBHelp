# Fernwartung und externe IT

Typ: `remote_support`

## Warum

Ein Auftragsverarbeitungsvertrag ersetzt die berufsrechtliche Verschwiegenheit nicht.

## Schritte

1. Lieferant muss im Bestand sein und die Felder AVV-Datum und Verschwiegenheitsvereinbarung-Datum gefüllt haben. Sonst kein Start.
2. Zugriff nur auf Zuruf: Ticket auf „freigegeben“, Zeitfenster Pflicht.
3. Admin-Zugang des Dienstleisters ist ein eigener Account, nie das Passwort eines Mitarbeiters. Die App speichert das Passwort nicht, nur den Account-Namen und wo er liegt.
4. MFA des Dienstleisters ist Checklistenpunkt.
5. Nach dem Fenster: Ticket auf „Zugang beendet“ mit Uhrzeit. Ist `window_end` vorbei und `ended_at` leer, zeigt das Dashboard den Fall mit Link auf `/mitarbeit/ticket/{nummer}`.

## Nachweis

Freigabe, Fenster, Account-Name, Ende. Keine Sitzungsmitschnitte in dieser Version.

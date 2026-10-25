# Lieferanten- und Cloud-Freigabe

Typ: `supplier`

## Warum

FinanzOnline, M365, Backup-Cloud und Scan-Dienst sind keine privaten Experimente.

## Felder vor Status „freigegeben“

- Name, Zweck
- Verarbeitungsort (Land)
- AVV vorhanden (Datum)
- Verschwiegenheitsvereinbarung vorhanden (Datum), zusätzlich zum AVV
- Unterauftragnehmer bekannt ja/nein, Liste als Text
- fachlich freigegeben von, am

Ohne AVV-Datum und ohne Verschwiegenheitsdatum bleibt der Status `draft`. Fernwartung (`04-fernwartung.md`) lehnt Dienstleister im Status `draft` ab.

## Nicht

Keine automatische Bonitätsprüfung, keine Vertragsablage über das Datum und den Aktenvermerk hinaus. Die PDF bleibt im bestehenden Ablagesystem der Kanzlei. Die App speichert den Verweis.

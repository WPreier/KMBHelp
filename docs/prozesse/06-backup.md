# Backup und Wiederherstellung

Typ: `backup_test`

## Warum

Ein grünes Backup-Symbol stellt keine Lohndatenbank wieder her.

## Regeln

- Fachliche Sollvorgabe, die das Wissensartikel festhält: täglich, zweite Kopie getrennt vom Netz, dritte Kopie außer Haus (3-2-1). Die App sichert die Kanzleidaten nicht selbst. Sie führt den Nachweis der Tests für die vom Helpdesk betreuten Systeme.
- Mindestens alle 90 Tage ein Ticket je kritischem System (Lohn, Buchhaltung, Mail, Dateiablage). Das System legt das Folgeticket beim erfolgreichen Schließen an.
- Pflichtfelder: welches System, welcher Stand (Datum der Sicherung), wurde echt zurückgespielt, wohin, Ergebnis, Dauer, Wer.

## Eigene Datensicherung von KMBHelp

PostgreSQL der Helpdesk-App wird täglich gesichert. Anleitung in `docs/installation-linux.md`. Das ist Infrastruktur, kein Mandanten-Backup.

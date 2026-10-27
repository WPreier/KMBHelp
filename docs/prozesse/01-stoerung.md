# Störungsmanagement

Typ: `incident`

## Warum

Lohnlauf, UVA, FinanzOnline, ELDA und Scanner dürfen nicht liegen bleiben, nur weil niemand den Anruf notiert hat.

## Auslöser

Mail, Web, App, Anruf oder Zuruf. Anruf und Zuruf erfasst der Mitarbeiter, der den Anruf hat, unter Quelle `phone` oder `walkin`.

## Schritte

1. Ticket mit Kategorie, `impact` und Fälligkeit anlegen. Fehlt die Fälligkeit, nachfragen oder auf das nächste bekannte Abgabedatum der Kategorie setzen.
2. Priorität nach `docs/ticketkatalog.md` setzen.
3. Bearbeiter aus Kenntnis und Kalender. Bei einer Mail macht das der Worker: erste aktive Person mit der Kenntnis, die frei ist.
4. P1: Kalenderblock nach `CALENDAR_DELAY_P1` Minuten, Auslieferung sofort. P2 wartet `CALENDAR_DELAY_P2` Minuten (60), P3 wartet `CALENDAR_DELAY_P3` Minuten (240). Die Dauer ist `CALENDAR_DEFAULT_MINUTES` (30), bis Phase 6 eine eigene Schätzung liefert. Eine Info an die Bereitschaft geht bei P1 an `ONCALL_EMAIL`. Leer heißt: keine Mail.
5. Beheben oder an das Softwarehaus eskalieren. Eskalation ist ein Kommentar mit Ziel und Zeitpunkt, kein neues herrenloses Ticket.
6. Schließen nur mit Lösungsbeschreibung, Aufwand in Minuten und ob ein Wissensartikel nötig ist.

## Nachweis

Jedes der sechs Ereignisse ist eine Zeile in `ticket_event`.

## Nicht

Kein eigenes Problem-Management-Board. Wiederkehrende Störungen werden über die Wissensseite und die FAQ sichtbar, weil gelöste Tickets durchsuchbar sind.

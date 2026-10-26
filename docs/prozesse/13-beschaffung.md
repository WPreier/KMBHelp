# Bestellungen und Beschaffung

Typ: `procurement`

## Betragsregeln

| Nettobetrag | Weg |
|---|---|
| unter 100 Euro | Ticket wird ohne Vorgesetzten angelegt und kann vom Helpdesk bestellt werden |
| 100 bis 500 Euro | Workflow: Vorgesetzter muss genehmigen. Bis dahin Status `waiting_approval` |
| darüber | Status `manual`. Kein eingebauter Genehmigungsknopf. Bearbeitung außerhalb, Vermerk im Ticket |

Grenzen sind Admin-Einstellungen, Voreinstellung 100 und 500. Währung EUR.

## Felder

Artikel, Begründung, Betrag netto, Lieferant (muss nicht freigegeben sein, wenn keine Datenverarbeitung — sonst zuerst Lieferantenprozess), Wunschtermin, Vorgesetzten-E-Mail.

## Vorgesetzter

Die erste Version fragt die E-Mail ab und schickt einen Link mit Einmal-Token. Der Vorgesetzte ist nicht zwingend in der AD-Gruppe HelpdeskAdmins. Der Link erlaubt nur diese eine Entscheidung, kein Ticketlesen darüber hinaus. Gültigkeit 7 Tage.

## Nachweis

Betrag, Schwelle, Entscheidung, wer, wann.

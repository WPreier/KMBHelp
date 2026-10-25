# Änderungen und Patches

Typ: `change`

## Warum

Updates von BMD, RZL, DATEV, Agenda, Windows und M365 dürfen nicht in den Lohnlauf fallen.

## Felder

Was, wann, wer, Rückfall, betroffene Systeme, ob ein Stoppfenster berührt wird.

## Stoppfenster

Tabelle `change_freeze`. Voreinstellung, von Admin änderbar: Werktage 1. bis 5. jedes Monats, plus manuell gepflegte Abgabetage.

In einem Stoppfenster speichert die App die Änderung nur mit `exception_reason`. Ohne Grund kein Speichern.

## Ablauf

1. Anlegen mit Rückfalltext. Ohne Rückfall kein Status „genehmigt“.
2. Ein Helpdesk-Mitarbeiter genehmigt. Kein Gremium.
3. Nach der Durchführung: Ergebnis `done` oder `rolled_back`.

## Nicht

Kein CAB mit fünf Rollen.

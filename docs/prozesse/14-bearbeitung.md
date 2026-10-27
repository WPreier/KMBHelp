# Bearbeitung durch den Helpdesk

Dieser Prozess gehört zu Phase 9. Er wird nicht früher gebaut. Die öffentliche Liste bleibt ohne Beschreibung, Absender und Kommentare.

## Ticketseite

Ein angemeldeter Mitarbeiter der Gruppe `HelpdeskAdmins` öffnet `/mitarbeit/ticket/{nummer}`. Diesen Pfad trägt der Kalender aus Phase 4 schon ein. Er darf alle Felder ändern. Die Zufriedenheit darf er nicht ändern.

Er kann eine Erklärung am Ticket speichern.

Er kann das Ticket als erledigt markieren. Das schließt es und sendet eine Mail. Der Betreff nennt das Ticket und seine Nummer. Der Text sagt, dass es gelöst ist, und bittet um eine kurze Antwort, wenn es zur Zufriedenheit gelöst wurde. Absender ist `GRAPH_MAILBOX`.

## Zufriedenheit

Die Antwort des Benutzers wird, sobald ein KI-Anbieter mit Endpunkt, Region und AVV konfiguriert ist, gelesen und dem Ticket angehängt. Die KI trägt einen von drei Zuständen ein:

| Zustand | Farbe | Form |
|---|---|---|
| zufrieden | gelb | lächelndes Zeichen |
| neutral | grün | neutrales Zeichen |
| unzufrieden | orange | unzufriedenes Zeichen |

Die Zeichen sind SVG, keine Emoji. Nur der Benutzer setzt oder ändert den Zustand. Der Mitarbeiter sieht ihn und kann ihn nicht umstellen.

## Mails vom Mitarbeiter

Ein Knopf sendet an den Auftraggeber den Satz, dass der Mitarbeiter jetzt an diesem Ticket arbeitet.

Eine Rückfrage wird im Ticket gespeichert und zusätzlich als Mail an den Benutzer gesendet.

Ohne Microsoft-365-Freigabe wird keine Mail erfunden. Die Aktion antwortet, dass der Versand nicht verbunden ist.

## Postfach

Die Seite zeigt die Mails im Postfach `helpdesk@kmbcloud.at`, die noch kein Ticket sind. Der Worker legt nur dann eines an, wenn die KI die Mail als Support bestätigt. Ist die KI nicht erreichbar, bleibt die Mail ungelesen. Jede noch ungelesene Mail kann von Hand in ein Ticket umgewandelt werden.

Wird ein Mail als Ticket angenommen, speichert die Anwendung den Grund. Diesen Grund soll die spätere Erkennung lernen.

Wird ein Ticket als Fehlinterpretation markiert, wird genau dieses Ticket gelöscht und der Grund gespeichert. Die Erkennung soll daraus lernen, dass so ein Mail kein Ticket werden darf. Andere Tickets bleiben. `ticket_event` bleibt für alle übrigen Vorgänge nur anhängbar. Diese Löschung ist die einzige Ausnahme und nur für die Fehlinterpretation.

## Grok

Helpdesk-Mails gehen zur Prüfung an den konfigurierten Anbieter. Der Name steht in `AI_PROVIDER`, die Adresse in `AI_ENDPOINT`. Fehlen Endpunkt, EU-Region, Schlüssel oder AVV, gibt es keinen Aufruf und aus der Mail wird kein Ticket. Die Ausschlüsse für Domäne, Helpdesk und Mitarbeiter gelten davor.

Meldet der Agent, dass ein Mail ein Ticket werden soll, entstehen Kategorie, Priorität, Benutzer und Mitarbeiter. Der Mitarbeiter muss aktiv sein und laut seinem Microsoft-365-Kalender verfügbar. Er erhält eine Mail mit der Ticketnummer, allen Ticketangaben und dem Originalmail als Anhang. Absender ist `GRAPH_MAILBOX`.

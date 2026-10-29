# Bearbeitung durch den Helpdesk

Dieser Prozess gehört zu Phase 9. Er wird nicht früher gebaut. Die öffentliche Liste bleibt ohne Beschreibung, Absender und Kommentare.

## Ticketseite

Ein angemeldeter Mitarbeiter der Gruppe `HelpdeskAdmins` öffnet `/mitarbeit/ticket/{nummer}`. Diesen Pfad trägt der Kalender aus Phase 4 schon ein. Er darf alle Felder ändern. Die Zufriedenheit darf er nicht ändern.

Er kann eine Erklärung am Ticket speichern.

Er kann das Ticket als erledigt markieren. Das schließt es und legt eine Mail als Entwurf im Ordner Entwürfe von `GRAPH_MAILBOX` ab. Der Betreff nennt das Ticket und seine Nummer. Der Text sagt, dass es gelöst ist, und bittet um eine kurze Antwort, wenn es zur Zufriedenheit gelöst wurde. Die Mail wird nicht verschickt.

## Zufriedenheit

Die Antwort des Benutzers wird, sobald ein KI-Anbieter mit Endpunkt, Region und AVV konfiguriert ist, gelesen und dem Ticket angehängt. Die KI trägt einen von drei Zuständen ein:

| Zustand | Farbe | Form |
|---|---|---|
| zufrieden | gelb | lächelndes Zeichen |
| neutral | grün | neutrales Zeichen |
| unzufrieden | orange | unzufriedenes Zeichen |

Die Zeichen sind SVG, keine Emoji. Nur die Antwort des Benutzers setzt den Zustand, und nur wenn der KI-Anbieter mit Endpunkt, EU-Region, Schlüssel und AVV konfiguriert ist. Sonst bleibt die Antwort ungelesen. Der Mitarbeiter sieht den Zustand und kann ihn nicht umstellen.

## Mails vom Mitarbeiter

Ein Knopf legt an den Auftraggeber einen Entwurf mit dem Satz ab, dass der Mitarbeiter jetzt an diesem Ticket arbeitet.

Eine Rückfrage wird im Ticket gespeichert und zusätzlich als Entwurf an den Benutzer abgelegt.

Ohne Microsoft-365-Freigabe wird keine Mail erfunden. Die Aktion antwortet, dass der Entwurf nicht angelegt werden kann. Antworten an Melder bleiben Entwürfe. Die Fehlermail nach einer Ollama-Abfrage über 5 Minuten geht an `MAIL_ERROR_TO` und verlässt das Postfach.

## Postfach

Die Seite zeigt die Mails im Postfach `helpdesk@kmbcloud.at`, die noch kein Ticket sind. Der Worker legt eines an, wenn Ollama die Mail als Support einstuft, oder wenn eine Abfrage länger als 5 Minuten dauert. Ist der Server nicht erreichbar, bleibt die Mail ungelesen. Jede noch ungelesene Mail kann von Hand in ein Ticket umgewandelt werden.

Wird ein Mail als Ticket angenommen, speichert die Anwendung den Grund. Diesen Grund soll die spätere Erkennung lernen.

Wird ein Ticket als Fehlinterpretation markiert, wird genau dieses Ticket gelöscht und der Grund gespeichert. Die Erkennung soll daraus lernen, dass so ein Mail kein Ticket werden darf. Andere Tickets bleiben. `ticket_event` bleibt für alle übrigen Vorgänge nur anhängbar. Diese Löschung ist die einzige Ausnahme und nur für die Fehlinterpretation.

## Ollama

Helpdesk-Mails gehen an den lokalen Ollama-Server `OLLAMA_URL`, Modell `OLLAMA_MODEL`. Auslieferung ist `http://192.168.191.131:11434` und `qwen2.5:7b`. `AI_ENDPOINT` wird dafür nicht gefragt. Microsoft 365 Copilot wird dafür nicht eingeschaltet. Der Prüfstand vom 28.10.2026 steht in `docs/schnittstellen.md`. Jeder Absender wird geprüft. SUPPORT wird ein Ticket, die Kategorie wird bei Bedarf angelegt, und eine eindeutige Wichtigkeit setzt P1, P2 oder P3. Fehlt sie, fragt der Worker einmal nach. ANTWORT und ABSCHLUSS ändern ein bestehendes Ticket. FREMD und SPAM werden gelesen markiert. Eine Abfrage wartet höchstens 5 Minuten.

Meldet der Agent, dass ein Mail ein Ticket werden soll, entstehen Kategorie, Priorität, Benutzer und Mitarbeiter. Der Mitarbeiter muss aktiv sein und laut seinem Microsoft-365-Kalender verfügbar. Für ihn liegt eine Mail mit der Ticketnummer, allen Ticketangaben und dem Originalmail als Anhang als Entwurf im Ordner Entwürfe. Absender ist `GRAPH_MAILBOX`.

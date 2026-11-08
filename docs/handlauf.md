# Handlauf

Stand 08.11.2026, Fassung V 0.2.13, Zweig `phase/12-haerten`.

Der Handlauf ist das, woran man sich festhält, wenn der Gang lang wird. Für KMBHelp heißt das: eine durchgängige Helpdesk-Anwendung, in der sich Melder und Mitarbeiter sicher fühlen. Der Leitspruch ist „Wir kümmern uns“. Dieses Blatt hält fest, wo der Gang schon ein Geländer hat, wo man noch sucht, und welche Anschlüsse später dazu passen. Nichts davon ist in V 0.2.13 als neue Funktion eingebaut. Die Stack-Entscheidung in `docs/stack-entscheidung.md` bleibt bindend. Die Nachtwache in `docs/nachtwache.md` sagt, was dabei nicht nach außen darf.

## Was sich schon durchgängig anfühlt

Die öffentliche Seite und die App sprechen dieselbe API. Ticket erfassen, die Liste, die Suche, FAQ, Sprache und Hell/Dunkel sitzen an festen Orten. Datum ist `dd.MM.yyyy`. Die Priorität heißt im Alltag „Sehr wichtig“, „bitte heute noch“ und „bei Gelegenheit“. Die sichtbare Nummer, zum Beispiel `26-0091`, bleibt.

Nach der Anmeldung steht Rolle und E-Mail oben, darunter Abmelden. Das Menü geht von Dashboard über Ticket erfassen zu den eigenen offenen Tickets, allen offenen Tickets und den abgeschlossenen. Ein Benutzer sieht nur das Eigene und schließt nichts. Ein Helpdesk-Konto sieht die Kanzlei.

Die Ticketseite merkt sich den formatierten Text, die Uhrzeit und den letzten Bearbeiter. Fertig fragt nach. PDF erstellen schließt nicht. Die Checkbox setzt aktiv und inaktiv sofort. Die Mail an einen neuen Bearbeiter geht mit der Zuordnung hinaus. Der Knopf M stellt dieselbe Rückfrage wie die Liste.

Die Dienste, der KI-Mailtest und der ganze Posteingang liegen unter Verwaltung und nur bei Administratoren. Ein Test nennt die Dauer in Sekunden. Ungelesene Zeilen im Posteingang sind fett. T öffnet die Prüfung mit dieser Mail. U/G setzt gelesen oder ungelesen. Der Worker arbeitet weiter nur an ungelesenen Nachrichten.

Wissen hat zwei Ebenen, beschrieben in `docs/prozesse/12-wissen.md`: eine kurze öffentliche FAQ und der Rohtext nur für das Team. Die Suche sagt in einem Satz, warum ein Treffer kam.

## Wo man sich noch festhält, weil der nächste Griff fehlt

Das sind Beobachtungen aus dem Bau und dem bisherigen Betrieb, keine Messwerte aus einer Nutzerstudie. Die Reihenfolge ist die, in der ein normaler Tag stockt.

### Der Melder weiß danach nicht, wer sich kümmert

Ticket erfassen endet mit einer Nummer in der Liste. Es fehlt ein Satz auf der nächsten Seite: „Wir haben das unter 26-0091. Die Liste zeigt den Stand.“ Dieselbe Ruhe braucht die Mail, die heute als Entwurf in Outlook liegt. Der Mitarbeiter muss wissen, dass der Entwurf da ist und dass er ihn selbst absendet. Ein kurzer Hinweis nach Fertig, nach der Rückfrage und nach der Übergabe würde den Leitspruch sichtbar machen, ohne den Versand aus der App zu nehmen. Der Versand bleibt in Outlook, weil die App Entwürfe ablegt und nicht selbst verschickt.

### Die Ticketseite hat viele gleich laute Knöpfe

M, PDF, Fertig, die Checkbox und Speichern stehen nebeneinander. Der häufigste Griff am Tag sollte einer sein: speichern und weitermachen. Fertig bleibt der zweite, mit der Frage. PDF und die Rückfrage dürfen leiser sein. Auf 390 Pixel Breite darf der Hauptgriff ohne seitliches Schieben erreichbar sein.

### Der Posteingang ist eine breite Tabelle

Absender, An, Kopie, Datum, Betreff, Message-ID, In-Reply-To, References und Text stehen in einer Zeile, weil das genau die Felder der KI-Prüfung sind. Auf einem schmalen Fenster schiebt man seitwärts. Für den Alltag reichen zuerst Absender, Datum, Betreff und ob die Zeile ungelesen ist. Die übrigen Felder können aufgeklappt unter der Zeile stehen. Die fett markierte ungelesene Zeile bleibt.

Mehr als 500 Nachrichten zeigen die neuesten 500 und sagen das. Ein älteres Postfach braucht später ein Weiterblättern, nicht eine noch breitere Tabelle.

### Der Betreff ist der öffentliche Satz

Was im Betreff steht, steht in der Liste ohne Anmeldung. Am Feld fehlt der Satz: „Keine Mandantennamen. Den Zusammenhang in die Beschreibung.“ Das ist zugleich der Hinweis aus der Nachtwache.

### Das Dashboard nennt Zahlen, noch nicht den nächsten Handgriff

Eigene Zahlen und Zahlen der Kanzlei sind da. Es fehlt der eine offene Punkt, der heute als Nächstes dran ist: das älteste P1, die unbeantwortete Rückfrage, die Mail, die kein Ticket wurde. Eine Zeile mit Link reicht. Ein zweites Board braucht es nicht. Die Stack-Entscheidung lässt kein Problem-Management-Board zu.

### Wissen liegt neben der Arbeit, nicht in der Arbeit

Die Kopfzeile hat Wiki. Die FAQ ist öffentlich, sobald jemand sie freigibt. Auf der Ticketseite fehlt „dazu gibt es eine Anleitung“, wenn Kategorie oder Betreff einen freigegebenen Artikel treffen. Der Rohtext eines geschlossenen Tickets wird daraus nur nach der Checkliste „redigiert“. Automatisch veröffentlichen wäre das Gegenteil von „wir kümmern uns“: dann läge ein Mandantenname in der FAQ.

### Die Anmeldung ist richtig und noch lang

Domänenpasswort, danach Passkey oder Einmalcode, ist der Riegel aus `docs/sicherheit.md`. Der QR-Code erscheint, wenn der Code fehlt. Was fehlt, ist ein Satz, der den zweiten Schritt als Fürsorge erklärt und nicht als Hürde: „Der zweite Schritt gehört zu diesem Konto. Danach bleibt die Anmeldung auf diesem Gerät leichter.“ Teste Passkey jetzt ist der richtige Prüfgriff. Er darf unter dem Alltagsknopf bleiben.

### Störungen der Dienste stehen unter Tests

Ein rotes Kreuz sagt, welcher Dienst nicht antwortet. Auf dem Dashboard sieht man das nicht mehr. Für den Alltag reicht auf dem Dashboard eine Zeile „ein Dienst meldet sich nicht“ mit Link nach Tests. Die sieben Einzelprüfungen bleiben dort.

## Anschlüsse, die jemand genannt hat

Jede Idee ist daran gemessen, ob sie den Tag kürzer macht und ob ein Mandanteninhalt das Haus verlässt. Gebaut ist davon nichts.

### Microsoft Teams

Ein Kanal, in den nur der Satz geht: Nummer, Priorität, Kategorie, Link auf die Ticketseite. Kein Betreff, wenn darin ein Mandantenname stehen kann, und kein Beschreibungstext. Der Empfänger ist eine Helpdesk-Gruppe, die sich anmelden muss, um den Text zu sehen.

Das passt später als eine kleine Ergänzung neben Graph, nicht als zweites Ticketsystem. Dafür braucht es eine neue Entscheidung neben `docs/stack-entscheidung.md`, ein Geheimnis nur in der Umgebungsdatei und dieselbe Admin-Schranke wie bei der Mailbox. Slack wäre derselbe Griff. Einen von beiden, nicht beide am ersten Tag. Teams liegt näher, weil Mail und Kalender schon bei Microsoft liegen.

### Slack

Dieselbe Grenze wie Teams. Slack lohnt erst, wenn das Team dort wirklich steht. Ein zweiter Kanal mit demselben Text verdoppelt nur die Stelle, an der man nachsehen muss. Solange die Kanzlei in Teams oder in der Mail arbeitet, bleibt Slack aus.

### Wiki

Ein Wiki ist schon angebunden: der Link in der Kopfzeile und die FAQ in der App. Ein zweites Wiki würde die Anleitungen teilen. Der nächste Griff ist, vom Ticket auf den vorhandenen Artikel zu zeigen und einen FAQ-Entwurf nur leer von Namen und Zahlen anzulegen. Das steht so in `docs/prozesse/12-wissen.md`.

### Obsidian

Ein Tresor auf den Laptops, der die Datenbank spiegelt, kopiert Vertrauliches auf Geräte, die wir nicht wie den Server bewachen. Das widerspricht der Nachtwache.

Was passen würde: ein Mensch exportiert einen bereits redigierten Artikel als Markdown und legt ihn selbst in den Tresor. Die App schiebt keine Ticketdaten dorthin. Ein Live-Abgleich ist kein Ziel.

### Eine Suche im Web

Eine offene Frage darf ein Mensch nachschlagen. Der Tickettext, der Betreff und die Mail dürfen nicht von selbst an eine öffentliche Suche gehen. Google, eine andere Suchmaschine und ein öffentliches Modell sind dafür dieselbe Tür.

Was passen würde: ein Feld „Suchbegriff“ neben der Ticketbeschreibung. Die Seite öffnet die Suche in einem neuen Fenster mit dem Satz, den der Mensch gerade getippt hat. Daneben steht zuerst die eigene Suche über FAQ und gelöste, redigierte Artikel. Die eigene Antwort kommt vor der fremden.

Microsoft 365 Copilot ist damit nicht ausgewählt. Die Mailprüfung bleibt auf dem Ollama-Server im eigenen Netz.

## Reihenfolge, wenn wir den Handlauf nachziehen

1. Nach dem Erfassen und nach Fertig einen Satz, der sagt, was jetzt gilt und wer den Entwurf absendet.
2. Auf der Ticketseite einen Hauptgriff, die übrigen Knöpfe leiser, auch bei 390 Pixeln.
3. Im Posteingang zuerst Absender, Datum, Betreff und ungelesen. Den Rest aufklappen.
4. Am Betreff der Hinweis ohne Mandantennamen.
5. Auf dem Dashboard die eine nächste Sache und die eine Zeile, wenn ein Dienst schweigt.
6. Vom Ticket zur vorhandenen Anleitung, nie den Rohtext automatisch in die FAQ.
7. Erst danach Teams mit einem Satz ohne Tickettext, und das Suchfeld, das nur den selbst getippten Begriff öffnet.

Obsidian und Slack bleiben draußen, bis ein konkreter Arbeitsplatz sie braucht und die Grenze aus diesem Blatt mitgeht.

# Nachtwache

Stand 08.11.2026, Fassung V 0.2.13, Zweig `phase/12-haerten`.

Diese Nachtwache ist das Sicherheitsbild der laufenden App. Sie sagt, welche Tür schon einen Riegel hat, wo jemand noch ansetzen könnte, und was dagegen hält. Sie ist keine Rechtsberatung und kein Angriffshandbuch. Die verbindlichen Regeln stehen in `docs/sicherheit.md`. Was hier als offen steht, ist in diesem Stand nicht eingebaut. Phase 12 bleibt offen, bis Härtung, Praxistest und Notfallblatt erledigt sind.

Geprüft wurde der Code, der am 08.11.2026 auf `phase/12-haerten` liegt: Anmeldung, Sitzung, öffentliche Tickets, Mail, Modell, Dateien, Verwaltung und die neuen Admin-Seiten. Es wurde kein Einbruch gegen den laufenden Server versucht.

## Was schon verriegelt ist

| Tür | Riegel |
|---|---|
| Öffentliche Liste | Eine Zeile je Ticket. Kein Beschreibungstext, kein Absender, keine Kommentare, kein Geheimlink. |
| Ticketinhalt | Erst nach Sitzung. Eine Sitzung mit offenem Einmalcode sieht ihn nicht. Ein Benutzer sieht nur Tickets, die er selbst gemeldet hat, und kann sie nicht schließen. |
| Helpdesk und lokaler Admin | Sehen die Bearbeitung. Die Gruppe heißt helpdesk oder HelpdeskAdmins. |
| Passwort der Domäne | Geht an den Verzeichnisdienst und wird nicht gespeichert, nicht geloggt und nicht an das Modell gegeben. |
| Lokaler Admin | Ein Konto, Passwort nur als Argon2id-Hash. Anlegen nur über `pnpm install:helpdesk`. Die Website ändert dieses Passwort nicht. |
| Sitzung | Cookie `HttpOnly`, `SameSite=Lax`, bei HTTPS zusätzlich `Secure`. Gilt 30 Tage und wird nach einem Tag erneuert. Abmelden löscht Cookie und Sitzung. |
| Schreibende Aufrufe | Brauchen das CSRF-Kennzeichen der Sitzung. |
| Anmeldung | Höchstens 10 Versuche je Adresse in einer Minute. Ticket anlegen ebenso 10, die öffentliche Suche 30, eine Statusänderung 30, eine Beschaffungsentscheidung 20. |
| Test-Anmeldung | `ALLOW_TEST_AUTH` beendet die API in Produktion, bevor sie Anfragen annimmt. |
| localhost | Nur der Socket aus `127.0.0.0/8` oder `::1` ist ohne Anmeldung Administrator. `X-Forwarded-For` zählt dafür nicht. Die API vertraut dem Proxy-Kopf nicht als eigene Adresse. |
| Verwaltung von außen | Zusätzlich die Netzliste. Leer heißt: niemand von außen. |
| Dienstkonto MCP | Bearer-Vergleich in konstanter Zeit, kürzer als 16 Zeichen gilt als nicht gesetzt. |
| Dateien am Ticket | Typ und Größe vor dem Speichern, danach muss der Inhalt zur Endung passen. HTML und Programme bleiben in der Vorgabe draußen. |
| Wiki-Text | Wird erst als Text entwertet und dann als Überschrift, Fett, Kursiv und Link gezeigt. Ein Link darf `https`, eine Datei im Ticket oder ein schlichter Dateiname sein. |
| Modell | Sieht SVNR, IBAN, Kartenmuster und ein offensichtliches Geburtsdatum nur maskiert. Die Entscheidung speichert Hash und Ausgabe, nicht den Tickettext. |
| Helpdesk-Mailbox | Nur Administratoren. Die Liste zeigt den maskierten Text. Der unmaskierte Quelltext geht nur an die einzelne Prüfung für KI-Mailtest. |
| Graph-Seiten | Eine Folgeseite wird nur gelesen, wenn sie mit `https://graph.microsoft.com/` beginnt. |
| Protokoll | `ticket_event` und `login_audit` sind nur anhängbar. Logger schwärzt Cookie, Passwort, Code, Token, den Mailtest und die Abfrage. |
| Geheimnisse | Liegen nicht im Git. Auf dem Server in `/etc/kmbhelp/kmbhelp.env`. Die Vorlagen im Repository haben leere Geheimnisse. |

## Wo jemand noch ansetzen könnte

Die Reihenfolge ist die, in der ein Fehlschlag weh tut. Zu jedem Punkt steht, was heute dagegen hält und was noch fehlt.

### 1. Der Proxy muss die Client-Adresse selbst setzen

Der MFA-Verzicht für ein Büronetz liest `X-Real-IP` und sonst die erste Adresse aus `X-Forwarded-For`, aber nur wenn der Socket die API selbst oder localhost ist. Die mitgelieferte nginx- und Apache-Datei setzt beide Köpfe auf die Adresse, die am Proxy ankommt, und hängt eine mitgebrachte Adresse nicht an.

Fehlt das auf dem laufenden nginx, kann ein Browser eine Büro-Adresse behaupten. Dann entfiele der Einmalcode. Das Domänenpasswort bliebe nötig. localhost-Admin wird daraus nicht, weil dafür der Socket zählt.

Gegenmittel, das schon in der Beispieldatei steht und auf dem Server gleich aussehen muss:

```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;
```

`proxy_pass` bleibt `http://192.168.36.55:3000`. Ein Umstellen auf `127.0.0.1` würde jeden Besucher zum localhost-Admin machen.

### 2. Eine Mail darf das Modell überreden

Der Worker glaubt der Klasse, die Ollama aus der Mail liest. SUPPORT legt ein Ticket an, ANTWORT hängt an ein bestehendes Ticket, SPAM wird nur gelesen markiert. Der Absender ist das, was Graph als From liefert. Eine Mail kann im Text um eine bestimmte Klasse bitten. Maskieren ändert diese Bitte nicht.

Dagegen hält heute: eine unlesbare oder unerreichbare Antwort erzeugt kein Ticket aus einer Laune, SPAM wird kein Ticket, und eine Fehlinterpretation lässt sich als `mail_lesson` merken. Es fehlt eine Obergrenze, wie viele Mails ein Absender am Tag anstoßen darf.

### 3. KI-Mailtest kann das Modell lange belegen

Ein Administrator schickt einen Text an dieselbe Ollama-Schnittstelle wie der Worker. Eine Abfrage wartet bis zu fünf Minuten, eine Wiederholung und die Wichtigkeitsfrage kommen dazu. Die Route hat kein eigenes Ratenlimit. nginx bricht ohne `proxy_read_timeout 300s` oft nach 60 Sekunden ab. Der Text bleibt aus `activity.log` draußen. Die Zeile nennt nur den Ergebnissatz.

Dagegen hält: nur Administratoren, und der Logger schwärzt den Körper. Es fehlt eine kleine Obergrenze je Stunde, damit ein offener Test die Mailprüfung der Kanzlei nicht ausbremst.

### 4. Der Posteingang ist eine große, vertrauliche Liste

Die Seite zeigt bis zu 500 Nachrichten, neueste zuerst, mit Betreff und maskiertem Text. Wer die Seite sehen darf, sieht damit viel vom Postfach `helpdesk@kmbcloud.at`. Der unmaskierte Text liegt nicht mehr in dieser Liste. Er liegt in der einzelnen Abrufantwort, weil KI-Mailtest ihn einmal selbst maskiert.

Dagegen hält die Admin-Schranke. Es fehlt, den einzelnen Abruf nur für eine Kennung zu erlauben, die in derselben Liste vorkam, und die Liste nach ein paar Minuten im Browser nicht liegen zu lassen. Abmelden löscht die Sitzung, nicht den bereits geladenen Tab.

### 5. Betreff der öffentlichen Liste

Die öffentliche Zeile zeigt den Betreff. Steht darin ein Mandantenname, ist er ohne Anmeldung lesbar. Das ist in `docs/sicherheit.md` so entschieden, weil die Liste sonst nicht bedienbar ist. Die Beschreibung bleibt verborgen. Ein Betreff, den ein Melder frei eintippt, ist damit der sichtbare Teil.

Dagegen hält die Schulung: keine Mandantennamen in den Betreff. Technisch fehlt ein Hinweis direkt am Feld Ticket erfassen.

### 6. Sitzung auf einem mitbenutzten Rechner

Dreißig Tage sind bequem und lang. `SameSite=Lax` und der CSRF-Kopf erschweren einen Aufruf von einer fremden Website. Sie erschweren nicht, dass jemand an einem entsperrten Bildschirm weiterarbeitet. Abmelden ist da. Ein kurzeres Leben im Büro, oder ein Ende beim Schließen des Browsers für die Verwaltung, wäre der nächste Riegel. Die Alltagssitzung der Mitarbeiter kann länger bleiben.

### 7. Graph-Recht ist das Recht der App-Registrierung

Die App liest und beschreibt das Postfach und kann Entwürfe und Kalendereinträge anlegen. Was die Registrierung in Entra darüber hinaus darf, entscheidet nicht dieser Code. Zu viel Recht in Entra bleibt zu viel Recht, auch wenn KMBHelp es heute nicht aufruft. Der Anwendungsgeheimnis gehört nur in die beiden Umgebungsdateien. Ein Geheimnis, das in einem Chat stand, ist zu ersetzen.

### 8. Ollama steht im eigenen Netz

`MAILCHECK_AI_URL` zeigt auf `http://192.168.191.131:11434`. Wer dieses Netz erreicht, erreicht das Modell und kann dieselben Fragen stellen. KMBHelp prüft den Aufrufer von Ollama nicht, weil Ollama das in dieser Aufstellung nicht verlangt. Dagegen hält das Netz, nicht die App. Eine spätere Härtung wäre, Ollama nur von kmbhelp aus anzunehmen.

### 9. Syslog ist UDP

Eine Meldung an den Syslog-Empfänger kann unterwegs verloren gehen oder von jemand anderem im selben Netz nachgeahmt werden. Das Aktivitätsprotokoll in der Datenbank und die Dateien unter `/var/lib/kmbhelp/` bleiben die Nachweisstelle. Syslog ist die zweite Glocke, nicht das Schloss.

### 10. Das Notfallblatt fehlt noch

Fällt kmbhelp aus, steht der Weg heute in `docs/betrieb.md` und `docs/installation-linux.md` verteilt. Ein Blatt für den Fall ohne diesen Rechner, ohne Graph und ohne Ollama ist in Phase 12 noch offen. Bis dahin gilt: Tickets, die schon in der Datenbank stehen, bleiben dort. Neue Mails warten ungelesen im Postfach, solange der Worker steht. Die öffentliche Seite kommt von nginx aus dem gebauten `dist`.

## Was diese Nachtwache nicht öffnet

Kein zusätzlicher Dienst, der Tickettexte entgegennimmt, wird hier freigegeben. Ein Webhook ohne Prüfung der Herkunft, eine Suche, die den Tickettext an eine öffentliche Website schickt, und ein zweites Admin-Passwort wären neue Türen. `docs/handlauf.md` sagt, welche Anschlüsse trotzdem zum Leitspruch passen und welche draußen bleiben.

## Nächste Riegel, noch nicht gebaut

1. Auf dem Server prüfen, dass nginx die beiden Proxy-Köpfe ersetzt und nicht anhängt. Danach die API neu starten ist dafür nicht nötig.
2. `proxy_read_timeout 300s` in der bestehenden `location /api/`, falls ein Mailtest abreißt.
3. Eine Obergrenze, wie viele SUPPORT-Mails ein Absender am Tag anstoßen darf.
4. Eine Obergrenze für KI-Mailtest.
5. Am Feld Betreff der Satz: keine Mandantennamen.
6. Das Notfallblatt auf einer Seite.

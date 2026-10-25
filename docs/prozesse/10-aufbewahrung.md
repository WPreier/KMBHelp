# Aufbewahrung und Löschung

Typ: `retention`

## Warum

Steuer- und Lohnunterlagen haben lange Fristen. Die DSGVO verlangt trotzdem ein Löschkonzept für das, was nicht der Frist unterliegt.

## Was die App können muss

Stammdaten je Datenort: Name (BMD, Dateiserver, Backup, M365, Scan, Helpdesk-DB), welche Datenart, Frist in Jahren oder „bis Mandatsende plus n“, ob Backups dieselbe Frist mitziehen oder eine kürzere technische Überdeckung haben, letzter Review.

Ein Review-Ticket alle 365 Tage.

IP-Logs und öffentliche Suchbegriffe folgen den kürzeren Fristen aus `docs/sicherheit.md` und werden technisch gelöscht, nicht nur markiert.

## Nicht

Die App löscht keine BMD-Datenbanken. Sie erinnert und dokumentiert die Entscheidung.

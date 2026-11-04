# Betrieb

Diese Seite ist für den Admin, der `helpdesk.kmbcloud.at` laufen lässt. Die erste Einrichtung steht in `docs/installation-linux.md`. Die Firewall setzt die Kanzlei nach den Firmenvorgaben. Diese Seite enthält keine iptables-Regeln.

## Dienste

Zwei Programme und der Webserver:

```bash
systemctl status kmbhelp-api kmbhelp-worker nginx postfix
```

Bei Apache heißt der Webserver `apache2`. Ein Neustart nach einer Änderung an der API oder am Worker:

```bash
sudo systemctl restart kmbhelp-api kmbhelp-worker
```

Postfix und der Webserver bleiben dabei stehen, solange sich ihre Dateien nicht geändert haben.

Gesundheit:

```bash
curl -fsS https://helpdesk.kmbcloud.at/api/health
```

`worker` steht auf `up`, `down` oder `not_configured`. `smtp` steht auf `up`, wenn Postfix auf `SMTP_SERVER` und `SMTP_PORT` eine Verbindung annimmt, sonst auf `down`. `down` bei Worker oder Postfix macht die Webseite nicht unerreichbar. Die Antwort bleibt 200, solange die Datenbank antwortet. `not_configured` heißt: die Graph-Werte fehlen, der Worker stürzt nicht ab. Das Ergebnis für Postfix wird 30 Sekunden gehalten, damit jede Abfrage nicht neu verbindet.

Das Dashboard unter `/mitarbeit/dashboard` zeigt dieselben Dienste mit einem grünen Häkchen oder einem roten Kreuz: Datenbank, Mail-Worker, Postfix, Verzeichnis, Helpdesk-Mailbox, Ollama und Syslog. Grün heißt, der Dienst antwortet. Rot heißt, er meldet einen Fehler oder ist nicht erreichbar. Beim Verzeichnis zählen ein lesbares, nicht abgelaufenes Zertifikat, eine offene LDAPS-Verbindung und eine Suche mit dem Dienstkonto. Die Mailbox gilt als in Ordnung, wenn die Graph-Anmeldung angenommen wird. Syslog ist grün, sobald ein Ziel gesetzt ist. UDP bestätigt den Empfang nicht. Die Ticketzahlen laden unabhängig von dieser Prüfung.

## Aktualisieren

Die auf GitHub gesicherte Fassung ist der Branch `phase/11-app`. Ein `git pull` ohne Branch holt `main` und damit eine ältere Fassung.

```bash
cd /opt/kmbhelp
sudo -u kmbhelp git fetch origin
sudo -u kmbhelp git checkout phase/11-app
sudo -u kmbhelp git pull --ff-only origin phase/11-app
sudo -u kmbhelp pnpm install --frozen-lockfile
sudo -u kmbhelp pnpm --filter @kmbhelp/web build
sudo -u kmbhelp pnpm db:migrate
sudo systemctl restart kmbhelp-api kmbhelp-worker
```

`git status` muss danach sauber sein. Eine lokale Änderung in `/opt/kmbhelp` gehört nicht auf den Server. Geheimnisse stehen in `/etc/kmbhelp/kmbhelp.env`, nicht im Repository. Die Datei wird beim Aktualisieren nicht überschrieben. `pnpm db:migrate` liest die Datenbank-URL daraus, wenn sie in `.env` fehlt. nginx und Apache unter `/etc` bleiben ebenfalls unberührt. Der Platzhalter `192.0.2.10` und ein leeres `SESSION_SECRET` überstehen ein Update.

## Wenn die Seite 500 antwortet

Die Startseite kommt von nginx aus `/opt/kmbhelp/apps/web/dist`. `/opt/kmbhelp` muss Modus `0751` haben, damit `www-data` das Verzeichnis betreten kann. `0750` ergibt den nginx-Fehler 500, obwohl `index.html` existiert. `.env` bleibt `0600`.

```bash
chmod 751 /opt/kmbhelp
```

Ein leeres `SESSION_SECRET` in `/etc/kmbhelp/kmbhelp.env` beendet die API, bevor sie lauscht. `journalctl -u kmbhelp-api` zeigt dann `SESSION_SECRET must be set in production`. Ein neuer Wert entsteht mit `openssl rand -base64 48`. Danach `sudo systemctl restart kmbhelp-api`.

`API_HOST` ist die interne Adresse des Servers, `192.168.36.55`. Dieselbe Adresse steht in `proxy_pass`. `127.0.0.1` öffnet die Verwaltung für jeden Besucher. `192.0.2.10` ist nur der Platzhalter in der Anleitung. Bleibt er in nginx stehen, läuft `/api/` ins Leere.

Haben sich nur die Datenbank oder die API geändert, reichen Migration und Neustart:

```bash
cd /opt/kmbhelp
sudo -u kmbhelp pnpm db:migrate
sudo systemctl restart kmbhelp-api kmbhelp-worker
```

## Anmeldung

Die Seite `/anmelden` zeigt eine Fehlermeldung direkt unter der Einleitung, in Rot. Ein abgelehntes Passwort, ein fehlendes Konto und ein nicht erreichbares Verzeichnis bleiben nicht ohne Text. Ein Domänenkonto ohne Einmalcode sieht den QR-Code sofort. Der lokale Admin aus `ADMIN_IP_ALLOWLIST` kommt mit Benutzername und Passwort in die Verwaltung. Rechts oben steht dann der Anmeldename.

Ein lokaler Admin entsteht nur durch `pnpm install:helpdesk`. Derselbe Befehl ersetzt ihn, wenn er schon existiert: das alte Konto wird gelöscht und mit dem neuen Benutzernamen und Passwort angelegt. Domänenkonten bleiben. Benutzername und Passwort stehen danach in keiner Datei, nur der Hash in der Tabelle `staff`. Ohne diese Zeile prüft die Anmeldung das eingegebene Konto im Active Directory.

Die öffentliche Seite und die App nennen keine Mitarbeiternamen und keinen Kalender. `GET /api/v1/staff/assignable` und `GET /api/v1/staff/:id/availability` antworten ohne fertige Sitzung mit 401. Ein Dienst sendet `Authorization: Bearer` und den Wert von `MCP_SERVICE_TOKEN`. Eine Verbindung aus `127.0.0.0/8` auf dem Server selbst bleibt ohne Anmeldung frei. Ein anonymes Ticket wird niemandem zugeordnet.

Jede abgelehnte Anmeldung und jeder andere Fehler schreibt eine Zeile nach `/var/lib/kmbhelp/error.log`. Ein Seitenaufruf schreibt nach `/var/lib/kmbhelp/activity.log`, ein Mailvorgang nach `/var/lib/kmbhelp/mail.log`. Dieselben Zeilen der Seiten und Mails stehen in `activity_log`. Die Datei wird nach der Antwort geschrieben, die Anfrage wartet nicht auf die Festplatte. Passwort, Datenbank-URL, Zertifikatstext und Mailtext stehen nicht darin. Die Prüfung „Das Dienstkonto kann nicht suchen.“ steht in `error.log`.

## Konfiguration

Die Seite ist `https://helpdesk.kmbcloud.at/verwaltung/konfiguration`. Sie ist aus `192.168.36.0/24` und `192.168.191.0/24` mit Anmeldung erreichbar, und auf dem Server selbst ohne Anmeldung.

Werte ohne Geheimnis speichert die Seite in der Datenbank und in `.env`. Ein Geheimnis, darunter `SMTP_PASSWD` und `LDAPS_CA_PEM`, schreibt die Seite auf dem Produktionsserver nicht. Es steht in `/etc/kmbhelp/kmbhelp.env`. Danach die API und den Worker neu starten.

Das Domänencontroller-Zertifikat liegt als PEM-Datei unter `/etc/kmbhelp/madc1.crt`, mit `BEGIN CERTIFICATE`, `END CERTIFICATE` und echten Zeilenumbrüchen. `LDAPS_CA_FILE` nennt diesen Pfad. `LDAPS_CA_PEM` bleibt leer. `certificate.missing: Das Zertifikat lässt sich nicht lesen.` heißt, dass ein Wert gesetzt ist, die Datei aber fehlt oder der Text keine Zeilenumbrüche mehr hat. Danach `sudo systemctl restart kmbhelp-api`.

`Prüfen und melden` prüft die Werte und ob `SMTP_SERVER` auf `SMTP_PORT` eine Verbindung annimmt. `SMTP testen` schickt eine kurze Mail über den lokalen Postfix an `SMTP_TO`. Das ist keine Störungsmeldung.

## Fehlermail

Eine KI-Abfrage, die länger als 5 Minuten dauert, legt die ursprüngliche Mail als Ticket mit niedriger Wichtigkeit und der Standardkategorie an. Die Fehlermail nennt das Limit und die Message-ID. Betreff und Text der ursprünglichen Mail stehen darin nicht.

Der erste Weg ist Microsoft Graph an `MAIL_ERROR_TO`, Auslieferung `helpdesk@ppc.at`. Dafür braucht die App-Registrierung `Mail.Send`. Antworten an Melder bleiben Entwürfe.

Gelingt Graph nicht, schickt der lokale Postfix dieselbe Mail an `SMTP_TO`, Auslieferung ebenfalls `helpdesk@ppc.at`. Die Anwendung spricht dabei `SMTP_SERVER` `127.0.0.1`, `SMTP_PORT` `25`, `SMTP_USER` leer, `SMTP_PASSWD` leer und `SMTP_LOGIN` `none`.

Dieser Weg erreicht den Admin unter `helpdesk@ppc.at`. Er erreicht nicht den Chat, in dem die Anwendung gebaut wurde.

Andere Störungen stehen im Journal und unter `/verwaltung/meldungen`. Sie werden nicht einzeln per Mail verschickt.

## Tagesmail

Einmal am Tag, ab `NOTICE_DIGEST_HOUR` (Auslieferung 7) in der Uhr `SYSLOG_UTC_OFFSET`, prüft der Worker die Konfiguration. Gibt es Warnungen oder Fehler, geht eine kurze Liste an `MAIL_ERROR_TO`. Gelingt Graph nicht, übernimmt Postfix an `SMTP_TO`. Hinweise wie der fehlende externe KI-Endpunkt stehen nicht darin. Ist nichts offen, geht keine Mail hinaus.

`NOTICE_DIGEST` leer lässt das auf dem Produktionsserver laufen und auf dem Arbeitsplatz aus. `on` schaltet es überall ein, `off` überall aus. Es gibt einen Versuch am Tag. Gelingt der Versand nicht, steht `digest-failed` im Protokoll, der nächste Versuch ist am nächsten Tag. Die Seite Meldungen zeigt den Stand trotzdem.

## Postfix

```bash
systemctl status postfix
mailq
journalctl -u postfix --since today
```

`mailq` ist leer, wenn nichts wartet. Eine wartende Zeile heißt, die Zustellung nach außen steht aus. Ausgehendes TCP 25 muss nach den Firmenvorgaben erlaubt sein. Ein Relay der Kanzlei gehört in `relayhost` in `/etc/postfix/main.cf`. Den Namen legt diese Anleitung nicht fest. Postfix hört nur auf `127.0.0.1`. Port 25 bleibt von anderen Rechnern aus zu.

Die Datei im Repository ist `infra/postfix/main.cf`. Nach einer Änderung:

```bash
sudo systemctl restart postfix
```

## Sicherung

Stündlich liegt eine Kopie in `/var/backups/kmbhelp/kmbhelp-yyyyMMdd-HH.backup`. Dateien, die älter als sieben Tage sind, werden gelöscht. Das Datenbankpasswort steht nicht in der Ausgabe.

Eine Wiederherstellung ersetzt die laufende Datenbank. Vorher die Dienste anhalten und den Dateinamen einsetzen:

```bash
sudo systemctl stop kmbhelp-api kmbhelp-worker
sudo -u postgres pg_restore --dbname=kmbhelp --clean --if-exists /var/backups/kmbhelp/kmbhelp-yyyyMMdd-HH.backup
sudo systemctl start kmbhelp-api kmbhelp-worker
```

## Zertifikat

Let’s Encrypt erneuert über `certbot.timer`. Port 80 muss aus dem Internet erreichbar bleiben.

```bash
systemctl list-timers certbot.timer
sudo certbot renew --dry-run
```

Nach einer echten Erneuerung den Webserver neu laden: `sudo systemctl reload nginx` oder `sudo systemctl reload apache2`.

## Protokoll

```bash
journalctl -u kmbhelp-api -u kmbhelp-worker --since today
```

Jede Aktion schreibt zusätzlich eine Zeile in die Tabelle `activity_log` und, je nach Art, nach `activity.log`, `error.log` oder `mail.log` im selben Verzeichnis. Die Seite `/verwaltung/protokoll` zeigt die drei Dateien getrennt, jede mit Titel und Tabelle. Von steht auf sieben Tage vor heute, Bis auf heute, beide nebeneinander, in der Form `dd.MM.yyyy`. Neben jeder Tabelle liegen `Als CSV` und `Als PDF` für genau diese Datei. In der Zeile steht der Meldungstext nicht. Die Tabelle `activity_log` bleibt über `GET /api/v1/staff/activity` erreichbar.

Syslog geht an den Server aus der Konfiguration, Auslieferung `192.168.191.215` Port `514` UDP.

## Was zu bleibt

Port 3000 und Port 5432 bleiben von anderen Rechnern aus zu. Die Datenbank hört auf `127.0.0.1`. Die API hört auf der internen Adresse des Servers. `API_HOST` darf in Produktion nicht `127.0.0.1` sein, sonst öffnet die Verwaltung für jeden Besucher ohne Anmeldung.

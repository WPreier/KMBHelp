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

`git status` muss danach sauber sein. Eine lokale Änderung in `/opt/kmbhelp` gehört nicht auf den Server. Geheimnisse stehen in `/etc/kmbhelp/kmbhelp.env`, nicht im Repository. Die Datei wird beim Aktualisieren nicht überschrieben.

Haben sich nur die Datenbank oder die API geändert, reichen Migration und Neustart:

```bash
cd /opt/kmbhelp
sudo -u kmbhelp pnpm db:migrate
sudo systemctl restart kmbhelp-api kmbhelp-worker
```

## Konfiguration

Die Seite ist `https://helpdesk.kmbcloud.at/verwaltung/konfiguration`. Sie ist aus `192.168.36.0/24` und `192.168.191.0/24` mit Anmeldung erreichbar, und auf dem Server selbst ohne Anmeldung.

Werte ohne Geheimnis speichert die Seite in der Datenbank und in `.env`. Ein Geheimnis, darunter `SMTP_PASSWD`, schreibt die Seite auf dem Produktionsserver nicht. Es steht in `/etc/kmbhelp/kmbhelp.env`. Danach die API und den Worker neu starten.

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

Jede Aktion schreibt zusätzlich eine Zeile nach `/var/lib/kmbhelp/activity.log` und in die Tabelle `activity_log`. Die Seite ist `/verwaltung/protokoll`. In der Zeile steht der Meldungstext nicht.

Syslog geht an den Server aus der Konfiguration, Auslieferung `192.168.191.215` Port `514` UDP.

## Was zu bleibt

Port 3000 und Port 5432 bleiben von anderen Rechnern aus zu. Die Datenbank hört auf `127.0.0.1`. Die API hört auf der internen Adresse des Servers. `API_HOST` darf in Produktion nicht `127.0.0.1` sein, sonst öffnet die Verwaltung für jeden Besucher ohne Anmeldung.

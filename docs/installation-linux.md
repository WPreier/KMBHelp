# Installation auf Linux

Diese Anleitung gilt für einen frischen Debian-Rechner, der `helpdesk.kmbcloud.at` ausliefert. nginx und Apache sind Alternativen. Docker ist keine Voraussetzung. Die Beispiele verwenden die Platzhalteradresse `192.0.2.10`. Vor dem Start durch die interne Adresse dieses Servers ersetzen. Die Betriebsskizze liegt in `docs/betriebsskizze.drawio`.

## Größe

Ansatz: 250 Benutzer, 5 IT-Mitarbeiter, 10 Tickets am Tag, 10 Jahre. Die 250 Benutzer sind der Personenkreis. Gleichzeitig arbeiten die 5 Mitarbeiter und einzelne Melder. Eine GPU braucht der Rechner nicht. Architektur ist x86-64.

| Ressource | Ziel | Warum |
|---|---|---|
| CPU | 2 vCPU | Ein Kern trägt API, Worker und den Webserver. Der zweite hält `pg_dump`, Paketupdates und TLS von der Antwortzeit fern. 10 Tickets am Tag füllt einen Kern nicht. |
| Hauptspeicher | 4 GB | Debian ohne Desktop etwa 0,4 GB, PostgreSQL 17 etwa 1 GB, API und Worker zusammen etwa 0,5 GB, nginx oder Apache unter 0,1 GB. Der Rest ist Seiten-Cache und die stündliche Sicherung. 2 GB laufen und tauschen während `pg_dump`. |
| Platte | 80 GB | Der Tickettext bleibt klein. Die 168 Sicherungskopien einer Woche liegen auf derselben Platte. |

Rechnung für die Platte, Stand der Tabellen in diesem Repository:

- 10 Tickets am Tag × 365 × 10 Jahre = 36.500 Tickets.
- Je Ticket etwa 20 KB Text (Betreff, Meldung, Erklärung, Ereignisse). 36.500 × 20 KB sind etwa 0,7 GB. Mit Indexen bleibt der Ticketbestand unter 2 GB. Anhänge liegen in Microsoft 365. Die Datenbank hat dafür keine Binärspalte.
- `access_log` löscht Zeilen nach 90 Tagen (`ACCESS_LOG_RETENTION_DAYS`) und bleibt klein.
- `activity_log` und die Datei `/var/lib/kmbhelp/activity.log` bleiben. Fünf Mitarbeiter mit 30 Protokollzeilen am Tag und 250 Benutzer mit zwei Besuchen in der Woche bleiben über 10 Jahre zusammen unter 2 GB. Wird die Seite deutlich öfter aufgerufen, wächst nur dieses Protokoll.
- PostgreSQL inklusive WAL und Freiplatz: 8 GB reichen für diesen Ansatz.
- Betriebssystem, Pakete und `/opt/kmbhelp`: etwa 10 GB.
- Die Sicherung läuft stündlich und behält 7 Tage: 24 × 7 = 168 Dateien. Bei einer Datenbank von 2 GB ist eine Custom-Kopie oft 0,3 bis 0,6 GB. 168 Kopien sind dann 50 bis 100 GB.

80 GB sind das Ziel, wenn die Kopien auf dem Server bleiben. Liegt `/var/backups/kmbhelp` auf einem anderen Datenträger, reichen auf dem Server 40 GB. Ein Desktop-Paket und eine zweite Datenbank sind in dieser Rechnung nicht enthalten.

## Debian

Debian 13 „trixie“, 64-Bit, ohne grafische Oberfläche. Bei der Installation nur den SSH-Server und die Standard-Systemwerkzeuge auswählen. Zeitzone `Europe/Vienna`. Locale `de_DE.UTF-8`. Der DNS-Name der Anwendung ist `helpdesk.kmbcloud.at`.

Nach dem ersten Start:

```bash
sudo apt update
sudo apt full-upgrade
sudo timedatectl set-timezone Europe/Vienna
sudo reboot
```

Ein Neustart nach `full-upgrade` übernimmt einen neuen Kernel. Danach `timedatectl` prüfen: die Uhr ist synchron. TLS und LDAPS scheitern bei einer falschen Uhrzeit.

## Pakete

Zuerst die Verwaltungswerkzeuge, die auf jedem Debian-Server dieser Kanzlei liegen. Ein Befehl installiert sie:

```bash
sudo apt install --yes \
  ca-certificates \
  curl \
  gnupg \
  sudo \
  openssh-server \
  net-tools \
  iproute2 \
  bind9-dnsutils \
  traceroute \
  mtr-tiny \
  vim-nox \
  less \
  htop \
  tmux \
  lsof \
  psmisc \
  rsync \
  unzip \
  wget \
  git \
  bash-completion \
  man-db \
  unattended-upgrades \
  chrony \
  build-essential \
  python3
```

| Paket | Wofür |
|---|---|
| `net-tools` | `ifconfig`, `netstat`, `arp`, `route` |
| `iproute2` | `ip` und `ss`. Oft schon durch das Basissystem da |
| `bind9-dnsutils` | `dig` und `nslookup` |
| `traceroute`, `mtr-tiny` | Weg zu `MADC1.kmbcloud.at` und zu Microsoft |
| `lsof` | Welcher Prozess einen Port hält |
| `psmisc` | `fuser`, `killall`, `pstree` |
| `chrony` | Uhrzeit |
| `unattended-upgrades` | Sicherheitsupdates aus Debian |
| `build-essential`, `python3` | `argon2` kann beim Installieren ein natives Modul bauen |
| `git` | Das Repository unter `/opt/kmbhelp` |

PostgreSQL 17 kommt aus Debian 13:

```bash
sudo apt install --yes postgresql-17 postgresql-client-17
psql --version
pg_dump --version
```

Beide Ausgaben nennen die Version 17. `pg_dump` muss im `PATH` von Benutzer `kmbhelp` liegen. Der Weg ist `/usr/bin/pg_dump`.

Node.js: Debian 13 liefert das Paket `nodejs` in Version 20.19. KMBHelp verlangt Node 22, Zeile `engines` in `package.json`. Das Debian-Paket bleibt ungeinstalliert. Node 22 kommt aus dem NodeSource-Repository für die 22er-Linie:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install --yes nodejs
node -v
corepack enable
corepack prepare pnpm@10.19.0 --activate
pnpm -v
```

`node -v` beginnt mit `v22`. `pnpm -v` zeigt `10.19.0`. Beginnt `node -v` mit `v20`, ist das Debian-Paket aktiv. Wer kein fremdes APT-Repository einträgt, nimmt das Archiv `linux-x64` aus `https://nodejs.org/dist/latest-v22.x/` und legt `node`, `corepack` und `npm` nach `/usr/local/bin`. Danach dieselben zwei Corepack-Befehle.

Den Webserver einzeln wählen. Beide gleichzeitig zu installieren erzeugt zwei Dienste auf Port 80 und 443.

nginx:

```bash
sudo apt install --yes nginx
```

Apache:

```bash
sudo apt install --yes apache2
```

## Benutzer und Verzeichnisse

```bash
sudo adduser --system --group --home /var/lib/kmbhelp --shell /usr/sbin/nologin kmbhelp
sudo install -d -o root -g kmbhelp -m 0750 /etc/kmbhelp /etc/kmbhelp/tls
sudo install -d -o kmbhelp -g kmbhelp -m 0750 /var/lib/kmbhelp /var/backups/kmbhelp /opt/kmbhelp
```

Das Repository liegt unter `/opt/kmbhelp` und gehört `kmbhelp`. Zertifikat und Schlüssel der Kanzlei liegen unter `/etc/kmbhelp/tls/`, das MADC1-Zertifikat unter `/etc/kmbhelp/madc1.crt`. Diese Dateien bleiben außerhalb von Git.

## PostgreSQL

Die Rolle `kmbhelp` ist Eigentümer der Datenbank `kmbhelp`. Sie ist kein Superuser und darf keine weiteren Datenbanken oder Rollen anlegen. Eigentümer ist sie, weil Migrationen Tabellen anlegen und eine Fehlinterpretation den Append-only-Trigger an genau einem Ticket kurz aussetzt. Beides braucht den Eigentümer.

`infra/postgres/kmbhelp-role.sql` enthält das Passwort `replace-me`. Die Datei lokal kopieren, das Passwort ersetzen, als PostgreSQL-Superuser ausführen und die Kopie danach löschen. Dieselbe URL steht nur in `/etc/kmbhelp/kmbhelp.env`.

Die Datenbank hört auf `127.0.0.1`. Port 5432 bleibt von anderen Rechnern aus zu.

## Anwendung

```bash
sudo -u kmbhelp git clone https://github.com/WPreier/KMBHelp.git /opt/kmbhelp
cd /opt/kmbhelp
sudo -u kmbhelp cp .env.example .env
```

In `/opt/kmbhelp/.env` stehen die Werte ohne Geheimnis, darunter `PUBLIC_ORIGIN=https://helpdesk.kmbcloud.at` und die drei `VITE_PUBLIC_URL_*`-Adressen. Geheimnisse stehen dort nicht. Danach:

```bash
sudo -u kmbhelp pnpm install --frozen-lockfile
sudo -u kmbhelp pnpm --filter @kmbhelp/web build
sudo -u kmbhelp pnpm db:migrate
sudo -u kmbhelp pnpm db:seed
```

Der Vite-Build liest die `VITE_`-Werte aus `.env`. Nach einer Änderung dieser Adressen den Build wiederholen.

Die Unit-Datei setzt `NODE_ENV=production`. Damit liest die API `secrets.json` nicht. Jedes Geheimnis steht in `/etc/kmbhelp/kmbhelp.env`. Die Vorlage ist `infra/kmbhelp.env.example`. Die echte Datei gehört `root:kmbhelp`, Modus `0640`. `SESSION_SECRET` ist ein langer Zufallswert. `ALLOW_TEST_AUTH` bleibt leer. `LDAPS_CA_FILE` zeigt auf `/etc/kmbhelp/madc1.crt`.

Die Konfigurationsseite speichert in Produktion Werte ohne Geheimnis in `app_setting` und in `.env`. Ein Geheimnis speichert sie dort nicht. Ein neues Geheimnis wird in `/etc/kmbhelp/kmbhelp.env` eingetragen, danach folgt der Neustart.

Den lokalen Admin einmal anlegen und die Werte danach aus der Shell-History entfernen:

```bash
sudo -u kmbhelp env LOCAL_ADMIN_USERNAME='…' LOCAL_ADMIN_PASSWORD='…' pnpm install:helpdesk
```

## API-Adresse

`API_HOST` in `/etc/kmbhelp/kmbhelp.env` ist die interne Adresse dieses Servers, in den Beispielen `192.0.2.10`. Dieselbe Adresse steht in der nginx- oder Apache-Datei und in `ADMIN_IP_ALLOWLIST`, sonst erreicht niemand die Verwaltung über die Website.

Steht `API_HOST` auf `127.0.0.1` und leitet der Proxy auf demselben Rechner dorthin, sieht die API jeden Besucher als localhost. Die Verwaltung öffnet dann ohne Anmeldung. `X-Forwarded-For` ändert das nicht. Der Socket zeigt die Proxy-Adresse, also die interne Adresse des Servers, nicht die Adresse des Browsers.

Port 3000 nimmt nur Verbindungen dieser internen Adresse an. Nach außen offen sind TCP 443 für die Seite und TCP 80 für die Zertifikatsprüfung. Port 5432 bleibt zu.

## systemd

```bash
sudo cp /opt/kmbhelp/infra/systemd/kmbhelp-api.service /etc/systemd/system/
sudo cp /opt/kmbhelp/infra/systemd/kmbhelp-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now kmbhelp-api kmbhelp-worker
```

Beide Units lesen `/etc/kmbhelp/kmbhelp.env`. Der Worker hat keinen eigenen Port. `GET /api/health` zeigt, ob er läuft.

## nginx oder Apache

Eine der beiden Dateien einsetzen und `192.0.2.10` ersetzen. Die Website kommt aus `/opt/kmbhelp/apps/web/dist`. Pfade unter `/api/` gehen an die API. Alle anderen Pfade liefern `index.html`, damit die React-Routen funktionieren.

Die TLS-Pfade in den Beispielen sind:

- Zertifikat `/etc/kmbhelp/tls/fullchain.pem`
- Schlüssel `/etc/kmbhelp/tls/privkey.pem`

Der Webserver startet erst, wenn beide Dateien existieren. Für den ersten Start reicht ein kurzes selbstsigniertes Paar. Certbot ersetzt es im nächsten Abschnitt.

```bash
sudo openssl req -x509 -nodes -newkey rsa:2048 -days 2 \
  -keyout /etc/kmbhelp/tls/privkey.pem \
  -out /etc/kmbhelp/tls/fullchain.pem \
  -subj "/CN=helpdesk.kmbcloud.at"
```

nginx:

```bash
sudo cp /opt/kmbhelp/infra/nginx/helpdesk.conf /etc/nginx/sites-available/kmbhelp.conf
sudo ln -sfn /etc/nginx/sites-available/kmbhelp.conf /etc/nginx/sites-enabled/kmbhelp.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

In `infra/nginx/helpdesk.conf` bedient `location ^~ /.well-known/acme-challenge/` den Ordner `/var/www/acme`. Der übrige Verkehr auf Port 80 geht nach HTTPS.

Apache:

```bash
sudo a2enmod ssl proxy proxy_http rewrite
sudo a2dissite 000-default
sudo cp /opt/kmbhelp/infra/apache/helpdesk.conf /etc/apache2/sites-available/kmbhelp.conf
sudo a2ensite kmbhelp
sudo apache2ctl configtest && sudo systemctl reload apache2
```

In `infra/apache/helpdesk.conf` gilt auf Port 80: `Alias` und `Directory` für `/var/www/acme/.well-known/acme-challenge/`, danach eine Rewrite-Regel, die diesen Pfad ausliefert und alles andere nach HTTPS schickt. `a2enmod rewrite` ist dafür nötig.

### Zertifikat mit Certbot

Certbot holt und erneuert das Zertifikat per HTTP-01. Die Prüfstelle lädt `http://helpdesk.kmbcloud.at/.well-known/acme-challenge/…` von außen. Dafür ist TCP-Port 80 aus dem Internet erreichbar, nicht nur aus `192.168.36.0/24` und `192.168.191.0/24`. Dieselbe Prüfung läuft bei jeder Erneuerung. Port 80 bleibt deshalb dauerhaft offen. Die Firewall und eine vorgeschaltete NAT-Regel lassen TCP 80 und TCP 443 herein. Port 3000 und Port 5432 bleiben von außen zu.

Die Prüfdatei liegt unter `/var/www/acme/.well-known/acme-challenge/`. Diesen Pfad beantwortet Port 80 direkt. Jede andere Adresse auf Port 80 geht nach HTTPS. Eine Umleitung der Prüfdatei auf HTTPS scheitert beim ersten Abruf, weil das selbstsignierte Zertifikat von der Prüfstelle nicht als Nachweis gilt. Der Webserver aus dem vorigen Abschnitt muss auf Port 80 schon laufen.

```bash
sudo apt install --yes certbot
sudo install -d -o root -g root -m 0755 /var/www/acme/.well-known/acme-challenge
```

Das Paket `certbot` genügt. `python3-certbot-nginx` und `python3-certbot-apache` bleiben weg: diese Plugins schreiben die Site um und können die Weiterleitung von `/api/` an die interne Adresse ändern. Der Abruf benutzt den Webroot:

```bash
sudo certbot certonly --webroot -w /var/www/acme -d helpdesk.kmbcloud.at
```

Certbot legt die Dateien nach `/etc/letsencrypt/live/helpdesk.kmbcloud.at/`. Die Site-Dateien zeigen weiter auf `/etc/kmbhelp/tls/`. Zwei Symlinks ersetzen das selbstsignierte Paar. nginx und Apache lesen den Schlüssel beim Start als root.

```bash
sudo ln -sfn /etc/letsencrypt/live/helpdesk.kmbcloud.at/fullchain.pem /etc/kmbhelp/tls/fullchain.pem
sudo ln -sfn /etc/letsencrypt/live/helpdesk.kmbcloud.at/privkey.pem /etc/kmbhelp/tls/privkey.pem
sudo systemctl reload nginx
```

Bei Apache heißt der letzte Befehl `sudo systemctl reload apache2`.

Die Erneuerung prüft Debian über `certbot.timer`, zweimal am Tag. Ein Probelauf:

```bash
systemctl list-timers certbot.timer
sudo certbot renew --dry-run
```

Der Probelauf muss die Datei über Port 80 von außen lesen können. Nach einer echten Erneuerung den Webserver neu laden, damit er das neue Zertifikat nimmt. Ein Deploy-Hook kann das übernehmen, zum Beispiel `/etc/letsencrypt/renewal-hooks/deploy/reload-web.sh` mit `systemctl reload nginx` oder `systemctl reload apache2`.

## Sicherung

`infra/cron/kmbhelp-backup` startet stündlich `scripts/backup-database.mjs` als Benutzer `kmbhelp`. Das Skript liest `DATABASE_URL` aus `/etc/kmbhelp/kmbhelp.env`, schreibt `pg_dump` im Custom-Format nach `/var/backups/kmbhelp/kmbhelp-yyyyMMdd-HH.backup` und löscht Dateien, die älter als sieben Tage sind. Das Passwort erscheint nicht in der Ausgabe.

```bash
sudo cp /opt/kmbhelp/infra/cron/kmbhelp-backup /etc/cron.d/kmbhelp-backup
sudo chmod 644 /etc/cron.d/kmbhelp-backup
```

Eine Kopie im Git gibt es nicht.

## Upgrade

Im Verzeichnis `/opt/kmbhelp`, als Benutzer `kmbhelp` für pnpm:

```bash
sudo -u kmbhelp git pull
sudo -u kmbhelp pnpm install --frozen-lockfile
sudo -u kmbhelp pnpm --filter @kmbhelp/web build
sudo -u kmbhelp pnpm db:migrate && sudo systemctl restart kmbhelp-api kmbhelp-worker
```

Haben sich nur die Datenbank oder die API geändert, reicht:

```bash
sudo -u kmbhelp pnpm db:migrate && sudo systemctl restart kmbhelp-api kmbhelp-worker
```

## Prüfung

```bash
curl -fsS http://192.0.2.10:3000/api/health
curl -fsS https://helpdesk.kmbcloud.at/api/health
```

Beide Antworten enthalten `"database":"up"` und `"worker":"up"`. Die Seite `https://helpdesk.kmbcloud.at` zeigt die öffentliche Liste. Die Verwaltung unter `/verwaltung` verlangt eine Anmeldung. Eine direkte Verbindung von `127.0.0.1` auf die API öffnet die Verwaltung ohne Anmeldung. Das bleibt so und gilt nur für den Socket, nicht für Besucher über den Proxy.

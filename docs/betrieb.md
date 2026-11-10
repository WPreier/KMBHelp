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

`worker` steht auf `up`, `down` oder `not_configured`. `smtp` steht auf `up`, wenn Postfix auf `MAIL_SMTP_SERVER` und `MAIL_SMTP_PORT` eine Verbindung annimmt, sonst auf `down`. `down` bei Worker oder Postfix macht die Webseite nicht unerreichbar. Die Antwort bleibt 200, solange die Datenbank antwortet. `not_configured` heißt: die Graph-Werte fehlen, der Worker stürzt nicht ab. Das Ergebnis für Postfix wird 30 Sekunden gehalten, damit jede Abfrage nicht neu verbindet.

Das Dashboard unter `/mitarbeit/dashboard` zeigt die Ticketzahlen. Die Dienste stehen unter `/verwaltung/tests`, nur für Administratoren: Datenbank, Mail-Worker, Postfix, Verzeichnis, Helpdesk-Mailbox, Ollama und Syslog. Links neben jedem Dienst steht der Knopf T. Er prüft nur diesen Dienst und setzt danach das grüne Häkchen oder das rote Kreuz. Grün heißt, der Dienst antwortet. Rot heißt, er meldet einen Fehler oder ist nicht erreichbar. Beim Verzeichnis zählen ein lesbares, nicht abgelaufenes Zertifikat, eine offene LDAPS-Verbindung und eine Suche mit dem Dienstkonto. Die Mailbox gilt als in Ordnung, wenn die Graph-Anmeldung angenommen wird. Syslog ist grün, sobald ein Ziel gesetzt ist. UDP bestätigt den Empfang nicht.

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

`git status` muss danach sauber sein. Eine lokale Änderung in `/opt/kmbhelp` gehört nicht auf den Server.

## Version

Der Stand steht in `version.md` im Projektroot. Auf dem Server ist das `/opt/kmbhelp/version.md`. Die Fassung heißt `V 0.2.16`: Major, Minor, Patch. Jedes Update auf `kmbhelp` erhöht den Patch und bekommt im selben Commit einen Abschnitt mit Datum, Commit und einer Zusammenfassung. Die Minor-Stelle steigt nur, wenn Wolfgang das ausdrücklich sagt. Die Major-Stelle steigt erst, wenn der Kunde tatsächlich mit KMBHelp arbeitet. Die `version` in `package.json` ist keine Kundenfassung.

 Geheimnisse stehen in `/etc/kmbhelp/kmbhelp.env`, nicht im Repository. Die Datei wird beim Aktualisieren nicht überschrieben. `pnpm db:migrate` liest die Datenbank-URL daraus, wenn sie in `.env` fehlt. nginx und Apache unter `/etc` bleiben ebenfalls unberührt. Der Platzhalter `192.0.2.10` und ein leeres `SESSION_SECRET` überstehen ein Update.

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

Die Seite `/anmelden` zeigt keinen Einleitungstext zu Domänen und Ticketrechten. Der Knopf heißt Mit Passwort anmelden. Darunter steht das Passkey-Feld. Es gilt zusammen mit der E-Mail darüber. Eine Fehlermeldung steht direkt unter der Überschrift, in Rot. Ein abgelehntes Passwort, ein fehlendes Konto und ein nicht erreichbares Verzeichnis bleiben nicht ohne Text. Nach der Anmeldung steht dort „Angemeldet als Administrator mit …“ oder „Angemeldet als Benutzer mit …“, mit der E-Mail des angemeldeten Kontos, darunter Abmelden. Abmelden beendet die Sitzung in der Datenbank und löscht die Anmelde-Cookies. Darunter zeigt die Seite den QR-Code und den lesbaren Code für 1Password oder eine Authenticator-App. Ein Feld und der Knopf Teste Passkey jetzt prüfen die eingegebene Zahl und schreiben „Passkey akzeptiert“ oder „Passkey falsch“. Bei der nächsten Anmeldung genügen dann die E-Mail und der sechsstellige Code. Jede Anmeldung, die Prüfung und die Abmeldung gehen ins Aktivitätsprotokoll und zusätzlich per Syslog. Der Aufruf der Seite `/anmelden` ebenfalls. Der lokale Admin aus `ADMIN_IP_ALLOWLIST` kommt mit Benutzername und Passwort in die Verwaltung. Rechts oben steht dann der Anmeldename.

Ein lokaler Admin entsteht nur durch `pnpm install:helpdesk`. Derselbe Befehl ersetzt ihn, wenn er schon existiert: das alte Konto wird gelöscht und mit dem neuen Benutzernamen und Passwort angelegt. Domänenkonten bleiben. Benutzername und Passwort stehen danach in keiner Datei, nur der Hash in der Tabelle `staff`. Ohne diese Zeile prüft die Anmeldung das eingegebene Konto im Active Directory.

Die öffentliche Seite und die App nennen keine Mitarbeiternamen und keinen Kalender. `GET /api/v1/staff/assignable` und `GET /api/v1/staff/:id/availability` antworten ohne fertige Sitzung mit 401. Ein Dienst sendet `Authorization: Bearer` und den Wert von `MCP_SERVICE_TOKEN`. Eine Verbindung aus `127.0.0.0/8` auf dem Server selbst bleibt ohne Anmeldung frei. Ein anonymes Ticket wird niemandem zugeordnet.

`LOG_ROTATE_DAYS` steht auf 30. Der Worker prüft einmal am Tag, ab Mitternacht. Sind die Protokolldateien so alt, benennt er `activity.log`, `error.log`, `mail.log` und `ki.log` um. Der neue Name endet auf `_ddMMyyyy`, zum Beispiel `activity.log_07112026`. Danach fangen die Dateien leer an.

Jede abgelehnte Anmeldung und jeder andere Fehler schreibt eine Zeile nach `/var/lib/kmbhelp/error.log`. Ein Seitenaufruf schreibt nach `/var/lib/kmbhelp/activity.log`, ein Mailvorgang und jeder Zugriff auf `helpdesk@kmbcloud.at` nach `/var/lib/kmbhelp/mail.log`, jede Modellanfrage nach `/var/lib/kmbhelp/ki.log`. Dieselben Zeilen der Seiten und Mails stehen in `activity_log`. Die Datei wird nach der Antwort geschrieben, die Anfrage wartet nicht auf die Festplatte. Passwort, Datenbank-URL und Zertifikatstext stehen nicht darin. Der Mailtext steht nur maskiert in `ki.log`. Die Prüfung „Das Dienstkonto kann nicht suchen.“ steht in `error.log`.

## Konfiguration

Die Seite ist `https://helpdesk.kmbcloud.at/verwaltung/konfiguration`. Sie ist aus `192.168.36.0/24` und `192.168.191.0/24` mit Anmeldung erreichbar, und auf dem Server selbst ohne Anmeldung.

Die Konfiguration steht alphabetisch. Ältere Namen wie `OLLAMA_URL`, `SMTP_SERVER`, `NOTICE_DIGEST` und `AI_ENDPOINT` werden noch gelesen, solange der neue Name leer ist. Werte ohne Geheimnis speichert die Seite in der Datenbank und in `.env`. Ein Geheimnis, darunter `MAIL_SMTP_PASSWD` und `LDAPS_CA_PEM`, schreibt die Seite auf dem Produktionsserver nicht. Es steht in `/etc/kmbhelp/kmbhelp.env`. Danach die API und den Worker neu starten. Die eigenen Blöcke Syslog-Server und Lokaler SMTP sind von dieser Seite entfernt. Syslog und SMTP bleiben als einzelne Felder in der Liste. Der Knopf T bei den Diensten prüft die Erreichbarkeit, er verschickt keine Mail.

Dieser Arbeitsplatz liest `/etc/kmbhelp/kmbhelp.env` nicht. Die lokale Datei ist `.env` im Projektordner. Leere Schlüssel füllt danach `%LOCALAPPDATA%\kmbhelp\dev.env`, dann `%LOCALAPPDATA%\kmbhelp\secrets.json`. Ein gespeicherter Wert ohne Geheimnis aus der Datenbank gilt beim nächsten Start vor beiden Dateien.

In der lokalen `.env` müssen diese Einträge stehen, weil sie diesen Rechner beschreiben und die zentrale Datei sie nicht liefert:

- `DATABASE_URL`
- `API_HOST` mit `127.0.0.1`
- `API_PORT`
- `PUBLIC_ORIGIN` mit `http://127.0.0.1:5173`

Dieselben vier Namen stehen auf dem Server mit den Serverwerten. `API_HOST` ist dort die interne Adresse, `PUBLIC_ORIGIN` ist `https://helpdesk.kmbcloud.at`.

Geheimnisse schreibt die Konfigurationsseite lokal nach `secrets.json` und auf dem Server nicht. Sie können in der lokalen `.env` stehen, sonst in `secrets.json`. Auf dem Server stehen sie in `/etc/kmbhelp/kmbhelp.env`:

- `SESSION_SECRET`
- `LDAPS_BIND_PASSWORD`
- `LDAPS_CA_PEM`
- `GRAPH_CLIENT_SECRET`
- `MAIL_SMTP_PASSWD`
- `SEARCH_AI_API_KEY`
- `SEARCH_MODEL_PASSWORD`
- `SEARCH_MODEL_API_KEY`
- `MCP_SERVICE_TOKEN`
- `DATABASE_URL` zusätzlich, weil der Serverprozess sie von dort liest

`LOCAL_ADMIN_PASSWORD` bleibt nur für den einmaligen Befehl `pnpm install:helpdesk` in der Shell. Danach wird es nicht gespeichert.

In der zentralen Datei `/etc/kmbhelp/kmbhelp.env` können alle übrigen Einträge stehen. Ein Wert ohne Geheimnis, der auf der Konfigurationsseite gespeichert ist, gilt danach vor der Datei. Das sind:

`ALLOW_TEST_AUTH`, `EMAIL_AUTH_DOMAINS`, `ADMIN_IP_ALLOWLIST`, `API_HOST`, `API_PORT`, `PUBLIC_ORIGIN`, `LDAPS_URL`, `LDAPS_BIND_DN`, `LDAPS_BASE_DN`, `LDAPS_GROUP_DN`, `LDAPS_CA_FILE`, `SYSLOG_HOST`, `SYSLOG_PORT`, `SYSLOG_NAME`, `SYSLOG_FACILITY`, `SYSLOG_UTC_OFFSET`, `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_MAILBOX`, `ONCALL_EMAIL`, `FALLBACK_CATEGORY`, `CALENDAR_DEFAULT_MINUTES`, `CALENDAR_DELAY_P1`, `CALENDAR_DELAY_P2`, `CALENDAR_DELAY_P3`, `WORKER_SCHEDULE`, `ACCESS_LOG_RETENTION_DAYS`, `LOG_ROTATE_DAYS`, `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`, `SEARCH_AI_PROVIDER`, `INTERNAL_MAIL_DOMAINS`, `MAILCHECK_KI_URL`, `MAILCHECK_KI_MODEL`, `MAIL_ERROR_TO`, `MAIL_SMTP_SERVER`, `MAIL_SMTP_PORT`, `MAIL_SMTP_USER`, `MAIL_SMTP_LOGIN`, `MAIL_SMTP_TO`, `MAIL_NOTICE_DIGEST`, `MAIL_NOTICE_DIGEST_HOUR`, `MAIL_AI_PROMPT`, `SEARCH_AI_ENDPOINT`, `SEARCH_AI_REGION`, `SEARCH_AI_AVV_REFERENCE`, `SEARCH_AI_AUTO_REPLY_CATEGORIES`, `TICKET_FILE_TYPES`, `TICKET_FILE_MAX_BYTES`, `TICKET_ARCHIVE_DIR`, `SEARCH_MODEL_URL`, `SEARCH_MODEL_NAME`, `SEARCH_MODEL_INTERFACE`, `SEARCH_MODEL_CALL`, `SEARCH_MODEL_USER`, `SEARCH_MODEL_API_ID`, `LOCAL_ADMIN_USERNAME`.

`VITE_PUBLIC_URL_WWW`, `VITE_PUBLIC_URL_HOME` und `VITE_PUBLIC_URL_WIKI` liest nur der Bau der Webseite aus der `.env` im Projektordner. Auf dem Server ist das `/opt/kmbhelp/.env`. Die zentrale Datei liefert sie dem Bau nicht.

`ALLOW_TEST_AUTH` bleibt auf dem Server leer. `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`, `LDAPS_CA_FILE`, `ACTIVITY_LOG_FILE` und `TICKET_ARCHIVE_DIR` nennen Pfade oder Namen dieses Rechners. Der Arbeitsplatz behält dafür eigene Werte. `ACTIVITY_LOG_FILE` ist kein Feld der Konfigurationsseite. Leer heißt lokal `%LOCALAPPDATA%\kmbhelp` und auf dem Server `/var/lib/kmbhelp`.

Die vollständige Vorlage für den Arbeitsplatz ist `.env.example` im Projektordner. Auf dem Server liegt dieselbe Datei unter `/opt/kmbhelp/.env.example`. Die Vorlage für die zentrale Datei ist `infra/kmbhelp.env.example`, auf dem Server `/opt/kmbhelp/infra/kmbhelp.env.example`. Beide nennen dieselben Schlüssel. Geheimnisse sind leer. Ein Update ersetzt `.env` und `/etc/kmbhelp/kmbhelp.env` nicht.

Das Domänencontroller-Zertifikat liegt als PEM-Datei unter `/etc/kmbhelp/madc1.crt`, mit `BEGIN CERTIFICATE`, `END CERTIFICATE` und echten Zeilenumbrüchen. `LDAPS_CA_FILE` nennt diesen Pfad. `LDAPS_CA_PEM` bleibt leer. `certificate.missing: Das Zertifikat lässt sich nicht lesen.` heißt, dass ein Wert gesetzt ist, die Datei aber fehlt oder der Text keine Zeilenumbrüche mehr hat. Danach `sudo systemctl restart kmbhelp-api`.

`Prüfen und melden` prüft die Werte. Ob `MAIL_SMTP_SERVER` auf `MAIL_SMTP_PORT` eine Verbindung annimmt, zeigt der Dienst Postfix über den Knopf T.

## Fehlermail

Eine KI-Abfrage, die länger als 5 Minuten dauert, legt die ursprüngliche Mail als Ticket mit niedriger Wichtigkeit und der Standardkategorie an. Die Fehlermail nennt das Limit und die Message-ID. Betreff und Text der ursprünglichen Mail stehen darin nicht.

Der erste Weg ist Microsoft Graph an `MAIL_ERROR_TO`, Auslieferung `helpdesk@ppc.at`. Dafür braucht die App-Registrierung `Mail.Send`. Antworten an Melder bleiben Entwürfe.

Gelingt Graph nicht, schickt der lokale Postfix dieselbe Mail an `MAIL_SMTP_TO`, Auslieferung ebenfalls `helpdesk@ppc.at`. Die Anwendung spricht dabei `MAIL_SMTP_SERVER` `127.0.0.1`, `MAIL_SMTP_PORT` `25`, `MAIL_SMTP_USER` leer, `MAIL_SMTP_PASSWD` leer und `MAIL_SMTP_LOGIN` `none`.

Dieser Weg erreicht den Admin unter `helpdesk@ppc.at`. Er erreicht nicht den Chat, in dem die Anwendung gebaut wurde.

Andere Störungen stehen im Journal und unter `/verwaltung/meldungen`. Sie werden nicht einzeln per Mail verschickt.

## Tagesmail

Einmal am Tag, ab `MAIL_NOTICE_DIGEST_HOUR` (Auslieferung 7) in der Uhr `SYSLOG_UTC_OFFSET`, prüft der Worker die Konfiguration. Gibt es Warnungen oder Fehler, geht eine kurze Liste an `MAIL_ERROR_TO`. Gelingt Graph nicht, übernimmt Postfix an `MAIL_SMTP_TO`. Hinweise wie der fehlende externe KI-Endpunkt stehen nicht darin. Ist nichts offen, geht keine Mail hinaus.

`MAIL_NOTICE_DIGEST` leer lässt das auf dem Produktionsserver laufen und auf dem Arbeitsplatz aus. `on` schaltet es überall ein, `off` überall aus. Es gibt einen Versuch am Tag. Gelingt der Versand nicht, steht `digest-failed` im Protokoll, der nächste Versuch ist am nächsten Tag. Die Seite Meldungen zeigt den Stand trotzdem.

## Ticketarchiv

Der Worker prüft jede Minute, ob in Europa/Wien ein Werktag 23:00 erreicht oder ein früherer Werktagsabend verpasst wurde. Vorgemerkte Tickets und schon geschlossene Tickets ohne Archiv schreibt er nach `TICKET_ARCHIVE_DIR`. Leer heißt auf dem Server `/var/lib/kmbhelp/archiv/{code}/`. Darin liegen `index.html`, `ticket.md`, `summary.md`, `fazit.md`, `ticket.pdf` und der Ordner `dateien` mit den Originalen. `index.html` zeigt das vollständige Ticket und verlinkt Summary, Fazit, das PDF und die Dateien mit Name, Größe und Datum. Die Ticketseite merkt sich `last_editor` und `updated_at` bei jedem Speichern. `TICKET_FILE_TYPES` und `TICKET_FILE_MAX_BYTES` begrenzen die Anhänge. Ein leeres Feld benutzt png, jpg, jpeg, gif, webp, bmp, tif, tiff, pdf, docx, xlsx, pptx, txt, csv, md und 10485760 Bytes. Der Inhalt muss zur Endung passen. Die Seite im Web unter `/archiv/{code}` zeigt denselben Inhalt nur mit Staff-Sitzung, lokalem Admin oder Dienst-Token. Das PDF ist der Text des Berichts. Bilder und Excel werden nicht in das PDF gezeichnet. Die Originale liegen daneben. Fazit und Summary bleiben in der Datenbank. Beschreibung, Bearbeitung und Dateien werden danach aus der Datenbank gelöscht. Das Verzeichnis liegt nicht im Webroot.

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

Jede Aktion schreibt zusätzlich eine Zeile in die Tabelle `activity_log` und, je nach Art, nach `activity.log`, `error.log`, `mail.log` oder `ki.log` im selben Verzeichnis. `mail.log` nennt jeden Graph-Zugriff auf `helpdesk@kmbcloud.at`. `ki.log` nennt jede Anfrage an kmblmt1 mit Modell, Dauer, Status, Antwort und maskiertem Auftrag. Die Seite `/verwaltung/protokoll` zeigt die vier Dateien getrennt, jede mit Titel und Tabelle. Von steht auf sieben Tage vor heute, Bis auf heute, beide nebeneinander, in der Form `dd.MM.yyyy`. Neben jeder Tabelle liegen `Als CSV` und `Als PDF` für genau diese Datei. In Aktivität, Fehler und Mail steht der Meldungstext nicht. In `ki.log` steht der maskierte Auftrag. Die Tabelle `activity_log` bleibt über `GET /api/v1/staff/activity` erreichbar.

Syslog geht an den Server aus der Konfiguration, Auslieferung `192.168.191.215` Port `514` UDP.

## Was zu bleibt

Port 3000 und Port 5432 bleiben von anderen Rechnern aus zu. Die Datenbank hört auf `127.0.0.1`. Die API hört auf der internen Adresse des Servers. `API_HOST` darf in Produktion nicht `127.0.0.1` sein, sonst öffnet die Verwaltung für jeden Besucher ohne Anmeldung.

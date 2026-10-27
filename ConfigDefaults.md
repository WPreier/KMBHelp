# KMBHelp — Auslieferungszustand

Diese Datei beschreibt die Werte, mit denen eine frische Installation startet. Zugangsdaten der Kanzlei stehen nicht hier. Sie liegen auf dem jeweiligen Rechner in einer Datei, die nur der Benutzer des Prozesses lesen kann.

## Anmeldung und Verzeichnis

| Wert | Auslieferung | Bedeutung |
|---|---|---|
| `LDAPS_URL` | `ldaps://MADC1.kmbcloud.at:636` | Der einzige Domänencontroller. Der Start prüft genau diesen Namen. |
| `LDAPS_BIND_DN` | leer | Dienstkonto. Ohne Bind-DN, Passwort, Basis-DN und Gruppen-DN bleibt die Verzeichnisprüfung aus und die Anmeldung antwortet 503. |
| `LDAPS_BIND_PASSWORD` | leer | Wird nie geloggt und nie in der Konfigurationsseite angezeigt. |
| `LDAPS_BASE_DN` | leer | Suchbasis, bei der Kanzlei `DC=kmbcloud,DC=at`. |
| `LDAPS_GROUP_DN` | leer | Gruppe `HelpdeskAdmins`. Bei der Kanzlei `CN=HelpdeskAdmins,OU=Sicherheitsgruppen,OU=kmb,DC=kmbcloud,DC=at`. |
| `LDAPS_CA_PEM` oder `LDAPS_CA_FILE` | leer | Zertifikat von MADC1. Ein Blattzertifikat wird gepinnt, ein CA-Zertifikat wird als Vertrauensanker benutzt. |
| `SESSION_SECRET` | leer | In Produktion startet die API nicht. In der Entwicklung gilt ein Schlüssel nur für diesen Prozess. |
| `ADMIN_IP_ALLOWLIST` | leer | Leere Liste verweigert in Produktion jede Verwaltung von außen. Die Kanzlei setzt `192.168.36.0/24,192.168.191.0/24`. Jede Verbindung aus `127.0.0.0/8` oder `::1` ist ohne Anmeldung frei, auch in Produktion. Eine weitergeleitete Adresse zählt nicht. |
| `ALLOW_TEST_AUTH` | leer | Darf in Produktion nicht gesetzt sein. |

## Syslog

| Wert | Auslieferung | Bedeutung |
|---|---|---|
| `SYSLOG_HOST` | `192.168.191.215` | Erster Empfänger, solange die Konfigurationsseite keinen anderen Server gespeichert hat. |
| `SYSLOG_PORT` | `514` | UDP. |
| `SYSLOG_NAME` | `KMBHelp` | APP-NAME nach RFC 5424. Der HOSTNAME der Zeile bleibt der Rechnername. |
| `SYSLOG_FACILITY` | `local0` | Facility. Zulässig sind `local0` bis `local7`. |
| `SYSLOG_UTC_OFFSET` | `+01:00` | Uhrzeit in der RFC-5424-Zeile. Winterzeit der Kanzlei. Sommerzeit ist `+02:00`. |

Format ist RFC 5424. Eine Zeile beginnt mit `<PRI>1`, dann die örtliche Uhrzeit mit `SYSLOG_UTC_OFFSET` (Auslieferung `+01:00`, nicht `Z`), Hostname, APP-NAME, drei Striche für PROCID, MSGID und STRUCTURED-DATA, und die Meldung in UTF-8 mit BOM. PRI ist Facility mal 8 plus Severity. Für `local0`:

| Kategorie | Severity | PRI |
|---|---|---|
| Informational | 6 | 134 |
| Warning | 4 | 132 |
| Error | 3 | 131 |

`local1` und Error ergeben 139. Jede Meldung aus dem Katalog geht zusätzlich ins Prozesslog. Ist die Meldung auf Ignorieren gestellt, wird sie nicht ausgelöst. Der Start prüft die Server und löst die zugehörige Meldung aus, wenn die Prüfung nicht in Ordnung ist. UDP bestätigt den Empfang nicht. Schlägt das Senden fehl, bleibt eine Warnung im Prozesslog, ohne dieselbe Meldung noch einmal per Syslog zu schicken.

Der lokale Admin speichert Empfänger, Servername und Facility unter `/verwaltung/konfiguration`. Diese Werte liegen in `app_setting` unter `syslog.host`, `syslog.port`, `syslog.name` und `syslog.facility` und gelten vor den Umgebungsvariablen. Der Knopf Syslog testen übergibt ein UDP-Datagramm an die eingegebene Adresse, ohne sie zu speichern.

## Meldungen im Auslieferungszustand

Alle sind ausgelöst. Die Kategorie kann der lokale Admin ändern.

| Code | Kategorie | Wann |
|---|---|---|
| `directory.unreachable` | Error | `MADC1.kmbcloud.at` ist nicht erreichbar |
| `database.unreachable` | Error | PostgreSQL antwortet nicht |
| `directory.bind_failed` | Error | Das Dienstkonto kann nicht suchen |
| `certificate.missing` | Warning | Kein Zertifikat hinterlegt |
| `certificate.expired` | Error | Zertifikat abgelaufen |
| `certificate.expiring` | Warning | Weniger als 30 Tage Rest |
| `certificate.mismatch` | Error | Hinterlegtes Zertifikat und Server unterscheiden sich |
| `allowlist.empty` | Warning | Keine Admin-Adressliste |
| `session_secret.weak` | Warning | Sitzungsschlüssel fehlt oder ist kürzer als 16 Zeichen |
| `mail.not_configured` | Warning | Graph-Mail ist unvollständig |
| `graph.not_configured` | Warning | Microsoft 365 ist unvollständig oder der Anmeldehost ist nicht erreichbar |
| `syslog.unreachable` | Warning | Das UDP-Datagramm an den Syslog-Host wurde nicht übergeben |
| `webauthn.mismatch` | Warning | Relying-Party und Origin passen nicht |
| `local_admin.missing` | Warning | Es gibt nicht genau einen lokalen Admin |
| `ai.not_configured` | Informational | Kein KI-Endpunkt. Das ist der normale Auslieferungszustand |

## Weitere Prüfungen auf der Konfigurationsseite

Jeder Eintrag hat eine kurze Erklärung, ein Feld zum Ändern und einen eigenen Prüfknopf. Geheimnisse erscheinen leer. Ein leeres Speichern lässt den hinterlegten Wert stehen. Werte ohne Geheimnis schreibt die Seite nach `app_setting` (`config.SCHLÜSSEL`) und in `.env`. Geheimnisse schreibt sie nur nach `secrets.json` und in den laufenden Prozess, nie nach `.env` und nie nach Git. Ein gespeicherter Wert ohne Geheimnis gilt beim nächsten Start vor der handgeschriebenen `.env`. Zusätzlich prüft die Seite Node 22, genau einen lokalen Admin, `MADC1.kmbcloud.at` Port 636, das Zertifikatsdatum, den Vergleich mit dem live vorgezeigten Zertifikat, die Graph-Werte und `login.microsoftonline.com`, den gespeicherten Syslog-Server und die Zusammengehörigkeit von WebAuthn-Host und Origin. Der Worker liest das Postfach nach `WORKER_SCHEDULE`, wenn Tenant, Client, Geheimnis und Postfach gesetzt sind. Die Prüfung auf dieser Seite holt dafür kein Token. `PUBLIC_ORIGIN` ist die Adresse in der Antwort und im Kalender. Lokal ist das `http://127.0.0.1:5173`.

## Mail, Kalender und Bereitschaft

| Wert | Auslieferung | Bedeutung |
|---|---|---|
| `GRAPH_TENANT_ID` | leer | Verzeichnis-ID der App-Registrierung in Entra. |
| `GRAPH_CLIENT_ID` | leer | Anwendungs-ID derselben Registrierung. |
| `GRAPH_CLIENT_SECRET` | leer | Client-Geheimnis. Nur in `secrets.json`, nie in Git. |
| `GRAPH_MAILBOX` | `helpdesk@kmbcloud.at` | Postfach, das der Worker liest, und Absender der Antworten. |
| `PUBLIC_ORIGIN` | `http://127.0.0.1:5173` | Adresse in Antwort und Kalender. Produktion: `https://helpdesk.kmbcloud.at`. |
| `ONCALL_EMAIL` | leer | Bereitschaft. Eine P1-Mail geht nur hin, wenn die Adresse gesetzt ist. |
| `FALLBACK_CATEGORY` | `printer` | Kategorie-Code, wenn kein Kategorie-Name in der Mail steht. Muss in der Tabelle `category` existieren. |
| `CALENDAR_DEFAULT_MINUTES` | `30` | Termindauer, bis Phase 6 eine Schätzung zwischen 5 und 480 Minuten liefert. |
| `CALENDAR_DELAY_P1` | `0` | Minuten nach dem Anlegen, wann ein P1-Termin beginnt. |
| `CALENDAR_DELAY_P2` | `60` | Minuten nach dem Anlegen, wann ein P2-Termin beginnt. |
| `CALENDAR_DELAY_P3` | `240` | Minuten nach dem Anlegen, wann ein P3-Termin beginnt. |
| `WORKER_SCHEDULE` | `00:00-08:00=30,08:00-12:00=10,12:00-12:30=0,12:30-17:00=10,17:00-24:00=30` | Abruf bei Microsoft 365. `0` ist eine Pause. Die Uhr ist `SYSLOG_UTC_OFFSET`. |

Die Kategorien selbst stehen nicht in dieser Datei. Sie liegen in `packages/db/src/catalog.ts`, fachlich in `docs/ticketkatalog.md`, und `pnpm db:seed` schreibt sie in die Tabelle `category`. Eine Seite zum Anlegen von Kategorien gibt es nicht. `/verwaltung` ordnet vorhandene Kategorien nur den Mitarbeitern zu.

## Helpdeskmitarbeiter

Beim Öffnen von `/verwaltung` liest die API die Gruppe `HelpdeskAdmins`. Der Schlüssel ist die E-Mail-Adresse, der angezeigte Name das LDAP-Feld `cn`. Neue Mitglieder werden angelegt. Wer in der Datenbank aktiv ist, aber nicht mehr in der Gruppe, erscheint als Fehlermeldung. Der Knopf „Einträge deaktivieren“ setzt diese Zeilen auf inaktiv. Mitarbeiter werden nie gelöscht. Der Knopf „AD Lesen“ wiederholt denselben Abgleich. Ist das Verzeichnis nicht erreichbar, bleibt die vorhandene Liste stehen.

## Dateien

Die Auslieferung enthält keine gefüllte Geheimdatei. Auf diesem Entwicklungsrechner liegen Passwort und Zertifikat unter `%LOCALAPPDATA%\kmbhelp\secrets.json`. Die übrigen Werte stehen in `.env` im Projektordner. Diese Datei ist von Git ausgeschlossen. Passwort und Zertifikat gehören nicht hinein, weil der Projektordner auf Google Drive liegt. In Produktion ist der vorgesehene Ort `/etc/kmbhelp/api.env`, Modus `0600`, Benutzer `kmbhelp`.

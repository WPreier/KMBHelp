# KMBHelp — Auslieferungszustand

Diese Datei beschreibt die Werte, mit denen eine frische Installation startet. Zugangsdaten der Kanzlei stehen nicht hier. Sie liegen auf dem jeweiligen Rechner in einer Datei, die nur der Benutzer des Prozesses lesen kann.

## Anmeldung und Verzeichnis

| Wert | Auslieferung | Bedeutung |
|---|---|---|
| `LDAPS_URL` | `ldaps://MADC1.kmbcloud.at:636` | Domänencontroller. Der kurze Name `MADC1.kmbcloud` wird beim Start zusätzlich geprüft. |
| `LDAPS_BIND_DN` | leer | Dienstkonto. Ohne Bind-DN, Passwort, Basis-DN und Gruppen-DN bleibt die Verzeichnisprüfung aus und die Anmeldung antwortet 503. |
| `LDAPS_BIND_PASSWORD` | leer | Wird nie geloggt und nie in der Konfigurationsseite angezeigt. |
| `LDAPS_BASE_DN` | leer | Suchbasis, bei der Kanzlei `DC=kmbcloud,DC=at`. |
| `LDAPS_GROUP_DN` | leer | Gruppe `HelpdeskAdmins`. Bei der Kanzlei `CN=HelpdeskAdmins,OU=Sicherheitsgruppen,OU=kmb,DC=kmbcloud,DC=at`. |
| `LDAPS_CA_PEM` oder `LDAPS_CA_FILE` | leer | Zertifikat von MADC1. Ein Blattzertifikat wird gepinnt, ein CA-Zertifikat wird als Vertrauensanker benutzt. |
| `SESSION_SECRET` | leer | In Produktion startet die API nicht. In der Entwicklung gilt ein Schlüssel nur für diesen Prozess. |
| `ADMIN_IP_ALLOWLIST` | leer | Leere Liste verweigert jede Verwaltung. Die Kanzlei setzt `192.168.36.0/24,192.168.191.0/24`. `127.0.0.1` ist darin nicht enthalten. |
| `ALLOW_TEST_AUTH` | leer | Darf in Produktion nicht gesetzt sein. |

## Syslog

| Wert | Auslieferung | Bedeutung |
|---|---|---|
| `SYSLOG_HOST` | `127.0.0.1` | Empfänger der UDP-Meldungen. |
| `SYSLOG_PORT` | `514` | Syslog-Port. |

Format ist BSD-Syslog, Facility `local0`. Kategorien:

| Kategorie | Severity | PRI |
|---|---|---|
| Informational | 6 | 134 |
| Warning | 4 | 132 |
| Error | 3 | 131 |

Jede Meldung aus dem Katalog geht zusätzlich ins Prozesslog. Ist die Meldung auf Ignorieren gestellt, wird sie nicht ausgelöst. Der Start prüft die Server und löst die zugehörige Meldung aus, wenn die Prüfung nicht in Ordnung ist. UDP bestätigt den Empfang nicht. Schlägt das Senden fehl, bleibt eine Warnung im Prozesslog, ohne dieselbe Meldung noch einmal per Syslog zu schicken.

## Meldungen im Auslieferungszustand

Alle sind ausgelöst. Die Kategorie kann der lokale Admin ändern.

| Code | Kategorie | Wann |
|---|---|---|
| `directory.unreachable` | Error | `MADC1.kmbcloud` oder der konfigurierte Domänencontroller ist nicht erreichbar |
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

Die Seite zeigt gesetzte Werte. Geheimnisse erscheinen nur als „gesetzt“ oder „fehlt“. Zusätzlich prüft sie Node 22, genau einen lokalen Admin, die LDAPS-Ports 636, das Zertifikatsdatum, den Vergleich mit dem live vorgezeigten Zertifikat, die Graph-Werte und `login.microsoftonline.com`, den Syslog-Host und die Zusammengehörigkeit von WebAuthn-Host und Origin. Der Mailversand selbst ist Phase 4 und wird hier nur auf vollständige Werte geprüft.

## Dateien

Die Auslieferung enthält keine gefüllte Geheimdatei. Auf diesem Entwicklungsrechner liegt sie unter `%LOCALAPPDATA%\kmbhelp\secrets.json`. In Produktion ist der vorgesehene Ort `/etc/kmbhelp/api.env`, Modus `0600`, Benutzer `kmbhelp`.

# Ollama auf Debian für die Mailprüfung

Diese Anleitung richtet einen eigenen Debian-Rechner mit Ollama ein und bindet ihn an KMBHelp an. Die Mailprüfung und der KI-Mailtest sprechen dann `MAILCHECK_AI_URL` und `MAILCHECK_AI_MODEL`. OpenRouter bleibt aus, solange `OPENROUTER_API_KEY` und `OPENROUTER_MODEL` nicht beide gesetzt sind.

Die Firewall setzt die Kanzlei nach den Firmenvorgaben. Diese Seite enthält keine iptables-Regeln. Port `11434` darf nur aus dem internen Netz erreichbar sein, vor allem vom Helpdesk-Server `kmbhelp` (`192.168.36.55`) und vom Arbeitsplatz, der KI-Mailtest nutzt. Ollama hat keine eigene Anmeldung.

Die Auslieferung zeigt auf `http://192.168.191.131:11434` (kmblmt1) und Modell `gemma4:12b`. Die Schritte unten gelten für einen neuen Rechner; die Platzhalteradresse `192.0.2.20` durch die echte interne IP ersetzen.

## Größe

Beide Modelle sollen auf dem Rechner liegen: `gemma4:12b` und `qwen3.8:27b`. Architektur x86-64. Eine NVIDIA-GPU ist stark empfohlen; ohne GPU laufen die Modelle auf der CPU und dauern länger als das 5-Minuten-Limit der Mailprüfung oft zulässt.

| Ressource | Ziel | Warum |
|---|---|---|
| CPU | 8 Kerne oder mehr | Download, Quantisierung und CPU-Fallback. |
| Hauptspeicher | 64 GB | Beide Modelle und Betriebssystem. `qwen3.8:27b` allein braucht rund 18 GB Modelldatei plus Kontext. |
| GPU | NVIDIA, 24 GB VRAM | `gemma4:12b` etwa 8 GB, `qwen3.8:27b` etwa 18 GB (4-Bit). Mit 24 GB laufen beide nacheinander; gleichzeitig braucht mehr. |
| Platte | 200 GB SSD | Debian, Ollama, Modelle und Freiraum. Beide Modelle zusammen etwa 26 GB Download. |

Mit nur 16 GB VRAM bleibt `gemma4:12b` nutzbar; `qwen3.8:27b` wird dann teilweise in den Arbeitsspeicher ausgelagert und ist langsamer. Mit 12 GB VRAM nur `gemma4:12b` planen.

## Debian

Debian 13 „trixie“, 64-Bit, ohne grafische Oberfläche. Bei der Installation SSH-Server und Standard-Systemwerkzeuge. Zeitzone `Europe/Vienna`. Locale `de_DE.UTF-8`. Ein fester Hostname hilft in der Dokumentation, zum Beispiel `kmblmt2`.

Nach dem ersten Start:

```bash
sudo apt update
sudo apt full-upgrade
sudo timedatectl set-timezone Europe/Vienna
sudo reboot
```

Danach prüfen:

```bash
hostname -I
timedatectl
```

Die interne IPv4 notieren. Sie wird später `MAILCHECK_AI_URL`.

## NVIDIA (optional, empfohlen)

Wenn eine NVIDIA-Karte steckt, die aktuellen Treiber der Kanzlei installieren und neu starten. Danach:

```bash
nvidia-smi
```

Die Ausgabe muss die Karte und den freien Speicher zeigen. Fehlt das, läuft Ollama auf der CPU.

## Ollama installieren

Offizielle Installation:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Prüfen:

```bash
ollama --version
sudo systemctl enable --now ollama
systemctl status ollama
curl -fsS http://127.0.0.1:11434/
```

Die Antwort lautet sinngemäß `Ollama is running`. Der Dienst lauscht zunächst nur auf localhost.

## Im LAN erreichbar machen

KMBHelp auf `kmbhelp` und der Browser auf dem Arbeitsplatz brauchen die Adresse im LAN, nicht `127.0.0.1` auf dem Ollama-Rechner.

```bash
sudo systemctl edit ollama.service
```

Im Editor unter `[Service]` setzen:

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
```

Speichern, dann:

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
ss -ltnp | grep 11434
curl -fsS http://127.0.0.1:11434/
```

`ss` muss `0.0.0.0:11434` oder `*:11434` zeigen. Vom Helpdesk-Server aus (dort ausführen, `192.0.2.20` ersetzen):

```bash
curl -fsS http://192.0.2.20:11434/
curl -fsS http://192.0.2.20:11434/api/tags
```

Schlägt das fehl, zuerst Routing und die Firewall der Kanzlei prüfen, bevor an KMBHelp etwas geändert wird.

## Modelle laden

Auf dem Ollama-Rechner:

```bash
ollama pull gemma4:12b
ollama pull qwen3.8:27b
ollama list
```

`ollama list` muss beide Namen zeigen. Kurztest:

```bash
ollama run gemma4:12b "Antworte mit einem Wort: ping"
```

Mit `Ctrl+D` beenden. Danach optional denselben Satz mit `qwen3.8:27b`. Der erste Aufruf nach dem Pull lädt das Modell in den Speicher und kann länger dauern.

Von außen die Liste prüfen (`192.0.2.20` ersetzen):

```bash
curl -fsS http://192.0.2.20:11434/api/tags
```

In der JSON-Antwort stehen die Namen unter `models[].name`. Genau diese Namen erscheinen später im Dropdown auf KI-Mailtest.

## KMBHelp anbinden

KMBHelp speichert die Adresse und das Modell unter den Schlüsseln `MAILCHECK_AI_*`. `MAIL_AI_PROMPT` und `SEARCH_AI_*` gehören nicht zur Mailprüfung.

| Schlüssel | Beispiel | Wo setzen | Wirkung |
|---|---|---|---|
| `MAILCHECK_AI_URL` | `http://192.0.2.20:11434` | `/verwaltung/konfiguration` oder `/etc/kmbhelp/kmbhelp.env` | Basisadresse ohne Slash am Ende. API und Worker rufen `{URL}/api/chat` und `{URL}/api/tags` auf. |
| `MAILCHECK_AI_MODEL` | `gemma4:12b` oder `qwen3.8:27b` | Konfiguration oder Seite KI-Mailtest | Name wie in `ollama list`. |
| `MAILCHECK_AI_ACTIVE` | `on` | Konfiguration oder Checkbox auf KI-Mailtest | `off` stoppt den automatischen Worker-Lauf; der manuelle Test bleibt. |
| `MAILCHECK_AI_PROMPT` | mitgelieferter Text oder eigener | Konfiguration oder Abfragetext auf KI-Mailtest | Auftrag an das Modell. Leer nutzt die Auslieferung SUPPORT/ANTWORT/SPAM. |
| `OPENROUTER_MODEL` | leer | Konfiguration oder KI-Mailtest | Leer lassen, sonst und mit Schlüssel geht die Prüfung an OpenRouter. |
| `OPENROUTER_API_KEY` | leer | nur `/etc/kmbhelp/kmbhelp.env` (Geheimnis) | Für lokalen Ollama leer lassen oder den Schlüssel nicht setzen. |

### Auf dem Produktionsserver

1. Als Administrator `https://helpdesk.kmbcloud.at/verwaltung/konfiguration` öffnen (aus `192.168.36.0/24` oder `192.168.191.0/24`).
2. `MAILCHECK_AI_URL` auf `http://NEUE_IP:11434` setzen und speichern. Kein trailing Slash, kein Benutzer, kein Passwort in der URL.
3. `MAILCHECK_AI_MODEL` auf `gemma4:12b` oder `qwen3.8:27b` setzen und speichern.
4. `OPENROUTER_MODEL` leeren, falls dort noch ein Wert steht.
5. API und Worker neu starten, damit beide Prozesse die neue Adresse sicher laden:

```bash
sudo systemctl restart kmbhelp-api kmbhelp-worker
systemctl is-active kmbhelp-api kmbhelp-worker
```

Ein Wert ohne Geheimnis, der auf der Konfigurationsseite gespeichert wird, liegt in der Tabelle `app_setting` und gilt beim nächsten Start vor `/etc/kmbhelp/kmbhelp.env`. Wer die zentrale Datei direkt pflegt, setzt dort dieselben Schlüssel und startet danach ebenfalls neu. Die Datei beim Git-Update nicht überschreiben.

### Über KI-Mailtest

1. `https://helpdesk.kmbcloud.at/verwaltung/ki-mailtest` öffnen.
2. Nach dem Neustart sollte die lokale Modellliste die Namen von `/api/tags` zeigen.
3. Lokales Modell wählen; die Seite speichert `MAILCHECK_AI_MODEL` und prüft das Modell am Server.
4. OpenRouter-Modell leer lassen, damit der Provider lokal bleibt.
5. Eine Testmail prüfen. Unter `/verwaltung/tests` den Dienst Ollama mit T abfragen: grün heißt erreichbar.

### Am Entwicklungsrechner

In der Projekt-`.env` (nicht committen):

```env
MAILCHECK_AI_URL=http://192.0.2.20:11434
MAILCHECK_AI_MODEL=gemma4:12b
MAILCHECK_AI_ACTIVE=on
```

`pnpm dev` und `pnpm dev:worker` neu starten. Gespeicherte Werte aus der lokalen Datenbank gelten vor der `.env`.

## Was nicht ändern

- `SEARCH_AI_ENDPOINT`, `SEARCH_AI_API_KEY`, `SEARCH_AI_REGION`, `SEARCH_AI_AVV_REFERENCE` — Suche und Kenntnisprüfung, nicht Mailprüfung.
- `MAIL_AI_PROMPT` — alter JA/NEIN-Auftrag für Suche; der Abfragetext der Mailprüfung ist `MAILCHECK_AI_PROMPT`.
- `SEARCH_MODEL_*` — Platzhalter für ein späteres Suchmodell, noch ohne Aufruf.
- nginx auf `kmbhelp` — die Timeouts unter `/api/` bleiben mindestens `360s`, unabhängig vom Ollama-Host. Vorlage: `infra/nginx/helpdesk.conf`.

## Prüfung nach dem Umbau

Auf dem Ollama-Rechner:

```bash
systemctl is-active ollama
ollama list
```

Vom Helpdesk-Server:

```bash
curl -fsS http://NEUE_IP:11434/api/tags
```

In KMBHelp:

1. `/verwaltung/tests` → Ollama → T → grün.
2. `/verwaltung/ki-mailtest` → lokale Modelle sichtbar → kurze Prüfung.
3. `/verwaltung/protokoll` → `ki.log` zeigt die neue Adresse bzw. das Modell und die Dauer.

Wenn Ollama nicht erreichbar ist, bleiben ungelesene Helpdesk-Mails ungelesen und erzeugen kein Ticket. Der manuelle Weg über die Mailbox bleibt.

## Zurück auf den bisherigen Host

Auslieferung wiederherstellen:

- `MAILCHECK_AI_URL=http://192.168.191.131:11434`
- `MAILCHECK_AI_MODEL=gemma4:12b`

Speichern, API und Worker neu starten, KI-Mailtest prüfen.

## Kurzablauf

1. Debian einrichten, Uhr stellen, IP notieren.
2. Ollama installieren, `OLLAMA_HOST=0.0.0.0:11434`, Dienst neu starten.
3. `gemma4:12b` und `qwen3.8:27b` pullen.
4. Von `kmbhelp` aus `curl` auf Port 11434.
5. In der Konfiguration `MAILCHECK_AI_URL` und `MAILCHECK_AI_MODEL` setzen, OpenRouter leer.
6. `sudo systemctl restart kmbhelp-api kmbhelp-worker`.
7. Tests und KI-Mailtest grün.

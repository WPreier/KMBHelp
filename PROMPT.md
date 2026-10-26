# Arbeitsauftrag an Grok in Cursor

Kopiere alles unter der Linie in den ersten Cursor-Chat, nachdem das Repository geöffnet ist. Arbeite danach nur noch phasenweise. Wenn eine Phase nicht mergefähig ist, keine neue beginnen.

---

Du bist der umsetzende Ingenieur für **KMBHelp**, den internen IT-Helpdesk der KMB Steuerberatung & Partner GmbH.

Lies vor dem ersten Edit, und nach jeder Unterbrechung erneut, diese Dateien und halte sie für verbindlich:

- `README.md`
- `docs/prompt.md`
- `docs/stack-entscheidung.md`
- `docs/sicherheit.md`
- `docs/schnittstellen.md`
- `docs/ticketkatalog.md`
- `docs/prozesse/*.md`
- `ENTWICKLUNGSUMGEBUNG.md`

Wenn Code und Markdown sich widersprechen, gilt das Markdown, bis du es in demselben Commit bewusst änderst und die Änderung im Commit-Text begründest.

## Was du baust

Eine Helpdesk-Anwendung für interne Benutzer. Tickets entstehen per E-Mail, im Browser oder in der Smartphone-App. Ansehen und Bearbeiten geht über Web, App oder als Folge der Mail.

Die Kanzlei verarbeitet fremde Steuer- und Lohndaten unter Verschwiegenheit (Österreich: WTBG) und DSGVO. Ein Ausfall am Lohnlauf oder an einem Abgabetag ist ein Mandatsrisiko. Fristen, Berechtigungen und Nachweis sind Fachfunktionen, nicht Kommentare im README.

Sprache der Oberfläche: Deutsch und Englisch, weitere Sprachen nur als zusätzliche Katalogdateien. Startwert aus der Browsersprache. Umschalter speichert `kmbhelp_lang`. Hell/Dunkel speichert `kmbhelp_theme`. Kein Cookie-Banner, keine Analysewerkzeuge.

Host: `helpdesk.kmbcloud.at`. Postfach: `helpdesk@kmbcloud.at`. Active Directory: Domäne `kmbcloud.at`, Server `MADC1.kmbcloud.at`, Gruppe `Helpdesk`.

## Stack, bereits entschieden

TypeScript strict, Node 22, pnpm-Workspace, Fastify, PostgreSQL 17, Drizzle, Zod, React/Vite als statischer Build, Expo für iOS und Android, Microsoft Graph für Mail und Kalender, LDAPS für die erste Passwortprüfung, WebAuthn oder TOTP danach. nginx- und Apache-Beispiele gehören zum Lieferumfang. Begründung steht in `docs/stack-entscheidung.md`. Nicht neu verhandeln, außer ein harter technischer Blocker ist nachgewiesen.

Lege die Monorepo-Struktur so an:

```text
apps/api          Fastify, OpenAPI, Session
apps/worker       Graph-Mail, minütlich, eigener Prozess
apps/web          Vite React
apps/mobile       Expo
apps/mcp          MCP-Server, nur HTTP-API
packages/shared   Zod-Verträge, Prioritätsregeln, i18n-Schlüssel
packages/db       Drizzle-Schema und Migrationen
infra/nginx
infra/apache
infra/systemd
scripts/install.ts
docs/
```

Namen wie auf GitHub üblich: kleingeschrieben, Bindestriche in Dateinamen, Englisch im Code, Deutsch in der fachlichen Oberfläche und in `docs/`.

## Verboten

- Mandantenbelege, Lohnzettel oder Ausweise als vorgesehener Anhang. Hinweis anzeigen, gefährliche Dateitypen abweisen.
- Beschreibung, Absender oder Kommentare auf einer Seite ohne Anmeldung. Der Betreff darf in der Arbeitsliste stehen. Einen Geheimlink gibt es nicht.
- AD-Passwörter, Lizenzschlüssel oder Portalpasswörter speichern oder loggen.
- KI-Aufruf, bevor die Felder des Anbieters (Endpunkt, Region, AVV) in der Umgebung gesetzt sind. Bis dahin Zuordnung nur über Regeln: Kategorie-Skill, erste freie Person. Das muss ohne KI funktionieren.
- Direktes SQL aus dem MCP oder aus der Weboberfläche.
- Eine zweite Geschäftslogik neben `apps/api`.
- Abhängigkeiten, die nur deshalb „modern“ sind. Kein Message-Bus, kein Kubernetes, kein Elasticsearch in Version 1.
- Commit von `.env`, Tokens, Zertifikaten, Dump-Dateien.

## Sicherheit, die du nicht aufweichen darfst

Steht in `docs/sicherheit.md`. Kurz: anonyme Erfassung ja; öffentliches Mitlesen von Inhalten nein; IP-Log 90 Tage; Staff nur mit AD-Gruppe plus MFA; jede Anmeldung prüft, dass das AD-Konto noch aktiv und in der Gruppe ist; Admin-Routen zusätzlich IP-Allowlist; Audit append-only; KI nur nach Maskierung und nur mit erlaubter Auto-Antwort.

## Fachregeln, die Tests brauchen

- Priorität aus `docs/ticketkatalog.md`. Test: `impact=payroll` und Fälligkeit heute wird P1, auch wenn ein Client P3 sendet.
- Beschaffung: unter 100 ohne Vorgesetzten, 100 bis 500 mit Token-Link, darüber `manual`. Grenzen konfigurierbar.
- Änderung im Stoppfenster ohne `exception_reason` wird mit 422 abgelehnt.
- Dieselbe `internetMessageId` erzeugt ein Ticket, nicht zwei.
- Offboarding-Ticket ohne Fälligkeit wird abgelehnt.
- Lieferant ohne AVV-Datum und ohne Verschwiegenheitsdatum kann keine Fernwartung freigeben.
- Backup-Test-Schließen ohne „echt zurückgespielt ja/nein“ wird abgelehnt.
- Sicherheitsvorfall legt `deadline_72h` an und startet als P1.

## Rückfragen, bevor du diese Punkte anfasst

Nicht raten und keine Platzhalter-Zugangsdaten erfinden. Die Phase ohne diese Daten bauen, die Anbindung hinter einem Interface lassen, und genau diese Fragen stellen:

1. Microsoft-365-Tenant: wer erteilt Admin-Consent für Mail und Kalender? Application Access Policy nur auf Helpdesk-Postfächer möglich?
2. LDAPS: Zertifikat von `MADC1`, Dienstkonto (kein Domänenadmin), DN der Gruppe `Helpdesk`, Port 636 erreichbar vom Helpdesk-Server?
3. KI-Anbieter mit AVV und EU-Verarbeitung. Welcher?
4. Echte URLs für www, Home und Wiki.
5. Logo-Dateien unter `brand/`, sonst Textwortmarke, kein heruntergeladenes Fremdlogo.
6. Apple-Developer-Team und Google-Play-Konto, sobald Phase 11 beginnt. Wer besitzt sie?
7. Internes Subnetz für `ADMIN_IP_ALLOWLIST`.

## Arbeitsweise

- Eine Phase pro Branch `phase/<nn>-<kurzname>` und ein Pull Request nach `main`.
- Kleine Commits, englische Commit-Betreffs, Imperativ (`add ticket priority rule`).
- Jede Phase endet mit: Tests grün, `pnpm typecheck` grün, kurzer Eintrag in `docs/status.md`, Aktualisierung der betroffenen Prozess-Markdowns falls sich das Verhalten präzisiert hat.
- UI: ruhig, wie ein Werkzeug einer Kanzlei. Keine Verlaufsflächen, keine austauschbare lila SaaS-Optik, keine Emojis als Icons. Schrift system-ui, Farbe Tinte und ein zurückhaltendes Grün. Logo links KMB mit den drei Links, rechts Malama nach `https://malama.at`. Layout für 390px Breite und für einen Schreibtisch. Tastatur benutzbar. Sichtbarer Fokus.
- Hell/Dunkel über `color-scheme` und eine Datenattribut-Umschaltung, nicht über ein zweites Stylesheet-Duplikat.
- Fehlertexte auf Deutsch und Englisch, nie ein roher Stacktrace für den Melder.

## Phasen

Baue nur die genannte Phase. Am Ende die Akzeptanz in `docs/status.md` abhaken.

### Phase 0 — Gerüst

Workspace, TypeScript, ESLint, Prettier, Vitest, Drizzle-Anbindung an eine lokale PostgreSQL, leere Migration, `GET /api/health`, `.env.example` ohne Geheimnisse, `README` des Repos mit den Befehlen aus `ENTWICKLUNGSUMGEBUNG.md`. Noch keine Oberfläche außer einer statischen Platzhalterseite mit beiden Logos und dem Sprach- und Theme-Schalter.

### Phase 1 — Daten und Priorität

Schema für Tickets, Ereignisse, Kategorien, Katalog, Staff, Skills, Freeze-Fenster, Lieferanten, Assets, Lizenzen, Zertifikate, Portale, Beschaffung, Wissen, FAQ, Access-Log, Sessions, WebAuthn-Challenges. Seed des Katalogs aus `docs/ticketkatalog.md`. Prioritätsfunktion mit Tests. Noch keine AD-Anbindung: Staff kann in Tests über eine Fabrik angelegt werden, die in Produktion nicht erreichbar ist.

### Phase 2 — Öffentliches Web und Staff-Liste als API

Ticket anlegen ohne Geheimlink, öffentliche Liste als einzeilige Tabelle, FAQ-Seiten leer aber fertig, KI-Suche vorerst nur Datenbank-Volltext mit einem Satz „Treffer wegen Kategorie/Titel“, Schnittstelle so, dass Phase 6 den Satz durch ein Modell ersetzen kann. Staff-API für die Arbeitsliste (offen, plus höchstens 10 in Arbeit oder zuletzt geschlossen, mit Dauer). Auth in dieser Phase ein Test-Header, der in Produktion ohne `ALLOW_TEST_AUTH=1` ignoriert wird. `ALLOW_TEST_AUTH` darf in Produktion nicht gesetzt sein; Test dafür. Datumseingaben `dd.MM.yyyy`.

### Phase 3 — Staff-Anmeldung

LDAPS-Client, erste Anmeldung mit AD-Passwort nur zur Prüfung, danach Passkey oder TOTP, Folgesitzungen ohne erneutes AD-Passwort, aber mit lebendiger Gruppenprüfung. Lokaler Admin aus `scripts/install.ts`. Admin-Seiten: Passwort des lokalen Admins, MFA zurücksetzen, Skills und Kategorien je Mitarbeiter. IP-Allowlist. Audit der Anmeldungen ohne Geheimnisse.

### Phase 4 — Mail und Kalender

Worker, Graph-Client hinter Interface, Idempotenz, Antwortmail mit Nummer und Link, Kalendereintrag. Ohne Tenant-Credentials startet der Worker und protokolliert `not_configured`, statt zu crashen. Mit Credentials gegen einen Contract-Test mit aufgezeichneten Payloads, nicht gegen den echten Tenant in der CI.

### Phase 5 — Regeln der übrigen Prozesse

Change-Freeze, Beschaffungsgrenzen und Vorgesetzten-Token, Fernwartung nur bei freigegebenem Lieferanten, Backup-Test-Folgeticket, Sicherheitsvorfall-72h, Offboarding-Checkliste, Review-Aufgaben für Berechtigungen und Aufbewahrung, Zertifikatsfristen 30 und 7 Tage. Alles als API und als schlichte Staff-Formulare.

### Phase 6 — KI

Provider-Interface. Maskierung. JSON-Schema für Kategorie, Priorität, Skill, Konfidenz, `auto_reply_allowed`. Auto-Antwort nur nach den Regeln in `docs/sicherheit.md`. Suche für Staff mit Begründung und Link. Öffentliche Suche ohne Klartext-Protokoll. Wenn kein Anbieter konfiguriert ist: Verhalten von Phase 2 bleibt.

### Phase 7 — Dashboard

Zeiträume Tag, Woche, Monat, Quartal, Jahr. Eigene Zahlen für `agent`, Kanzleizahlen für `lead` und `admin`.

### Phase 8 — MCP

Werkzeuge für Lesen und für die Staff-Aktionen, Dienst-Token, keine SQL-Werkzeuge, README wie Cursor den Server einträgt (`.cursor/mcp.json.example`).

### Phase 9 — Web fertig

Alle Staff-Seiten zu den Prozessen, nicht nur die API. Barrierefreie Formulare, leere Zustände, Fehler, Laden. Playwright-Rauchtests: Ticket anlegen, öffentliche Liste enthält keinen Betreff, Theme-Umschalter, Sprache.

### Phase 10 — Installation Linux

`docs/installation-linux.md`, Unit-Dateien, Beispiel nginx und Apache mit TLS-Platzhaltern, PostgreSQL-Rolle mit wenig Rechten, Backup-Cron für die Helpdesk-Datenbank, Upgrade-Pfad `pnpm db:migrate && systemctl restart`.

### Phase 11 — App

Expo. Funktionen der Web-Punkte Benutzer, IT-Liste, FAQ, Suche, Dashboard. Lokale Geräte-MFA vor Staff-Inhalten. `docs/mobile-stores.md` für Apple Developer und Google Play, EAS, ohne dass Zugangsdaten im Repo stehen. Die Dokumentation ist der erste Wurf und sagt am Anfang, dass Zertifikate und Store-Richtlinien nachgezogen werden.

### Phase 12 — Härtung

Rate-Limits, Helmet-äquivalente Header, CSRF, Anhangsfilter, Abhängigkeitsaudit, eine Seite `docs/betrieb.md` mit Lohnwochen-Stopp, Wiederherstellungstest und dem Notfallblatt (wen anrufen, wie isolieren, wo das Backup liegt, wer mit Mandanten spricht) als pflegbare Felder, nicht als Bild.

## Definition of Done für das Ganze

Ein neuer Mitarbeiter kann ohne Konto ein Ticket im Browser anlegen und sieht die Nummer. Er kann fremde Beschreibungen nicht lesen. Ein Helpdesk-Mitarbeiter der Gruppe `Helpdesk` richtet einmalig einen Passkey ein und bearbeitet das Ticket. Eine Mail an `helpdesk@kmbcloud.at` wird innerhalb von zwei Minuten ein Ticket, wenn Graph konfiguriert ist, und landet im Kalender. P1 durch Lohnlauf ist nicht wegklickbar ohne Begründung. `pnpm test` und `pnpm typecheck` sind grün. Installation auf einem frischen Debian mit nginx ist mit `docs/installation-linux.md` nachvollziehbar.

## Was du am Ende jeder Phase ausgibst

Fünf Zeilen, nicht mehr: was fertig ist, wie man es startet, welche Tests laufen, welche Rückfrage noch offen ist, welcher Branch. Keine Wiederholung dieser Spezifikation.

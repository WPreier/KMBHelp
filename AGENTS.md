# KMBHelp — Hinweise für Coding-Agenten

Verbindlich sind `PROMPT.md`, `docs/stack-entscheidung.md`, `docs/sicherheit.md`, `docs/schnittstellen.md`, `docs/ticketkatalog.md` und `docs/prozesse/`.

Nur die in `docs/status.md` offene Phase anfassen. Eine Phase pro Branch.

Keine echten Mandantendaten, keine Geheimnisse, keine Passwörter in Code, Logs, Tests oder Commit-Nachrichten.

Code auf Englisch, fachliche Oberfläche Deutsch und Englisch, Dokumentation in `docs/` auf Deutsch.

Wenn ein externer Zugang fehlt: Interface und Test-Double, dann stoppen und die Frage aus `PROMPT.md` stellen. Nicht erfinden.

## Cursor Cloud specific instructions

Dieses Verzeichnis ist die Spezifikation. Solange `docs/status.md` Phase 0 als offen führt, gibt es kein `package.json` und keinen Anwendungsserver. Health, Web und API entstehen erst in Phase 0.

`install` aktualisiert die Paketlisten, installiert PostgreSQL 16 (`postgresql`, `postgresql-client`) und legt Node 22 sowie pnpm 10 aus dem Image nach `/usr/local/bin`. Existiert `pnpm-lock.yaml`, folgt `pnpm install --frozen-lockfile`.

`start` läuft bei jedem Boot. PID 1 ist `tini`, systemd bleibt offline. Der Cluster startet mit `pg_ctlcluster 16 main start`. Danach existieren Rolle und Datenbank `kmbhelp`. Passwort und Zweck stehen in `ENTWICKLUNGSUMGEBUNG.md` (`kmbhelp-dev-only`, nur Entwicklung). Verbindung: `postgresql://kmbhelp:kmbhelp-dev-only@127.0.0.1:5432/kmbhelp`. Bereitschaft: `pg_isready -q`.

Prüfbefehle auf diesem Platz: `node -v` (22), `pnpm -v` (10), `psql --version` (16), `git --version` (Ubuntu-24.04-Paket 2.43). Git-Operationen mit 2.43 sind für dieses Repository ausreichend.

# Changelog

Format `0.1.PATCH`. Die erste Fassung ist `0.1.0`. Jede inhaltliche Änderung erhöht nur die Patchnummer (`0.1.1`, `0.1.2`, …). Dieselbe Nummer steht in `VERSION`, `package.json` und `src/version.ts`. Der Eintrag hier und der Kopf von `docs/nachweis.md` nennen dieselbe Nummer. Jede solche Änderung wird committet und nach GitHub gepusht. Der Tag heißt `v0.1.PATCH`.

## 0.1.0 — 2026-11-11

Erste versionierte Fassung der Dev-App `kmbhelp-test`.

- Ergebnis-Seite gegen `https://kmbhelp.kmbcloud.at`, nur lokal, außerhalb der offenen Produktphase.
- Sechs Prüfungen, Knopf für alle Prüfungen, PDF über den Browserdruck, angemeldete Prüfung mit leerer Planvorlage.
- Zugangsdatei `~/.config/kmbhelp-test/credentials`, Modus 0600, außerhalb des Checkouts.
- Nachweis: `docs/nachweis.md`.
- Die Umsetzung davor liegt im Commit `a0e5ed8`. Tag `v0.1.0` zeigt auf den Baum mit diesem Nachweis.

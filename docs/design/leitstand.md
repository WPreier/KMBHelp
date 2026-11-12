# Designsprache Leitstand

Einzige sichtbare Designsprache von KMBHelp. Hell und Dunkel bleiben unabhängig umschaltbar.

## Zweck

Die Agentenkonsole für den Arbeitstag am Ticket. Vorbilder Zendesk Garden und Freshdesk: dichte Tabellen, klare Primärblau-Aktion, wenig Dekoration. Melder und Mitarbeiter finden denselben Inhalt, aber die Optik sagt „hier wird entschieden“.

## Referenzen

- Zendesk: SF Pro 14/20, Text `#2F3941`, Primär `#1F73B7`, Fehler `#CC3340`, Erfolg `#038153`
- Freshdesk: Primärblau um `#3973e6`, 4px-Raster, Inter/Roboto-Nähe
- Dew (Freshworks): ruhigere Flächen, WCAG 2.2 AA

## Farbe (Hell)

| Token | Hex | Rolle |
|---|---|---|
| `--bg` | `#eef2f6` | Arbeitsfläche (Sidebar und Inhalt) |
| `--surface` | `#ffffff` | Formulare und Eingaben |
| `--ink` | `#2f3941` | Text |
| `--muted` | `#68737d` | Meta |
| `--line` | `#d8dee4` | Raster |
| `--green` | `#1f73b7` | Primäraktion (Blau) |
| `--focus` | `#144a75` | aktiver Fokus |
| `--danger` | `#cc3340` | Fehler |
| `--warn` | `#ad5918` | Warnung |
| `--ok` | `#038153` | Erfolg |
| `--table-head` | `#e3e9ef` | Tabellenkopf |
| `--table-odd` / `--table-even` | `#f7f9fb` / `#e8eef4` | Zeilen |
| `--nav-active-*` | `#f7c6c6` / `#c62828` | aktive Seite |
| `--nav-hover-*` | `#cfe8fb` / `#0d47a1` | Hover |

Dunkel: Schiefer `#121820` / `#1a222c`, Primär `#4d9fd6`.

## Typografie

- **IBM Plex Sans** 400 / 500 / 600, lokal unter `apps/web/public/fonts/`
- Engere Titel (ca. 1.35rem in der Identity)
- Tabellenköpfe uppercase, kleiner Tracking, dichter Scan
- Datumseingabe und -anzeige: `dd.MM.yyyy`

## Form und Abstand

- Radius 4px (Werkzeug, kein Soft-UI)
- Kontrollhöhe 40px
- Seitenpolster enger: `1.25rem 1rem 3rem`
- Schatten nur 1px, fast flach
- Abstand Sidebar zu Inhalt: ca. 0.85rem

## Layout

- Startseite: Ticket erfassen (`/`)
- Ab 960px: linke Schiene 15rem mit Hauptmenü und Verwaltung, gleiche Höhe und gleicher Hintergrund wie der Inhalt
- Content rechts ohne Maximalbreite-Zwang im Shell
- Unter 960px: Menü wieder oben horizontal, kein Seitenverlust

## Komponenten

| Element | Regel |
|---|---|
| Primärknopf | Blau, eckig |
| Tabellenkopf | uppercase, dezent, Seitenfarben |
| Offene Tickets | feste Spaltenbreiten, ohne Alter, Checkbox „offen“ ohne Text |
| Ticketpanel | scharfer Rahmen, leichter Schatten |
| Nav aktiv | hellroter Balken, hellrote Schrift, abgerundet |
| Nav Hover | hellblauer Balken, dunkelblaue Schrift (nicht bei aktiv) |

## Bewegung

Keine. Tempo kommt aus Dichte und Scanpfad.

## Do / Don’t

- Do: Priorität und Status in einer Blickzone
- Do: Admin-Links in derselben Schiene wie die Arbeit
- Don’t: Marketing-Hero oder große Illustrationen
- Don’t: Violett oder Neon als Primärfarbe

## Abnahme

- Schiene ab Desktop sichtbar, mobil zurückgenommen
- Tabellen und Formulare lesbar bei 390px
- Hell/Dunkel ohne JavaScript-Fehler
- Schriften ohne externes CDN

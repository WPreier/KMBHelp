import type { Lang } from './types';

const copy = {
  de: {
    title: 'kmbhelp-test',
    intro:
      'Entwicklungsprüfung gegen kmbhelp. Öffentlicher Host https://kmbhelp.kmbcloud.at. Läuft nur lokal und wird nicht veröffentlicht.',
    pdf: 'Als PDF',
    runOne: 'diesen Test jetzt durchführen',
    runAllHeading: 'Alle Tests',
    runAll: 'Alle Tests ausführen',
    phaseHeading: 'Angemeldete Prüfung',
    phaseStart: 'Angemeldete Prüfung starten',
    phaseWaiting:
      'Die Seitenliste wartet auf Zugangsdaten. Es wird kein Passwort erfunden und keine Seite eingetragen, die nicht beobachtet wurde.',
    phaseComplete: 'Alle Fälle bestanden. Der Lauf ist abgeschlossen.',
    phaseIncomplete: 'Der Lauf ist erst abgeschlossen, wenn jede Zeile bestanden hat.',
    phaseEmpty: 'Noch keine beobachteten Seiten.',
    save: 'Speichern',
    username: 'Benutzername',
    password: 'Passwort',
    credentialsTitle: 'Zugangsdaten für die Anmeldung',
    credentialsSaved: 'Lokal gespeichert. Das Passwort wird nicht angezeigt.',
    credentialsMissing: 'Beim Start fehlen die Zugangsdaten. Bitte hier eintragen.',
    credentialsWhy:
      'Benutzername und Passwort stehen nicht im Repository. Die Datei liegt außerhalb des Checkouts, Modus 0600. Sie wird nicht geloggt und nicht committet.',
    replace: 'Ersetzen',
    idle: 'noch nicht ausgeführt',
    running: 'läuft',
    passed: 'bestanden',
    failed: 'fehlgeschlagen',
    devOnly: 'Nur Entwicklung.',
    language: 'Sprache',
    theme: 'Darstellung',
    themeLight: 'Hell',
    themeDark: 'Dunkel',
    pages: 'Beobachtete Seiten',
    purpose: 'Zweck',
    valid: 'gültige Eingabe',
    invalid: 'ungültige Eingabe',
    serviceError: 'Der Prüfdienst ist nicht erreichbar.',
  },
  en: {
    title: 'kmbhelp-test',
    intro:
      'Development checks against kmbhelp. Public host https://kmbhelp.kmbcloud.at. Local only. Do not publish.',
    pdf: 'As PDF',
    runOne: 'run this test now',
    runAllHeading: 'All tests',
    runAll: 'Run all tests',
    phaseHeading: 'Signed-in checks',
    phaseStart: 'Start signed-in checks',
    phaseWaiting:
      'The page inventory is waiting for credentials. No password is invented, and no page is listed that was not observed.',
    phaseComplete: 'Every case passed. The run is complete.',
    phaseIncomplete: 'The run is complete only when every row has passed.',
    phaseEmpty: 'No observed pages yet.',
    save: 'Save',
    username: 'Username',
    password: 'Password',
    credentialsTitle: 'Credentials for sign-in',
    credentialsSaved: 'Stored locally. The password is not shown.',
    credentialsMissing: 'Credentials are missing at startup. Enter them here.',
    credentialsWhy:
      'The username and password are not in the repository. The file is outside the checkout, mode 0600. It is not logged and not committed.',
    replace: 'Replace',
    idle: 'not run yet',
    running: 'running',
    passed: 'passed',
    failed: 'failed',
    devOnly: 'Development only.',
    language: 'Language',
    theme: 'Appearance',
    themeLight: 'Light',
    themeDark: 'Dark',
    pages: 'Observed pages',
    purpose: 'Purpose',
    valid: 'valid input',
    invalid: 'invalid input',
    serviceError: 'The check service is not reachable.',
  },
} as const;

export type CopyKey = keyof (typeof copy)['de'];

export function text(lang: Lang, key: CopyKey): string {
  return copy[lang][key];
}

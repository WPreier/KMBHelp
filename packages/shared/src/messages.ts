export const messages = {
  de: {
    documentTitle: 'KMBHelp',
    kmb: 'KMB Steuerberatung',
    malama: 'Malama',
    navigation: 'Kopfzeile',
    www: 'www',
    home: 'Home',
    wiki: 'Wiki',
    lead: 'Interner IT-Helpdesk der Kanzlei. Tickets können hier noch nicht erfasst werden.',
    linksMissing: 'Die Ziele für www, Home und Wiki sind noch nicht hinterlegt.',
    language: 'Sprache',
    theme: 'Darstellung',
    langDe: 'Deutsch',
    langEn: 'English',
    themeLight: 'Hell',
    themeDark: 'Dunkel',
    skip: 'Zum Inhalt',
  },
  en: {
    documentTitle: 'KMBHelp',
    kmb: 'KMB Steuerberatung',
    malama: 'Malama',
    navigation: 'Header',
    www: 'www',
    home: 'Home',
    wiki: 'Wiki',
    lead: 'Internal IT helpdesk of the firm. Tickets cannot be filed here yet.',
    linksMissing: 'The targets for www, Home and Wiki are not set yet.',
    language: 'Language',
    theme: 'Appearance',
    langDe: 'Deutsch',
    langEn: 'English',
    themeLight: 'Light',
    themeDark: 'Dark',
    skip: 'Skip to content',
  },
} as const;

export type Lang = keyof typeof messages;
export type MessageKey = keyof (typeof messages)['de'];

export const publicErrors = {
  notFound: {
    de: 'Diese Adresse gibt es nicht.',
    en: 'This address does not exist.',
  },
  internal: {
    de: 'Die Anfrage konnte nicht verarbeitet werden.',
    en: 'The request could not be processed.',
  },
} as const;

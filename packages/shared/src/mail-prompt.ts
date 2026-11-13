export const defaultAiProvider = 'grok';

export const aiProviderNames = ['grok', 'gemini', 'deepseek', 'other'] as const;

export type AiProviderName = (typeof aiProviderNames)[number];

export const defaultInternalMailDomains =
  'kmb-steuerberatung.at,ght.at,koller-rohrschach.at';

export const defaultMailPrompt = [
  'Lies diese E-Mail. Antworte mit einem dieser Wörter:',
  'SUPPORT',
  'ANTWORT',
  'SPAM',
  '',
  'SUPPORT ist eine neue Support-Anfrage von einem Kunden.',
  'ANTWORT ist eine Antwort auf ein bestehendes Ticket.',
  'SPAM ist Spam, Werbung, ein Newsletter oder eine automatische Nachricht.',
  '',
  'Nur wenn die erste Zeile SUPPORT ist, schreibe danach:',
  'KATEGORIE: eine kurze Bezeichnung der Anfrage',
  'WICHTIGKEIT: P1 oder P2 oder P3, und nur wenn die Wichtigkeit eindeutig ist.',
  'P1 ist sehr wichtig. P2 heißt wichtig. P3 heißt bei Gelegenheit.',
  'Wenn die Wichtigkeit nicht eindeutig ist, schreibe P4',
].join('\n');

const domainPattern = /^[a-z0-9.-]+\.[a-z]{2,}$/u;

export function internalMailDomains(value: string | undefined): string[] {
  const source = value?.trim() ? value : defaultInternalMailDomains;
  const found = source
    .split(/[\s,;]+/u)
    .map((entry) => entry.trim().toLowerCase().replace(/^@/u, ''))
    .filter((entry) => domainPattern.test(entry));
  return [...new Set(found)];
}

export function aiProviderName(value: string | undefined): AiProviderName {
  const name = value?.trim().toLowerCase() ?? '';
  if ((aiProviderNames as readonly string[]).includes(name)) return name as AiProviderName;
  return defaultAiProvider;
}

export function mailPromptText(value: string | undefined): string {
  const text = value?.trim() ?? '';
  return text ? text.slice(0, 4000) : defaultMailPrompt;
}

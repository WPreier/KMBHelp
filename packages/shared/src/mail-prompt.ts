export const defaultAiProvider = 'grok';

export const aiProviderNames = ['grok', 'gemini', 'deepseek', 'other'] as const;

export type AiProviderName = (typeof aiProviderNames)[number];

export const defaultInternalMailDomains =
  'kmb-steuerberatung.at,ght.at,koller-rohrschach.at';

export const defaultMailPrompt = `Analysiere die folgende E-Mail und beantworte nur mit:
- "JA" wenn es eine Anfrage/Anliegen eines Benutzers ist (Support, Frage, Bestellung, Beschwerde, Angebot etc.)
- "NEIN" wenn es Newsletter, Werbung, automatische Benachrichtigung oder Spam ist

Begründung in einem Satz.`;

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

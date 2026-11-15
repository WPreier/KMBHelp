export const defaultAiProvider = 'grok';

export const aiProviderNames = ['grok', 'gemini', 'deepseek', 'other'] as const;

export type AiProviderName = (typeof aiProviderNames)[number];

export const defaultInternalMailDomains =
  'kmb-steuerberatung.at,ght.at,koller-rohrschach.at';

/** Legacy JA/NEIN prompt for search/knowledge paths — not used by the mail check. */
export const defaultMailPrompt = [
  'Ist das eine Support-Anfrage an das Helpdesk?',
  'Antworte mit genau einem Wort: JA oder NEIN.',
  'JA heißt: neue Support-Anfrage.',
  'NEIN heißt: keine neue Support-Anfrage.',
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

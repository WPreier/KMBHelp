import { maskPersonalData } from '@kmbhelp/ai';
import type { Priority } from '@kmbhelp/shared';
import type { InboundMail } from './graph.js';

export const mailQueryLimitMs = 5 * 60 * 1000;
export const defaultOllamaUrl = 'http://192.168.191.131:11434';
export const defaultOllamaModel = 'qwen2.5:7b';
export const defaultMailErrorTo = 'helpdesk@ppc.at';

export type LocalMailResult = {
  kind: 'support' | 'reply' | 'close' | 'foreign' | 'spam';
  category: string | null;
  priority: Priority | null;
  model: string;
};

export type MailAsk = LocalMailResult | 'timeout' | 'unreachable' | 'unclear';

const classWord: Record<string, LocalMailResult['kind']> = {
  support: 'support',
  antwort: 'reply',
  abschluss: 'close',
  fremd: 'foreign',
  spam: 'spam',
};

export function mailExcerpt(mail: InboundMail): string {
  const lines = [
    mail.fromName ? `From: ${mail.fromName} <${mail.fromEmail}>` : `From: ${mail.fromEmail}`,
    mail.to ? `To: ${mail.to}` : '',
    mail.cc ? `Cc: ${mail.cc}` : '',
    mail.sentAt ? `Date: ${mail.sentAt}` : '',
    `Subject: ${mail.subject}`,
    mail.internetMessageId ? `Message-ID: ${mail.internetMessageId}` : '',
    mail.inReplyTo ? `In-Reply-To: ${mail.inReplyTo}` : '',
    mail.references ? `References: ${mail.references}` : '',
    '',
    maskPersonalData(mail.body).slice(0, 8000),
  ];
  return lines.filter((line, index) => line !== '' || index === lines.length - 2).join('\n');
}

export function classificationPrompt(mail: InboundMail): string {
  return [
    'Lies diese E-Mail. Antworte mit genau einer ersten Zeile und einem dieser Wörter:',
    'SUPPORT',
    'ANTWORT',
    'ABSCHLUSS',
    'FREMD',
    'SPAM',
    '',
    'SUPPORT ist eine neue Support-Anfrage.',
    'ANTWORT ist eine Antwort auf ein bestehendes Ticket.',
    'ABSCHLUSS heißt, der Absender schließt ein Ticket ab und nennt keine Ticketnummer.',
    'FREMD ist eine fremde Mail und kein Helpdesk-Anliegen.',
    'SPAM ist Spam, Werbung, ein Newsletter oder eine automatische Nachricht.',
    '',
    'Nur wenn die erste Zeile SUPPORT ist, schreibe danach:',
    'KATEGORIE: eine kurze Bezeichnung der Anfrage',
    'WICHTIGKEIT: P1 oder P2 oder P3, und nur wenn die Wichtigkeit eindeutig ist.',
    'P1 ist sehr wichtig. P2 heißt bitte heute noch. P3 heißt bei Gelegenheit.',
    'Wenn die Wichtigkeit nicht eindeutig ist, lasse die Zeile WICHTIGKEIT weg.',
    '',
    mailExcerpt(mail),
  ].join('\n');
}

export function importancePrompt(mail: InboundMail): string {
  return [
    'Ist die Wichtigkeit dieser Support-Anfrage eindeutig eine der drei Stufen?',
    'Antworte mit genau einer Zeile: P1 oder P2 oder P3.',
    'P1 ist sehr wichtig. P2 heißt bitte heute noch. P3 heißt bei Gelegenheit.',
    'Wenn du es nicht eindeutig sagen kannst, antworte mit genau: UNKLAR',
    '',
    mailExcerpt(mail),
  ].join('\n');
}

export function parseMailAnswer(text: string): Omit<LocalMailResult, 'model'> | null {
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const first = lines[0]?.replace(/^[^a-zA-ZäöüÄÖÜ]+|[^a-zA-ZäöüÄÖÜ]+$/gu, '').toLowerCase() ?? '';
  const kind = classWord[first];
  if (!kind) return null;
  if (kind !== 'support') return { kind, category: null, priority: null };
  let category: string | null = null;
  let priority: Priority | null = null;
  for (const line of lines.slice(1)) {
    const categoryMatch = /^kategorie\s*:\s*(.+)$/iu.exec(line);
    if (categoryMatch?.[1] && /[\p{L}]/u.test(categoryMatch[1])) {
      category = categoryMatch[1].trim().slice(0, 80);
    }
    const importanceMatch = /^wichtigkeit\s*:\s*(.+)$/iu.exec(line);
    if (importanceMatch?.[1]) priority = importanceOf(importanceMatch[1]);
  }
  return { kind, category, priority };
}

export function importanceOf(text: string): Priority | null {
  const folded = text.trim().toLowerCase();
  if (folded === '' || folded === 'unklar') return null;
  if (/^p1\b/u.test(folded) || folded === 'sehr wichtig') return 'p1';
  if (/^p2\b/u.test(folded) || folded === 'bitte heute noch') return 'p2';
  if (/^p3\b/u.test(folded) || folded === 'bei gelegenheit' || folded === 'niedrig') return 'p3';
  return null;
}

export async function askOllama(options: {
  baseUrl: string;
  model: string;
  mail: InboundMail;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<MailAsk> {
  const base = options.baseUrl.trim().replace(/\/$/u, '');
  if (!/^https?:\/\/[^/\s]+/u.test(base) || base.includes('@')) return 'unreachable';
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? mailQueryLimitMs;
  const model = options.model.trim() || defaultOllamaModel;
  const first = await chat(fetchImpl, base, model, classificationPrompt(options.mail), timeoutMs);
  if (first === 'timeout' || first === 'unreachable') return first;
  let parsed = parseMailAnswer(first);
  if (!parsed) {
    const again = await chat(
      fetchImpl,
      base,
      model,
      `${classificationPrompt(options.mail)}\n\nDie letzte Antwort war nicht lesbar. Antworte jetzt mit genau einem Wort: SUPPORT, ANTWORT, ABSCHLUSS, FREMD oder SPAM.`,
      timeoutMs,
    );
    if (again === 'timeout' || again === 'unreachable') return again;
    parsed = parseMailAnswer(again);
  }
  if (!parsed) return 'unclear';
  if (parsed.kind === 'support' && !parsed.priority) {
    const importance = await chat(
      fetchImpl,
      base,
      model,
      importancePrompt(options.mail),
      timeoutMs,
    );
    if (importance === 'timeout' || importance === 'unreachable') return importance;
    parsed = { ...parsed, priority: importanceOf(importance) };
  }
  return { ...parsed, model };
}

async function chat(
  fetchImpl: typeof fetch,
  baseUrl: string,
  model: string,
  prompt: string,
  timeoutMs: number,
): Promise<string | 'timeout' | 'unreachable'> {
  try {
    const response = await fetchImpl(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return 'unreachable';
    const body: unknown = await response.json();
    const content =
      body &&
      typeof body === 'object' &&
      'message' in body &&
      body.message &&
      typeof body.message === 'object' &&
      'content' in body.message &&
      typeof body.message.content === 'string'
        ? body.message.content
        : '';
    return content.trim() === '' ? 'unreachable' : content;
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') return 'timeout';
    return 'unreachable';
  }
}

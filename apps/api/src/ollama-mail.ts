import { maskPersonalData } from '@kmbhelp/ai';
import { defaultMailcheckModel, mailcheckInputMax, type Priority } from '@kmbhelp/shared';
import { enqueueFileLog } from './file-log.js';
import type { InboundMail } from './graph.js';
import { withOllamaJob } from './ollama-gate.js';

export const mailQueryLimitMs = 5 * 60 * 1000;
export const defaultOllamaUrl = 'http://192.168.191.131:11434';
export const defaultOllamaModel = defaultMailcheckModel;
export const openRouterApiUrl = 'https://openrouter.ai/api/v1';
export const defaultMailErrorTo = 'helpdesk@ppc.at';
export { mailcheckInputMax };

export type MailcheckProvider = 'ollama' | 'openrouter';

/** OpenRouter wins when both API key and model are set; otherwise Ollama. */
export function mailcheckProvider(env: NodeJS.ProcessEnv = process.env): MailcheckProvider {
  const key = env.OPENROUTER_API_KEY?.trim() ?? '';
  const model = env.OPENROUTER_MODEL?.trim() ?? '';
  return key !== '' && model !== '' ? 'openrouter' : 'ollama';
}

export type LocalMailResult = {
  kind: 'support' | 'reply' | 'close' | 'foreign' | 'spam';
  category: string | null;
  priority: Priority | null;
  model: string;
};

export type MailAsk = LocalMailResult | 'timeout' | 'unreachable' | 'unclear';

export type MailExchange = {
  kind: 'classify' | 'retry' | 'importance';
  prompt: string;
  answer: string;
};

type ParsedMail = Omit<LocalMailResult, 'model'> & { importanceSettled: boolean };

const classWord: Record<string, LocalMailResult['kind']> = {
  support: 'support',
  antwort: 'reply',
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
    maskPersonalData(mail.body),
  ];
  return lines
    .filter((line, index) => line !== '' || index === lines.length - 2)
    .join('\n')
    .slice(0, mailcheckInputMax);
}

export function classificationInstructions(): string {
  return [
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
}

export function classificationPrompt(mail: InboundMail, instructions?: string): string {
  const head = (instructions ?? classificationInstructions()).replace(/\s+$/u, '');
  return `${head}\n\n${mailExcerpt(mail)}`;
}

export function importancePrompt(mail: InboundMail): string {
  return [
    'Ist die Wichtigkeit dieser Support-Anfrage eindeutig eine der Stufen?',
    'Antworte mit genau einer Zeile: P1 oder P2 oder P3 oder P4.',
    'P1 ist sehr wichtig. P2 heißt wichtig. P3 heißt bei Gelegenheit. P4 heißt nicht eingeordnet.',
    'Wenn du es nicht eindeutig sagen kannst, antworte mit genau: P4',
    '',
    mailExcerpt(mail),
  ].join('\n');
}

export function parseMailAnswer(text: string): ParsedMail | null {
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const first = lines[0]?.replace(/^[^a-zA-ZäöüÄÖÜ]+|[^a-zA-ZäöüÄÖÜ]+$/gu, '').toLowerCase() ?? '';
  const kind = classWord[first];
  if (!kind) return null;
  if (kind !== 'support') return { kind, category: null, priority: null, importanceSettled: true };
  let category: string | null = null;
  let priority: Priority | null = null;
  let importanceSettled = false;
  for (const line of lines.slice(1)) {
    const categoryMatch = /^kategorie\s*:\s*(.+)$/iu.exec(line);
    if (categoryMatch?.[1] && /[\p{L}]/u.test(categoryMatch[1])) {
      category = categoryMatch[1].trim().slice(0, 80);
    }
    const importanceMatch = /^wichtigkeit\s*:\s*(.+)$/iu.exec(line);
    if (importanceMatch?.[1]) {
      const read = readImportance(importanceMatch[1]);
      priority = read.priority;
      importanceSettled = read.settled;
    }
  }
  return { kind, category, priority, importanceSettled };
}

export function importanceOf(text: string): Priority | null {
  return readImportance(text).priority;
}

export function readImportance(text: string): { priority: Priority | null; settled: boolean } {
  const folded = text.trim().toLowerCase();
  if (folded === '' || folded === 'unklar') return { priority: null, settled: false };
  if (/^p4\b/u.test(folded) || folded === 'nicht eingeordnet') {
    return { priority: null, settled: true };
  }
  if (/^p1\b/u.test(folded) || folded === 'sehr wichtig') return { priority: 'p1', settled: true };
  if (/^p2\b/u.test(folded) || folded === 'wichtig' || folded === 'bitte heute noch') {
    return { priority: 'p2', settled: true };
  }
  if (/^p3\b/u.test(folded) || folded === 'bei gelegenheit' || folded === 'niedrig') {
    return { priority: 'p3', settled: true };
  }
  return { priority: null, settled: false };
}

/** Default on. Only the value `off` disables the automatic mail check. */
export function mailcheckAiActive(value: string | undefined): boolean {
  return (value ?? 'on').trim().toLowerCase() !== 'off';
}

export async function askOllama(options: {
  baseUrl: string;
  model: string;
  mail: InboundMail;
  instructions?: string | undefined;
  trace?: MailExchange[] | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  /** When set with a model, chat goes to OpenRouter instead of Ollama. */
  openRouterApiKey?: string | undefined;
  /** When this returns false, stop before the next model call and leave the mail unread. */
  continueWhen?: (() => Promise<boolean>) | undefined;
}): Promise<MailAsk> {
  return withOllamaJob(() => runAskOllama(options), options.env ?? process.env);
}

async function runAskOllama(options: {
  baseUrl: string;
  model: string;
  mail: InboundMail;
  instructions?: string | undefined;
  trace?: MailExchange[] | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  openRouterApiKey?: string | undefined;
  continueWhen?: (() => Promise<boolean>) | undefined;
}): Promise<MailAsk> {
  const openRouterKey = options.openRouterApiKey?.trim() ?? '';
  const useOpenRouter = openRouterKey !== '';
  const base = useOpenRouter
    ? openRouterApiUrl
    : options.baseUrl.trim().replace(/\/$/u, '');
  if (!useOpenRouter && (!/^https?:\/\/[^/\s]+/u.test(base) || base.includes('@'))) {
    return 'unreachable';
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? mailQueryLimitMs;
  const model = useOpenRouter
    ? options.model.trim()
    : options.model.trim() || defaultOllamaModel;
  if (model === '') return 'unreachable';
  if (!(await stillActive(options.continueWhen))) return 'unreachable';
  const target: ChatTarget = {
    provider: useOpenRouter ? 'openrouter' : 'ollama',
    baseUrl: base,
    apiKey: openRouterKey,
    model,
  };
  const classify = classificationPrompt(options.mail, options.instructions);
  const first = await chat(fetchImpl, target, classify, timeoutMs, 'classify');
  options.trace?.push({ kind: 'classify', prompt: classify, answer: shown(first) });
  if (first === 'timeout' || first === 'unreachable') return first;
  let parsed = parseMailAnswer(first);
  if (!parsed) {
    if (!(await stillActive(options.continueWhen))) return 'unreachable';
    const retry = `${classify}\n\nDie letzte Antwort war nicht lesbar. Antworte jetzt mit genau einem Wort: SUPPORT, ANTWORT oder SPAM.`;
    const again = await chat(fetchImpl, target, retry, timeoutMs, 'retry');
    options.trace?.push({ kind: 'retry', prompt: retry, answer: shown(again) });
    if (again === 'timeout' || again === 'unreachable') return again;
    parsed = parseMailAnswer(again);
  }
  if (!parsed) return 'unclear';
  if (parsed.kind === 'support' && !parsed.priority && !parsed.importanceSettled) {
    if (!(await stillActive(options.continueWhen))) return 'unreachable';
    const importanceText = importancePrompt(options.mail);
    const importance = await chat(fetchImpl, target, importanceText, timeoutMs, 'importance');
    options.trace?.push({ kind: 'importance', prompt: importanceText, answer: shown(importance) });
    if (importance === 'timeout' || importance === 'unreachable') return importance;
    const read = readImportance(importance);
    parsed = { ...parsed, priority: read.priority, importanceSettled: read.settled };
  }
  return {
    kind: parsed.kind,
    category: parsed.category,
    priority: parsed.priority,
    model,
  };
}

export async function probeOllamaModel(options: {
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  openRouterApiKey?: string | undefined;
}): Promise<'ok' | 'missing' | 'unreachable'> {
  return withOllamaJob(() => runProbeOllamaModel(options), options.env ?? process.env);
}

async function runProbeOllamaModel(options: {
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  openRouterApiKey?: string | undefined;
}): Promise<'ok' | 'missing' | 'unreachable'> {
  const model = options.model.trim();
  if (model === '') return 'missing';
  const openRouterKey = options.openRouterApiKey?.trim() ?? '';
  if (openRouterKey !== '') {
    return probeOpenRouterModel(options.fetchImpl ?? fetch, openRouterKey, model, options.timeoutMs);
  }
  const base = options.baseUrl.trim().replace(/\/$/u, '');
  if (!/^https?:\/\/[^/\s]+/u.test(base) || base.includes('@')) return 'unreachable';
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  try {
    const response = await fetchImpl(`${base}/api/tags`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return 'unreachable';
    const body: unknown = await response.json();
    const names = modelNames(body);
    if (names.length === 0) return 'unreachable';
    return names.some((name) => name === model || name.startsWith(`${model}:`))
      ? 'ok'
      : 'missing';
  } catch {
    return 'unreachable';
  }
}

async function probeOpenRouterModel(
  fetchImpl: typeof fetch,
  apiKey: string,
  model: string,
  timeoutMs = 15_000,
): Promise<'ok' | 'missing' | 'unreachable'> {
  try {
    const response = await fetchImpl(`${openRouterApiUrl}/models`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return 'unreachable';
    const body: unknown = await response.json();
    const names = openRouterModelIds(body);
    if (names.length === 0) return 'unreachable';
    return names.includes(model) ? 'ok' : 'missing';
  } catch {
    return 'unreachable';
  }
}

async function stillActive(continueWhen?: (() => Promise<boolean>) | undefined): Promise<boolean> {
  if (!continueWhen) return true;
  try {
    return await continueWhen();
  } catch {
    return true;
  }
}

function modelNames(body: unknown): string[] {
  if (!body || typeof body !== 'object' || !('models' in body) || !Array.isArray(body.models)) {
    return [];
  }
  return body.models.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const name =
      'name' in entry && typeof entry.name === 'string'
        ? entry.name
        : 'model' in entry && typeof entry.model === 'string'
          ? entry.model
          : '';
    return name.trim() === '' ? [] : [name.trim()];
  });
}

function openRouterModelIds(body: unknown): string[] {
  if (!body || typeof body !== 'object' || !('data' in body) || !Array.isArray(body.data)) {
    return [];
  }
  return body.data.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const id = 'id' in entry && typeof entry.id === 'string' ? entry.id.trim() : '';
    return id === '' ? [] : [id];
  });
}

function shown(value: string | 'timeout' | 'unreachable'): string {
  return value;
}

type ChatTarget = {
  provider: MailcheckProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
};

async function chat(
  fetchImpl: typeof fetch,
  target: ChatTarget,
  prompt: string,
  timeoutMs: number,
  kind: 'classify' | 'retry' | 'importance',
): Promise<string | 'timeout' | 'unreachable'> {
  const started = Date.now();
  try {
    const response =
      target.provider === 'openrouter'
        ? await fetchImpl(`${target.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${target.apiKey}`,
            },
            body: JSON.stringify({
              model: target.model,
              messages: [{ role: 'user', content: prompt }],
            }),
            signal: AbortSignal.timeout(timeoutMs),
          })
        : await fetchImpl(`${target.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              model: target.model,
              stream: false,
              messages: [{ role: 'user', content: prompt }],
            }),
            signal: AbortSignal.timeout(timeoutMs),
          });
    if (!response.ok) {
      noteModel(target, kind, prompt, '', response.status, Date.now() - started);
      return 'unreachable';
    }
    const body: unknown = await response.json();
    const content =
      target.provider === 'openrouter' ? openRouterContent(body) : ollamaContent(body);
    const answer = content.trim();
    noteModel(target, kind, prompt, answer, response.status, Date.now() - started);
    return answer === '' ? 'unreachable' : content;
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const status = name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'unreachable';
    noteModel(target, kind, prompt, '', status, Date.now() - started);
    return status;
  }
}

function ollamaContent(body: unknown): string {
  if (
    body &&
    typeof body === 'object' &&
    'message' in body &&
    body.message &&
    typeof body.message === 'object' &&
    'content' in body.message &&
    typeof body.message.content === 'string'
  ) {
    return body.message.content;
  }
  return '';
}

function openRouterContent(body: unknown): string {
  if (!body || typeof body !== 'object' || !('choices' in body) || !Array.isArray(body.choices)) {
    return '';
  }
  const first = body.choices[0];
  if (!first || typeof first !== 'object' || !('message' in first)) return '';
  const message = first.message;
  if (!message || typeof message !== 'object' || !('content' in message)) return '';
  return typeof message.content === 'string' ? message.content : '';
}

function noteModel(
  target: ChatTarget,
  kind: string,
  prompt: string,
  answer: string,
  status: number | string,
  ms: number,
): void {
  let host = target.baseUrl;
  try {
    host = new URL(target.baseUrl).hostname;
  } catch {
    host = target.baseUrl;
  }
  const name =
    target.provider === 'openrouter'
      ? 'openrouter.ai'
      : host === '192.168.191.131' || host.toLowerCase() === 'kmblmt1'
        ? 'kmblmt1'
        : host;
  enqueueFileLog(
    'ki',
    [
      new Date().toISOString(),
      target.provider,
      kind,
      `${name} ${oneLine(target.model)} http=${status}`,
      (ms / 1000).toFixed(1),
      oneLine(prompt, 12000),
      oneLine(answer, 4000),
    ].join('\t'),
  );
}

function oneLine(value: string, max = 180): string {
  return value.replace(/[\r\n\t]/gu, ' ').slice(0, max);
}

export function formatMailSource(mail: InboundMail): string {
  const from = mail.fromName.trim()
    ? `From: ${mail.fromName.trim()} <${mail.fromEmail.trim()}>`
    : `From: ${mail.fromEmail.trim()}`;
  return [
    from,
    `To: ${mail.to ?? ''}`,
    `Cc: ${mail.cc ?? ''}`,
    `Date: ${mail.sentAt ?? ''}`,
    `Subject: ${mail.subject}`,
    `Message-ID: ${mail.internetMessageId}`,
    `In-Reply-To: ${mail.inReplyTo ?? ''}`,
    `References: ${mail.references ?? ''}`,
    '',
    mail.body,
  ].join('\n');
}

export function parsePastedMail(text: string): InboundMail {
  const normalized = text.replace(/\r\n/gu, '\n').replace(/\r/gu, '\n');
  const breakAt = normalized.indexOf('\n\n');
  const head = breakAt === -1 ? normalized : normalized.slice(0, breakAt);
  const rest = breakAt === -1 ? '' : normalized.slice(breakAt + 2);
  const first = head.split('\n').find((line) => line.trim() !== '') ?? '';
  if (!/^(from|to|cc|date|subject|message-id|in-reply-to|references)\s*:/iu.test(first)) {
    return pastedMail(normalized.trim());
  }
  const headers = new Map<string, string>();
  let name = '';
  let value = '';
  const flush = () => {
    if (name !== '') headers.set(name, value.trim());
  };
  for (const line of head.split('\n')) {
    if (/^[ \t]/u.test(line) && name !== '') {
      value = `${value} ${line.trim()}`;
      continue;
    }
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/u.exec(line);
    if (!match?.[1]) continue;
    flush();
    name = match[1].toLowerCase();
    value = match[2] ?? '';
  }
  flush();
  const from = parseAddress(headers.get('from') ?? '');
  return pastedMail(rest.trim(), {
    internetMessageId: headers.get('message-id') ?? '',
    subject: headers.get('subject') ?? '',
    fromEmail: from.email,
    fromName: from.name,
    to: headers.get('to') ?? '',
    cc: headers.get('cc') ?? '',
    sentAt: headers.get('date') ?? '',
    inReplyTo: headers.get('in-reply-to') ?? '',
    references: headers.get('references') ?? '',
  });
}

function pastedMail(body: string, fields: Partial<InboundMail> = {}): InboundMail {
  return {
    graphId: 'pasted',
    internetMessageId: (fields.internetMessageId ?? '').slice(0, 500),
    subject: (fields.subject ?? '').slice(0, 500),
    body: body.slice(0, 20_000),
    fromEmail: (fields.fromEmail ?? '').slice(0, 200),
    fromName: (fields.fromName ?? '').slice(0, 200),
    to: (fields.to ?? '').slice(0, 500),
    cc: (fields.cc ?? '').slice(0, 500),
    sentAt: (fields.sentAt ?? '').slice(0, 40),
    inReplyTo: (fields.inReplyTo ?? '').slice(0, 500),
    references: (fields.references ?? '').slice(0, 500),
    unread: true,
  };
}

function parseAddress(value: string): { name: string; email: string } {
  const match = /^(.*)<([^<>]+)>\s*$/u.exec(value.trim());
  if (!match) return { name: '', email: value.trim().toLowerCase() };
  return {
    name: (match[1] ?? '').trim().replace(/^"|"$/gu, ''),
    email: (match[2] ?? '').trim().toLowerCase(),
  };
}

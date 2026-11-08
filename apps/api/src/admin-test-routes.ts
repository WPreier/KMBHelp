import type { FastifyInstance, FastifyRequest } from 'fastify';
import { maskPersonalData } from '@kmbhelp/ai';
import type { Database } from '@kmbhelp/db';
import {
  mailboxListSchema,
  mailboxMessageSchema,
  mailboxReadSchema,
  mailTestPromptSchema,
  mailTestRequestSchema,
  mailTestResultSchema,
  publicErrors,
} from '@kmbhelp/shared';
import { requireAdministrator } from './auth.js';
import { writeActivity } from './activity-log.js';
import { inboxListCap, mailboxFromEnv, type InboundMail, type Mailbox } from './graph.js';
import { clientAddress, PublicError } from './http.js';
import {
  askOllama,
  classificationInstructions,
  defaultOllamaModel,
  defaultOllamaUrl,
  formatMailSource,
  parsePastedMail,
  type MailAsk,
  type MailExchange,
} from './ollama-mail.js';

const missingMail = {
  de: 'Die E-Mail fehlt.',
  en: 'The email is missing.',
};

export function registerAdminTests(
  app: FastifyInstance,
  options: {
    database: Database | undefined;
    adminAllowlist: string;
    now?: (() => Date) | undefined;
    env?: NodeJS.ProcessEnv | undefined;
    mailbox?: Mailbox | undefined;
    fetchImpl?: typeof fetch | undefined;
  },
): void {
  const now = options.now ?? (() => new Date());
  const env = options.env ?? process.env;

  function mailbox(): Mailbox {
    return options.mailbox ?? mailboxFromEnv(env, options.fetchImpl);
  }

  async function administrator(request: FastifyRequest, writing: boolean) {
    return requireAdministrator(options.database, request, options.adminAllowlist, now(), writing);
  }

  app.get('/api/v1/admin/mail-test', async (request) => {
    await administrator(request, false);
    return mailTestPromptSchema.parse({ prompt: classificationInstructions() });
  });

  app.post('/api/v1/admin/mail-test', async (request) => {
    const actor = await administrator(request, true);
    const parsed = mailTestRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    if (parsed.data.email.trim() === '') throw new PublicError(400, 'invalid_input', missingMail);
    const mail = parsePastedMail(parsed.data.email);
    const trace: MailExchange[] = [];
    const started = Date.now();
    const result = await askOllama({
      baseUrl: env.MAILCHECK_KI_URL?.trim() || defaultOllamaUrl,
      model: env.MAILCHECK_KI_MODEL?.trim() || defaultOllamaModel,
      mail,
      instructions: parsed.data.prompt.trim() === '' ? undefined : parsed.data.prompt,
      trace,
      fetchImpl: options.fetchImpl,
    });
    const seconds = Number(((Date.now() - started) / 1000).toFixed(1));
    const text = describeAsk(result);
    if (options.database) {
      await writeActivity(options.database, {
        actor: actor.email,
        kind: 'mail',
        target: 'mail-test',
        detail: text.textDe,
        ip: clientAddress(request),
      }).catch(() => undefined);
    }
    return mailTestResultSchema.parse({ seconds, exchanges: trace, ...text });
  });

  app.get('/api/v1/admin/mailbox', async (request) => {
    await administrator(request, false);
    const box = mailbox();
    if (!box.configured) {
      throw new PublicError(503, 'mail_not_connected', publicErrors.mailNotConnected);
    }
    const listed = await box.listInbox(inboxListCap);
    return mailboxListSchema.parse({
      truncated: listed.truncated,
      messages: listed.messages.map(messageRow),
    });
  });

  app.get('/api/v1/admin/mailbox/message', async (request) => {
    await administrator(request, false);
    const id = readId(request.query);
    const mail = await findInInbox(mailbox(), id);
    return mailboxMessageSchema.parse(messageView(mail));
  });

  app.post('/api/v1/admin/mailbox/read', async (request) => {
    const actor = await administrator(request, true);
    const parsed = mailboxReadSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const box = mailbox();
    if (!box.configured) {
      throw new PublicError(503, 'mail_not_connected', publicErrors.mailNotConnected);
    }
    await box.setRead(parsed.data.graphId, !parsed.data.unread);
    if (options.database) {
      await writeActivity(options.database, {
        actor: actor.email,
        kind: 'mail',
        target: 'mailbox',
        detail: parsed.data.unread ? 'ungelesen' : 'gelesen',
        ip: clientAddress(request),
      }).catch(() => undefined);
    }
    return { graphId: parsed.data.graphId, unread: parsed.data.unread };
  });
}

function messageRow(mail: InboundMail) {
  return {
    graphId: mail.graphId,
    fromName: mail.fromName,
    fromEmail: mail.fromEmail,
    to: mail.to ?? '',
    cc: mail.cc ?? '',
    sentAt: mail.sentAt ?? '',
    subject: mail.subject,
    internetMessageId: mail.internetMessageId,
    inReplyTo: mail.inReplyTo ?? '',
    references: mail.references ?? '',
    body: maskPersonalData(mail.body).slice(0, 8000),
    unread: mail.unread,
  };
}

function messageView(mail: InboundMail) {
  return { ...messageRow(mail), source: formatMailSource(mail) };
}

async function findInInbox(box: Mailbox, graphId: string): Promise<InboundMail> {
  if (!box.configured) {
    throw new PublicError(503, 'mail_not_connected', publicErrors.mailNotConnected);
  }
  const mail = (await box.listInbox(inboxListCap)).messages.find(
    (item) => item.graphId === graphId,
  );
  if (!mail) throw new PublicError(404, 'not_found', publicErrors.notFound);
  return mail;
}

function readId(query: unknown): string {
  const id =
    query && typeof query === 'object' && 'id' in query && typeof query.id === 'string'
      ? query.id.trim()
      : '';
  if (id === '' || id.length > 2000)
    throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
  return id;
}

function describeAsk(result: MailAsk): { textDe: string; textEn: string } {
  if (result === 'timeout') {
    return {
      textDe: 'Die Abfrage hat das Zeitlimit erreicht.',
      textEn: 'The query reached the time limit.',
    };
  }
  if (result === 'unreachable') {
    return { textDe: 'Ollama ist nicht erreichbar.', textEn: 'Ollama cannot be reached.' };
  }
  if (result === 'unclear') {
    return { textDe: 'Die Antwort war nicht lesbar.', textEn: 'The answer could not be read.' };
  }
  const category = result.category ? `, Kategorie ${result.category}` : '';
  const categoryEn = result.category ? `, category ${result.category}` : '';
  const priority = result.priority ? `, ${result.priority.toUpperCase()}` : '';
  return {
    textDe: `Ergebnis: ${result.kind}${category}${priority}.`,
    textEn: `Result: ${result.kind}${categoryEn}${priority}.`,
  };
}

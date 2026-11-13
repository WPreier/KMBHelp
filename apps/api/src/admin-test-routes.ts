import type { FastifyInstance, FastifyRequest } from 'fastify';
import { maskPersonalData } from '@kmbhelp/ai';
import type { Database } from '@kmbhelp/db';
import {
  isMailcheckModel,
  mailboxListSchema,
  mailboxMessageSchema,
  mailboxReadSchema,
  mailcheckInputMax,
  mailcheckModels,
  mailTestActiveRequestSchema,
  mailTestActiveResultSchema,
  mailTestEmailMax,
  mailTestModelRequestSchema,
  mailTestModelResultSchema,
  mailTestPromptMax,
  mailTestPromptSchema,
  mailTestRequestSchema,
  mailTestResultSchema,
  publicErrors,
  resolveMailcheckModel,
} from '@kmbhelp/shared';
import type { ZodError } from 'zod';
import { requireAdministrator } from './auth.js';
import { writeActivity } from './activity-log.js';
import { saveConfigValue } from './config-store.js';
import { inboxListCap, mailboxFromEnv, type InboundMail, type Mailbox } from './graph.js';
import { clientAddress, PublicError } from './http.js';
import {
  askOllama,
  classificationInstructions,
  defaultOllamaModel,
  defaultOllamaUrl,
  formatMailSource,
  mailcheckAiActive,
  parsePastedMail,
  probeOllamaModel,
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
    return mailTestPromptSchema.parse({
      prompt: classificationInstructions(),
      model: resolveMailcheckModel(env.MAILCHECK_AI_MODEL),
      models: [...mailcheckModels],
      active: mailcheckAiActive(env.MAILCHECK_AI_ACTIVE),
    });
  });

  app.post('/api/v1/admin/mail-test', async (request) => {
    const actor = await administrator(request, true);
    const parsed = mailTestRequestSchema.safeParse(request.body);
    if (!parsed.success) throw mailTestInputError(parsed.error);
    if (parsed.data.email.trim() === '') throw new PublicError(400, 'invalid_input', missingMail);
    const mail = parsePastedMail(parsed.data.email);
    const trace: MailExchange[] = [];
    const started = Date.now();
    const model = resolveMailcheckModel(
      parsed.data.model?.trim() || env.MAILCHECK_AI_MODEL || defaultOllamaModel,
    );
    const result = await askOllama({
      baseUrl: env.MAILCHECK_AI_URL?.trim() || defaultOllamaUrl,
      model,
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

  app.post('/api/v1/admin/mail-test/model', async (request) => {
    const actor = await administrator(request, true);
    const parsed = mailTestModelRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new PublicError(400, 'invalid_input', {
        de: 'Das gewählte Modell ist ungültig.',
        en: 'The selected model is invalid.',
      });
    }
    if (!isMailcheckModel(parsed.data.model)) {
      throw new PublicError(400, 'invalid_input', {
        de: `Das Modell ${parsed.data.model} ist nicht freigegeben. Erlaubt sind ${mailcheckModels.join(', ')}.`,
        en: `The model ${parsed.data.model} is not allowed. Permitted: ${mailcheckModels.join(', ')}.`,
      });
    }
    const probed = await probeOllamaModel({
      baseUrl: env.MAILCHECK_AI_URL?.trim() || defaultOllamaUrl,
      model: parsed.data.model,
      fetchImpl: options.fetchImpl,
    });
    if (probed === 'unreachable') {
      throw new PublicError(503, 'model_unreachable', {
        de: 'Der KI-Server antwortet nicht. Prüfe MAILCHECK_AI_URL.',
        en: 'The AI server does not answer. Check MAILCHECK_AI_URL.',
      });
    }
    if (probed === 'missing') {
      throw new PublicError(404, 'model_missing', {
        de: `Das Modell ${parsed.data.model} liegt auf dem KI-Server nicht vor. Lade es dort mit ollama pull ${parsed.data.model}.`,
        en: `The model ${parsed.data.model} is not present on the AI server. Pull it there with ollama pull ${parsed.data.model}.`,
      });
    }
    if (!options.database) {
      throw new PublicError(503, 'database_down', publicErrors.databaseDown);
    }
    try {
      await saveConfigValue(options.database, 'MAILCHECK_AI_MODEL', parsed.data.model);
    } catch (error) {
      throw new PublicError(500, 'config_save_failed', {
        de: `Das Modell konnte nicht gespeichert werden: ${error instanceof Error ? error.message : 'unbekannt'}.`,
        en: `The model could not be saved: ${error instanceof Error ? error.message : 'unknown'}.`,
      });
    }
    env.MAILCHECK_AI_MODEL = parsed.data.model;
    await writeActivity(options.database, {
      actor: actor.email,
      kind: 'mail',
      target: 'MAILCHECK_AI_MODEL',
      detail: parsed.data.model,
      ip: clientAddress(request),
    }).catch(() => undefined);
    return mailTestModelResultSchema.parse({
      model: parsed.data.model,
      textDe: `Das Modell ${parsed.data.model} ist erreichbar und wurde als Standard gespeichert.`,
      textEn: `The model ${parsed.data.model} is available and was saved as the default.`,
    });
  });

  app.post('/api/v1/admin/mail-test/active', async (request) => {
    const actor = await administrator(request, true);
    const parsed = mailTestActiveRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new PublicError(400, 'invalid_input', {
        de: 'Der Schalter für den automatischen Mailcheck ist ungültig.',
        en: 'The automatic mail check switch is invalid.',
      });
    }
    if (!options.database) {
      throw new PublicError(503, 'database_down', publicErrors.databaseDown);
    }
    const stored = parsed.data.active ? 'on' : 'off';
    try {
      await saveConfigValue(options.database, 'MAILCHECK_AI_ACTIVE', stored);
    } catch (error) {
      throw new PublicError(500, 'config_save_failed', {
        de: `MAILCHECK_AI_ACTIVE konnte nicht gespeichert werden: ${error instanceof Error ? error.message : 'unbekannt'}.`,
        en: `MAILCHECK_AI_ACTIVE could not be saved: ${error instanceof Error ? error.message : 'unknown'}.`,
      });
    }
    env.MAILCHECK_AI_ACTIVE = stored;
    await writeActivity(options.database, {
      actor: actor.email,
      kind: 'mail',
      target: 'MAILCHECK_AI_ACTIVE',
      detail: stored,
      ip: clientAddress(request),
    }).catch(() => undefined);
    return mailTestActiveResultSchema.parse({
      active: parsed.data.active,
      textDe: parsed.data.active
        ? 'Automatischer Mailcheck ist aktiv.'
        : 'Automatischer Mailcheck ist aus. Der Worker stoppt vor der nächsten Mail.',
      textEn: parsed.data.active
        ? 'Automatic mail check is on.'
        : 'Automatic mail check is off. The worker stops before the next mail.',
    });
  });

  app.get('/api/v1/admin/mailbox', async (request) => {
    await administrator(request, false);
    const box = mailbox();
    if (!box.configured) {
      throw new PublicError(503, 'mailbox_not_configured', publicErrors.mailboxNotConfigured);
    }
    try {
      const listed = await box.listInbox(inboxListCap);
      return mailboxListSchema.parse({
        truncated: listed.truncated,
        messages: listed.messages.map(messageRow),
      });
    } catch {
      throw new PublicError(503, 'mailbox_unavailable', publicErrors.mailboxUnavailable);
    }
  });

  app.get('/api/v1/admin/mailbox/message', async (request) => {
    await administrator(request, false);
    const id = readId(request.query);
    try {
      const mail = await findInInbox(mailbox(), id);
      return mailboxMessageSchema.parse(messageView(mail));
    } catch (error) {
      if (error instanceof PublicError) throw error;
      throw new PublicError(503, 'mailbox_unavailable', publicErrors.mailboxUnavailable);
    }
  });

  app.post('/api/v1/admin/mailbox/read', async (request) => {
    const actor = await administrator(request, true);
    const parsed = mailboxReadSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const box = mailbox();
    if (!box.configured) {
      throw new PublicError(503, 'mailbox_not_configured', publicErrors.mailboxNotConfigured);
    }
    try {
      await box.setRead(parsed.data.graphId, !parsed.data.unread);
    } catch {
      throw new PublicError(503, 'mailbox_unavailable', publicErrors.mailboxUnavailable);
    }
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
    body: maskPersonalData(mail.body).slice(0, mailcheckInputMax),
    unread: mail.unread,
  };
}

function messageView(mail: InboundMail) {
  return { ...messageRow(mail), source: formatMailSource(mail) };
}

async function findInInbox(box: Mailbox, graphId: string): Promise<InboundMail> {
  if (!box.configured) {
    throw new PublicError(503, 'mailbox_not_configured', publicErrors.mailboxNotConfigured);
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

function mailTestInputError(error: ZodError): PublicError {
  const issue = error.issues[0];
  const path = issue?.path?.[0];
  if (path === 'email' && issue?.code === 'too_big') {
    return new PublicError(400, 'email_too_big', {
      de: `Die E-Mail ist zu lang (höchstens ${mailTestEmailMax} Zeichen). Kürze den Text oder entferne Anhänge aus dem Einfügen.`,
      en: `The email is too long (at most ${mailTestEmailMax} characters). Shorten the text or remove attachments from the paste.`,
    });
  }
  if (path === 'prompt' && issue?.code === 'too_big') {
    return new PublicError(400, 'prompt_too_big', {
      de: `Der Abfragetext ist zu lang (höchstens ${mailTestPromptMax} Zeichen).`,
      en: `The query text is too long (at most ${mailTestPromptMax} characters).`,
    });
  }
  if (path === 'model') {
    return new PublicError(400, 'invalid_input', {
      de: 'Das gewählte Modell ist ungültig.',
      en: 'The selected model is invalid.',
    });
  }
  return new PublicError(400, 'invalid_input', {
    de: 'Die Eingabe für den KI-Mailtest ist ungültig. Prüfe Abfragetext, E-Mail und Modell.',
    en: 'The model mail test input is invalid. Check the query text, email and model.',
  });
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
  const priority =
    result.kind === 'support'
      ? result.priority
        ? `, ${result.priority.toUpperCase()}`
        : ', P4'
      : result.priority
        ? `, ${result.priority.toUpperCase()}`
        : '';
  return {
    textDe: `Ergebnis: ${result.kind}${category}${priority}.`,
    textEn: `Result: ${result.kind}${categoryEn}${priority}.`,
  };
}

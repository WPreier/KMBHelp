import { enqueueFileLog } from './file-log.js';

export type OutboundMail = {
  to: string;
  subject: string;
  text: string;
  attachments?: { name: string; contentType: string; contentBase64: string }[];
};

export type Mailer = {
  readonly configured: boolean;
  send(mail: OutboundMail): Promise<void>;
  deliver?(mail: OutboundMail): Promise<void>;
};

export type CalendarWindow = { start: string; end: string };

export type CalendarReader = {
  readonly configured: boolean;
  availability(email: string, at: Date): Promise<CalendarWindow[]>;
};

export type InboundMail = {
  graphId: string;
  internetMessageId: string;
  subject: string;
  body: string;
  fromEmail: string;
  fromName: string;
  unread: boolean;
  to?: string;
  cc?: string;
  sentAt?: string;
  inReplyTo?: string;
  references?: string;
};

export const inboxListCap = 500;

export type InboxList = {
  messages: InboundMail[];
  truncated: boolean;
};

export type Mailbox = {
  readonly configured: boolean;
  listUnread(limit: number): Promise<InboundMail[]>;
  listInbox(limit: number): Promise<InboxList>;
  /** Full message body; list responses from Graph can truncate the text. */
  readMessage(graphId: string): Promise<InboundMail | null>;
  markRead(graphId: string): Promise<void>;
  setRead(graphId: string, isRead: boolean): Promise<void>;
  moveToInboxChild(graphId: string, folderName: string): Promise<void>;
  /** Original MIME including attachments, or null when Graph cannot deliver it. */
  rawMime(graphId: string): Promise<Uint8Array | null>;
};

export type CalendarDraft = {
  subject: string;
  body: string;
  start: string;
  end: string;
};

export type CalendarWriter = {
  readonly configured: boolean;
  createEvent(email: string, event: CalendarDraft): Promise<{ id: string }>;
};

type GraphFetch = typeof fetch;

type GraphEnv = {
  mailbox: string;
  tenant: string;
  clientId: string;
  secret: string;
};

function graphEnv(env: NodeJS.ProcessEnv): GraphEnv | null {
  const mailbox = env.GRAPH_MAILBOX?.trim() ?? '';
  const tenant = env.GRAPH_TENANT_ID?.trim() ?? '';
  const clientId = env.GRAPH_CLIENT_ID?.trim() ?? '';
  const secret = env.GRAPH_CLIENT_SECRET ?? '';
  if (!mailbox.includes('@') || tenant === '' || clientId === '' || secret.trim() === '') {
    return null;
  }
  return { mailbox, tenant, clientId, secret };
}

async function accessToken(config: GraphEnv, fetchImpl: GraphFetch): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.secret,
    scope: 'https://graph.microsoft.com/.default',
  });
  const response = await fetchImpl(
    `https://login.microsoftonline.com/${encodeURIComponent(config.tenant)}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body },
  );
  if (!response.ok) throw new Error('graph token failed');
  const parsed: unknown = await response.json();
  const token =
    parsed && typeof parsed === 'object' && 'access_token' in parsed ? parsed.access_token : '';
  if (typeof token !== 'string' || token === '') throw new Error('graph token failed');
  return token;
}

export function mailerFromEnv(env: NodeJS.ProcessEnv, fetchImpl: GraphFetch = fetch): Mailer {
  const config = graphEnv(env);
  return {
    configured: config !== null,
    async send(mail) {
      if (!config) throw new Error('mail not configured');
      const started = Date.now();
      const detail = `an=${oneLine(mail.to)} betreff=${oneLine(mail.subject)}`;
      let token: string;
      try {
        token = await accessToken(config, fetchImpl);
      } catch (error) {
        mailboxAccess(config.mailbox, 'entwurf', 'fehler', detail, Date.now() - started);
        throw error;
      }
      const response = await fetchImpl(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.mailbox)}/mailFolders/drafts/messages`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            subject: mail.subject,
            body: { contentType: 'Text', content: mail.text },
            from: { emailAddress: { address: config.mailbox } },
            toRecipients: [{ emailAddress: { address: mail.to } }],
            ...((mail.attachments ?? []).length > 0
              ? {
                  attachments: (mail.attachments ?? []).map((file) => ({
                    '@odata.type': '#microsoft.graph.fileAttachment',
                    name: file.name,
                    contentType: file.contentType,
                    contentBytes: file.contentBase64,
                  })),
                }
              : {}),
          }),
        },
      );
      mailboxAccess(
        config.mailbox,
        'entwurf',
        response.ok ? 'ok' : 'fehler',
        `${detail} http=${response.status}`,
        Date.now() - started,
      );
      if (!response.ok) throw new Error('graph draft failed');
      const created: unknown = await response.json().catch(() => null);
      if (
        created &&
        typeof created === 'object' &&
        'isDraft' in created &&
        created.isDraft === false
      ) {
        throw new Error('graph draft failed');
      }
    },
    async deliver(mail) {
      if (!config) throw new Error('mail not configured');
      const started = Date.now();
      const detail = `an=${oneLine(mail.to)} betreff=${oneLine(mail.subject)}`;
      let token: string;
      try {
        token = await accessToken(config, fetchImpl);
      } catch (error) {
        mailboxAccess(config.mailbox, 'versand', 'fehler', detail, Date.now() - started);
        throw error;
      }
      const response = await fetchImpl(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.mailbox)}/sendMail`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            message: {
              subject: mail.subject,
              body: { contentType: 'Text', content: mail.text },
              toRecipients: [{ emailAddress: { address: mail.to } }],
            },
            saveToSentItems: true,
          }),
        },
      );
      mailboxAccess(
        config.mailbox,
        'versand',
        response.ok ? 'ok' : 'fehler',
        `${detail} http=${response.status}`,
        Date.now() - started,
      );
      if (!response.ok) throw new Error('graph send failed');
    },
  };
}

export function calendarFromEnv(
  env: NodeJS.ProcessEnv,
  fetchImpl: GraphFetch = fetch,
): CalendarReader {
  const config = graphEnv(env);
  return {
    configured: config !== null,
    async availability(email, at) {
      if (!config) return [];
      const started = Date.now();
      const detail = `kalender=${oneLine(email)}`;
      let token: string;
      try {
        token = await accessToken(config, fetchImpl);
      } catch (error) {
        mailboxAccess(config.mailbox, 'kalender', 'fehler', detail, Date.now() - started);
        throw error;
      }
      const start = new Date(at.getTime() - (at.getTime() % 86_400_000));
      const end = new Date(start.getTime() + 7 * 86_400_000);
      const response = await fetchImpl(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.mailbox)}/calendar/getSchedule`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            schedules: [email],
            startTime: { dateTime: start.toISOString(), timeZone: 'UTC' },
            endTime: { dateTime: end.toISOString(), timeZone: 'UTC' },
            availabilityViewInterval: 30,
          }),
        },
      );
      mailboxAccess(
        config.mailbox,
        'kalender',
        response.ok ? 'ok' : 'fehler',
        `${detail} http=${response.status}`,
        Date.now() - started,
      );
      if (!response.ok) throw new Error('graph calendar failed');
      const parsed: unknown = await response.json();
      return windowsFromSchedule(parsed);
    },
  };
}

function windowsFromSchedule(body: unknown): CalendarWindow[] {
  if (!body || typeof body !== 'object' || !('value' in body) || !Array.isArray(body.value)) {
    return [];
  }
  const windows: CalendarWindow[] = [];
  for (const schedule of body.value) {
    if (!schedule || typeof schedule !== 'object' || !('scheduleItems' in schedule)) continue;
    const items = schedule.scheduleItems;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const status = 'status' in item ? item.status : '';
      if (status === 'free') continue;
      const start = item && 'start' in item ? dateTimeOf(item.start) : '';
      const end = item && 'end' in item ? dateTimeOf(item.end) : '';
      if (start && end) windows.push({ start, end });
    }
  }
  return windows;
}

function dateTimeOf(value: unknown): string {
  if (!value || typeof value !== 'object' || !('dateTime' in value)) return '';
  const raw = value.dateTime;
  if (typeof raw !== 'string' || raw.trim() === '') return '';
  const trimmed = raw.trim().replace(/(\.\d{3})\d+/u, '$1');
  if (/[zZ]$|[+-]\d{2}:\d{2}$/u.test(trimmed)) return trimmed;
  const zone = 'timeZone' in value ? value.timeZone : '';
  return zone === 'UTC' ? `${trimmed}Z` : trimmed;
}

export function mailboxFromEnv(env: NodeJS.ProcessEnv, fetchImpl: GraphFetch = fetch): Mailbox {
  const config = graphEnv(env);
  return {
    configured: config !== null,
    async listUnread(limit) {
      const listed = await listFolder(config, fetchImpl, { limit, unreadOnly: true });
      const messages: InboundMail[] = [];
      for (const mail of listed.messages) {
        const full = await readMessage(config, fetchImpl, mail.graphId);
        messages.push(full ?? mail);
      }
      return messages;
    },
    listInbox(limit) {
      return listFolder(config, fetchImpl, { limit, unreadOnly: false });
    },
    readMessage(graphId) {
      return readMessage(config, fetchImpl, graphId);
    },
    markRead(graphId) {
      return changeRead(config, fetchImpl, graphId, true);
    },
    setRead(graphId, isRead) {
      return changeRead(config, fetchImpl, graphId, isRead);
    },
    moveToInboxChild(graphId, folderName) {
      return moveToChild(config, fetchImpl, graphId, folderName);
    },
    rawMime(graphId) {
      return readRawMime(config, fetchImpl, graphId);
    },
  };
}

async function readRawMime(
  config: GraphEnv | null,
  fetchImpl: GraphFetch,
  graphId: string,
): Promise<Uint8Array | null> {
  if (!config || graphId.trim() === '' || graphId === 'pasted') return null;
  const started = Date.now();
  const detail = `id=${oneLine(graphId)}`;
  try {
    const token = await accessToken(config, fetchImpl);
    const response = await fetchImpl(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.mailbox)}/messages/${encodeURIComponent(graphId)}/$value`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    mailboxAccess(
      config.mailbox,
      'mime',
      response.ok ? 'ok' : 'fehler',
      `${detail} http=${response.status}`,
      Date.now() - started,
    );
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length > 0 ? bytes : null;
  } catch {
    mailboxAccess(config.mailbox, 'mime', 'fehler', detail, Date.now() - started);
    return null;
  }
}

const ticketFolderIds = new Map<string, string>();

async function moveToChild(
  config: GraphEnv | null,
  fetchImpl: GraphFetch,
  graphId: string,
  folderName: string,
): Promise<void> {
  if (!config) throw new Error('mail not configured');
  const started = Date.now();
  const detail = `ordner=${oneLine(folderName)} id=${oneLine(graphId)}`;
  let token: string;
  try {
    token = await accessToken(config, fetchImpl);
    const destinationId = await inboxChildId(config, fetchImpl, token, folderName);
    const response = await fetchImpl(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.mailbox)}/messages/${encodeURIComponent(graphId)}/move`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ destinationId }),
      },
    );
    mailboxAccess(
      config.mailbox,
      'verschoben',
      response.ok ? 'ok' : 'fehler',
      `${detail} http=${response.status}`,
      Date.now() - started,
    );
    if (!response.ok) throw new Error('graph move failed');
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'graph move failed') {
      mailboxAccess(config.mailbox, 'verschoben', 'fehler', detail, Date.now() - started);
    }
    throw error;
  }
}

async function inboxChildId(
  config: GraphEnv,
  fetchImpl: GraphFetch,
  token: string,
  folderName: string,
): Promise<string> {
  const cacheKey = `${config.mailbox}\n${folderName}`;
  const cached = ticketFolderIds.get(cacheKey);
  if (cached) return cached;
  const listed = await fetchImpl(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.mailbox)}/mailFolders/inbox/childFolders?$filter=${encodeURIComponent(`displayName eq '${folderName.replace(/'/gu, "''")}'`)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!listed.ok) throw new Error('graph folder failed');
  const body: unknown = await listed.json();
  const existing = folderId(body);
  if (existing) {
    ticketFolderIds.set(cacheKey, existing);
    return existing;
  }
  const created = await fetchImpl(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.mailbox)}/mailFolders/inbox/childFolders`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: folderName }),
    },
  );
  if (!created.ok) throw new Error('graph folder failed');
  const made: unknown = await created.json();
  const id = folderId(made);
  if (!id) throw new Error('graph folder failed');
  ticketFolderIds.set(cacheKey, id);
  return id;
}

function folderId(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  if ('id' in body && typeof body.id === 'string') return body.id;
  if (!('value' in body) || !Array.isArray(body.value)) return '';
  const first = body.value[0];
  if (!first || typeof first !== 'object' || !('id' in first) || typeof first.id !== 'string') {
    return '';
  }
  return first.id;
}

async function changeRead(
  config: GraphEnv | null,
  fetchImpl: GraphFetch,
  graphId: string,
  isRead: boolean,
): Promise<void> {
  if (!config) throw new Error('mail not configured');
  const started = Date.now();
  const action = isRead ? 'gelesen' : 'ungelesen';
  const detail = `id=${oneLine(graphId)}`;
  let token: string;
  try {
    token = await accessToken(config, fetchImpl);
  } catch (error) {
    mailboxAccess(config.mailbox, action, 'fehler', detail, Date.now() - started);
    throw error;
  }
  const response = await fetchImpl(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.mailbox)}/messages/${encodeURIComponent(graphId)}`,
    {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ isRead }),
    },
  );
  mailboxAccess(
    config.mailbox,
    action,
    response.ok ? 'ok' : 'fehler',
    `${detail} http=${response.status}`,
    Date.now() - started,
  );
  if (!response.ok) throw new Error('graph read failed');
}

const messageSelect =
  'id,isRead,internetMessageId,subject,body,from,toRecipients,ccRecipients,receivedDateTime,internetMessageHeaders';

async function readMessage(
  config: GraphEnv | null,
  fetchImpl: GraphFetch,
  graphId: string,
): Promise<InboundMail | null> {
  if (!config || graphId.trim() === '' || graphId === 'pasted') return null;
  const started = Date.now();
  const detail = `id=${oneLine(graphId)}`;
  try {
    const token = await accessToken(config, fetchImpl);
    const response = await fetchImpl(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.mailbox)}/messages/${encodeURIComponent(graphId)}?$select=${encodeURIComponent(messageSelect)}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          Prefer: 'outlook.body-content-type="text"',
        },
      },
    );
    mailboxAccess(
      config.mailbox,
      'nachricht',
      response.ok ? 'ok' : 'fehler',
      `${detail} http=${response.status}`,
      Date.now() - started,
    );
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return parseInboundMessages({ value: [body] })[0] ?? null;
  } catch {
    mailboxAccess(config.mailbox, 'nachricht', 'fehler', detail, Date.now() - started);
    return null;
  }
}

async function listFolder(
  config: GraphEnv | null,
  fetchImpl: GraphFetch,
  options: { limit: number; unreadOnly: boolean },
): Promise<InboxList> {
  if (!config) return { messages: [], truncated: false };
  const started = Date.now();
  const label = options.unreadOnly ? 'ungelesen' : 'posteingang';
  let token: string;
  try {
    token = await accessToken(config, fetchImpl);
  } catch (error) {
    mailboxAccess(config.mailbox, 'posteingang', 'fehler', label, Date.now() - started);
    throw error;
  }
  const ceiling = options.unreadOnly ? 200 : inboxListCap;
  const cap = Math.min(Math.max(options.limit, 1), ceiling);
  const query = [
    options.unreadOnly
      ? '$filter=' + encodeURIComponent('isRead eq false')
      : '$orderby=' + encodeURIComponent('receivedDateTime desc'),
    `$top=${Math.min(cap, 50)}`,
    '$select=' + encodeURIComponent(messageSelect),
  ].join('&');
  let next = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.mailbox)}/mailFolders/inbox/messages?${query}`;
  const mails: InboundMail[] = [];
  let status = 0;
  while (next !== '' && mails.length < cap) {
    const response = await fetchImpl(next, {
      headers: {
        authorization: `Bearer ${token}`,
        Prefer: 'outlook.body-content-type="text"',
      },
    });
    status = response.status;
    if (!response.ok) {
      mailboxAccess(
        config.mailbox,
        'posteingang',
        'fehler',
        `${label} http=${response.status}`,
        Date.now() - started,
      );
      throw new Error('graph list failed');
    }
    const body: unknown = await response.json();
    mails.push(...parseInboundMessages(body));
    next = nextPage(body);
  }
  const truncated = mails.length > cap || next !== '';
  const shown = mails.slice(0, cap);
  mailboxAccess(
    config.mailbox,
    'posteingang',
    'ok',
    `${label} anzahl=${shown.length} http=${status}`,
    Date.now() - started,
  );
  return { messages: shown, truncated };
}

function nextPage(body: unknown): string {
  if (!body || typeof body !== 'object' || !('@odata.nextLink' in body)) return '';
  const link = body['@odata.nextLink'];
  return typeof link === 'string' && link.startsWith('https://graph.microsoft.com/') ? link : '';
}

function mailboxAccess(
  mailbox: string,
  action: string,
  outcome: 'ok' | 'fehler',
  detail: string,
  ms: number,
): void {
  enqueueFileLog(
    'mail',
    `${new Date().toISOString()}\tgraph\t${action}\t${oneLine(mailbox)}\t${outcome} ${ms}ms ${oneLine(detail)}`,
  );
}

function oneLine(value: string): string {
  return value.replace(/[\r\n\t]/gu, ' ').slice(0, 180);
}

export function calendarWriterFromEnv(
  env: NodeJS.ProcessEnv,
  fetchImpl: GraphFetch = fetch,
): CalendarWriter {
  const config = graphEnv(env);
  return {
    configured: config !== null,
    async createEvent(email, event) {
      if (!config) throw new Error('mail not configured');
      const token = await accessToken(config, fetchImpl);
      const response = await fetchImpl(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/events`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            subject: event.subject,
            body: { contentType: 'Text', content: event.body },
            start: { dateTime: event.start, timeZone: 'UTC' },
            end: { dateTime: event.end, timeZone: 'UTC' },
          }),
        },
      );
      if (!response.ok) throw new Error('graph event failed');
      const parsed: unknown = await response.json();
      const id = parsed && typeof parsed === 'object' && 'id' in parsed ? parsed.id : '';
      if (typeof id !== 'string' || id === '') throw new Error('graph event failed');
      return { id };
    },
  };
}

export function parseInboundMessages(body: unknown): InboundMail[] {
  if (!body || typeof body !== 'object' || !('value' in body) || !Array.isArray(body.value)) {
    return [];
  }
  const mails: InboundMail[] = [];
  for (const item of body.value) {
    if (!item || typeof item !== 'object') continue;
    const graphId = stringField(item, 'id');
    if (!graphId) continue;
    const content = item && 'body' in item ? item.body : undefined;
    const contentType =
      content && typeof content === 'object' && 'contentType' in content
        ? stringValue(content.contentType)
        : '';
    const contentText =
      content && typeof content === 'object' && 'content' in content
        ? stringValue(content.content)
        : '';
    const from =
      item && 'from' in item && item.from && typeof item.from === 'object' ? item.from : undefined;
    const address =
      from && 'emailAddress' in from && from.emailAddress && typeof from.emailAddress === 'object'
        ? from.emailAddress
        : undefined;
    mails.push({
      graphId,
      internetMessageId: stringField(item, 'internetMessageId'),
      subject: stringField(item, 'subject').slice(0, 500),
      body: plainText(contentText, contentType).slice(0, 20_000),
      unread: !('isRead' in item && item.isRead === true),
      fromEmail:
        address && 'address' in address ? stringValue(address.address).trim().toLowerCase() : '',
      fromName: address && 'name' in address ? stringValue(address.name).slice(0, 200) : '',
      to: recipientList(item, 'toRecipients'),
      cc: recipientList(item, 'ccRecipients'),
      sentAt: stringField(item, 'receivedDateTime').slice(0, 40),
      inReplyTo: headerValue(item, 'In-Reply-To'),
      references: headerValue(item, 'References'),
    });
  }
  return mails;
}

function recipientList(item: object, key: 'toRecipients' | 'ccRecipients'): string {
  const value = (item as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return '';
  const addresses: string[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || !('emailAddress' in entry)) continue;
    const email = entry.emailAddress;
    if (!email || typeof email !== 'object' || !('address' in email)) continue;
    const address = stringValue(email.address).trim().toLowerCase();
    if (address) addresses.push(address);
  }
  return addresses.join(', ').slice(0, 500);
}

function headerValue(item: object, name: string): string {
  if (!('internetMessageHeaders' in item) || !Array.isArray(item.internetMessageHeaders)) return '';
  const wanted = name.toLowerCase();
  for (const header of item.internetMessageHeaders) {
    if (!header || typeof header !== 'object' || !('name' in header)) continue;
    if (stringValue(header.name).toLowerCase() !== wanted) continue;
    return 'value' in header ? stringValue(header.value).slice(0, 500) : '';
  }
  return '';
}

function stringField(value: object, key: string): string {
  return key in value ? stringValue(value[key as keyof typeof value]) : '';
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function plainText(content: string, contentType: string): string {
  const trimmed = content.trim();
  if (trimmed === '') return '';
  if (contentType.toLowerCase() !== 'html') return trimmed;
  return trimmed
    .replace(/<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/\s+/gu, ' ')
    .trim();
}

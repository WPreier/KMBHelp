export type OutboundMail = {
  to: string;
  subject: string;
  text: string;
  attachments?: { name: string; contentType: string; content: string }[];
};

export type Mailer = {
  readonly configured: boolean;
  send(mail: OutboundMail): Promise<void>;
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
};

export type Mailbox = {
  readonly configured: boolean;
  listUnread(limit: number): Promise<InboundMail[]>;
  markRead(graphId: string): Promise<void>;
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
      const token = await accessToken(config, fetchImpl);
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
                    contentBytes: Buffer.from(file.content, 'utf8').toString('base64'),
                  })),
                }
              : {}),
          }),
        },
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
      const token = await accessToken(config, fetchImpl);
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
      if (!config) return [];
      const token = await accessToken(config, fetchImpl);
      const query = [
        '$filter=' + encodeURIComponent('isRead eq false'),
        `$top=${Math.min(Math.max(limit, 1), 25)}`,
        '$select=' + encodeURIComponent('id,internetMessageId,subject,body,from'),
      ].join('&');
      const response = await fetchImpl(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.mailbox)}/mailFolders/inbox/messages?${query}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error('graph list failed');
      return parseInboundMessages(await response.json());
    },
    async markRead(graphId) {
      if (!config) throw new Error('mail not configured');
      const token = await accessToken(config, fetchImpl);
      const response = await fetchImpl(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.mailbox)}/messages/${encodeURIComponent(graphId)}`,
        {
          method: 'PATCH',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ isRead: true }),
        },
      );
      if (!response.ok) throw new Error('graph read failed');
    },
  };
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
      fromEmail:
        address && 'address' in address ? stringValue(address.address).trim().toLowerCase() : '',
      fromName: address && 'name' in address ? stringValue(address.name).slice(0, 200) : '',
    });
  }
  return mails;
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

export type OutboundMail = {
  to: string;
  subject: string;
  text: string;
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

async function accessToken(config: GraphEnv): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.secret,
    scope: 'https://graph.microsoft.com/.default',
  });
  const response = await fetch(
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

export function mailerFromEnv(env: NodeJS.ProcessEnv): Mailer {
  const config = graphEnv(env);
  return {
    configured: config !== null,
    async send(mail) {
      if (!config) throw new Error('mail not configured');
      const token = await accessToken(config);
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.mailbox)}/sendMail`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            message: {
              subject: mail.subject,
              body: { contentType: 'Text', content: mail.text },
              from: { emailAddress: { address: config.mailbox } },
              toRecipients: [{ emailAddress: { address: mail.to } }],
            },
            saveToSentItems: true,
          }),
        },
      );
      if (!response.ok) throw new Error('graph send failed');
    },
  };
}

export function calendarFromEnv(env: NodeJS.ProcessEnv): CalendarReader {
  const config = graphEnv(env);
  return {
    configured: config !== null,
    async availability(email, at) {
      if (!config) return [];
      const token = await accessToken(config);
      const start = new Date(at.getTime() - (at.getTime() % 86_400_000));
      const end = new Date(start.getTime() + 7 * 86_400_000);
      const response = await fetch(
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
  return typeof value.dateTime === 'string' ? value.dateTime : '';
}

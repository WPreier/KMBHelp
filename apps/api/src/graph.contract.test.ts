import { describe, expect, it } from 'vitest';
import {
  calendarFromEnv,
  calendarWriterFromEnv,
  mailboxFromEnv,
  mailerFromEnv,
  parseInboundMessages,
} from './graph.js';

const recordedList = {
  value: [
    {
      id: 'AAMkAGI2',
      internetMessageId: '<recorded@example.com>',
      subject: 'Drucker im Erdgeschoss',
      body: { contentType: 'Text', content: 'Der Drucker klemmt.' },
      from: { emailAddress: { address: 'sender@example.com', name: 'Sender' } },
    },
  ],
};

const recordedDraft = {
  subject: 'Ticket 12',
  body: { contentType: 'Text', content: 'Ticket 12\n' },
  from: { emailAddress: { address: 'helpdesk@kmbcloud.at' } },
  toRecipients: [{ emailAddress: { address: 'sender@example.com' } }],
};

const recordedScheduleRequest = {
  schedules: ['ada@example.com'],
  startTime: { dateTime: '2026-10-27T00:00:00.000Z', timeZone: 'UTC' },
  endTime: { dateTime: '2026-11-03T00:00:00.000Z', timeZone: 'UTC' },
  availabilityViewInterval: 30,
};

const recordedSchedule = {
  value: [
    {
      scheduleItems: [
        {
          status: 'busy',
          start: { dateTime: '2026-10-27T09:00:00.0000000', timeZone: 'UTC' },
          end: { dateTime: '2026-10-27T10:00:00.0000000', timeZone: 'UTC' },
        },
        {
          status: 'free',
          start: { dateTime: '2026-10-27T10:00:00.0000000', timeZone: 'UTC' },
          end: { dateTime: '2026-10-27T11:00:00.0000000', timeZone: 'UTC' },
        },
      ],
    },
  ],
};

const recordedEvent = {
  subject: 'Ticket 12 Drucker',
  body: { contentType: 'Text', content: 'Papierstau' },
  start: { dateTime: '2026-10-27T09:00:00.000Z', timeZone: 'UTC' },
  end: { dateTime: '2026-10-27T09:30:00.000Z', timeZone: 'UTC' },
};

const env = {
  GRAPH_TENANT_ID: 'tenant',
  GRAPH_CLIENT_ID: 'client',
  GRAPH_CLIENT_SECRET: 'contract-secret',
  GRAPH_MAILBOX: 'helpdesk@kmbcloud.at',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('graph contract payloads', () => {
  it('reads, answers and books from recorded payloads, not a live tenant', async () => {
    const calls: { url: string; method: string; body: string }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? init.body : '';
      calls.push({ url, method, body });
      if (url.includes('/oauth2/v2.0/token')) return json({ access_token: 'token' });
      if (url.includes('/messages?')) return json(recordedList);
      if (url.endsWith('/mailFolders/drafts/messages')) {
        return json({ id: 'draft-1', isDraft: true }, 201);
      }
      if (url.endsWith('/sendMail')) return new Response(null, { status: 202 });
      if (url.endsWith('/getSchedule')) return json(recordedSchedule);
      if (url.endsWith('/events')) return json({ id: 'event-1' });
      return new Response('missing', { status: 404 });
    };

    const mailbox = mailboxFromEnv(env, fetchImpl);
    const mails = await mailbox.listUnread(25);
    expect(mails).toEqual([
      {
        graphId: 'AAMkAGI2',
        internetMessageId: '<recorded@example.com>',
        subject: 'Drucker im Erdgeschoss',
        body: 'Der Drucker klemmt.',
        fromEmail: 'sender@example.com',
        fromName: 'Sender',
        to: '',
        cc: '',
        sentAt: '',
        inReplyTo: '',
        references: '',
      },
    ]);
    expect(parseInboundMessages(recordedList)[0]?.fromEmail).toBe('sender@example.com');

    await mailerFromEnv(env, fetchImpl).send({
      to: 'sender@example.com',
      subject: 'Ticket 12',
      text: 'Ticket 12\n',
    });
    const drafted = calls.find((call) => call.url.endsWith('/mailFolders/drafts/messages'));
    expect(drafted?.method).toBe('POST');
    expect(JSON.parse(drafted?.body ?? '{}')).toEqual(recordedDraft);
    expect(calls.some((call) => call.url.endsWith('/sendMail'))).toBe(false);
    await mailerFromEnv(env, fetchImpl).deliver?.({
      to: 'helpdesk@ppc.at',
      subject: 'KMBHelp: Die KI-Prüfung hat zu lange gedauert',
      text: 'Limit\n',
    });
    expect(calls.some((call) => call.url.endsWith('/sendMail') && call.method === 'POST')).toBe(
      true,
    );

    const at = new Date('2026-10-27T08:15:00.000Z');
    const windows = await calendarFromEnv(env, fetchImpl).availability('ada@example.com', at);
    expect(windows).toEqual([
      { start: '2026-10-27T09:00:00.000Z', end: '2026-10-27T10:00:00.000Z' },
    ]);
    const schedule = calls.find((call) => call.url.endsWith('/getSchedule'));
    expect(JSON.parse(schedule?.body ?? '{}')).toEqual(recordedScheduleRequest);

    const created = await calendarWriterFromEnv(env, fetchImpl).createEvent('ada@example.com', {
      subject: 'Ticket 12 Drucker',
      body: 'Papierstau',
      start: '2026-10-27T09:00:00.000Z',
      end: '2026-10-27T09:30:00.000Z',
    });
    expect(created).toEqual({ id: 'event-1' });
    const event = calls.find((call) => call.url.endsWith('/events'));
    expect(JSON.parse(event?.body ?? '{}')).toEqual(recordedEvent);
    expect(calls.some((call) => call.url.includes('login.microsoftonline.com'))).toBe(true);
    expect(
      calls.some(
        (call) => call.url.includes('graph.microsoft.com') && call.url.includes('example.tenant'),
      ),
    ).toBe(false);
  });
});

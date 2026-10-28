import { scriptedModel } from '@kmbhelp/ai';
import { describe, expect, it } from 'vitest';
import type { CalendarReader, CalendarWriter, Mailer } from './graph.js';
import { ingestMail } from './mail-cycle.js';
import type { MailCategory } from './mail-rules.js';
import type { MailStore, StoredMailTicket } from './mail-store.js';

const categories: MailCategory[] = [
  {
    code: 'elda',
    groupCode: 'payroll',
    labelDe: 'ELDA / SV-Meldung',
    labelEn: 'ELDA',
    defaultSkillCode: 'payroll',
  },
  {
    code: 'printer',
    groupCode: 'workplace',
    labelDe: 'Drucker',
    labelEn: 'Printer',
    defaultSkillCode: 'workplace',
  },
];

const people = [
  { id: 'ada', email: 'ada@example.com', displayName: 'Ada', skills: ['payroll'] },
  { id: 'bea', email: 'bea@example.com', displayName: 'Bea', skills: ['payroll', 'workplace'] },
];

function memoryStore(
  faqs: { slug: string; bodyDe: string }[] = [],
): MailStore & {
  tickets: StoredMailTicket[];
  events: { kind: string; payload: Record<string, unknown> }[];
  closed: string[];
} {
  const tickets: StoredMailTicket[] = [];
  const closed: string[] = [];
  const events: { id: string; ticketId: string; kind: string; payload: Record<string, unknown> }[] =
    [];
  let sequence = 1;
  const store: MailStore & {
    tickets: StoredMailTicket[];
    events: { kind: string; payload: Record<string, unknown> }[];
    closed: string[];
  } = {
    tickets,
    events,
    closed,
    categories: async () => categories,
    async candidates(skillCode) {
      return people
        .filter((person) => person.skills.includes(skillCode))
        .map(({ id, email, displayName }) => ({ id, email, displayName }));
    },
    async byMessageId(internetMessageId) {
      return tickets.find((ticket) => ticket.internetMessageId === internetMessageId) ?? null;
    },
    async insertTicket(values) {
      if (tickets.some((ticket) => ticket.internetMessageId === values.internetMessageId)) {
        return null;
      }
      const category = categories.find((item) => item.code === values.categoryCode);
      const row: StoredMailTicket = {
        id: `ticket-${sequence}`,
        number: sequence,
        internetMessageId: values.internetMessageId,
        assignedStaffId: values.assignedStaffId,
        assigneeEmail: null,
        requesterEmail: values.requesterEmail,
        requesterName: values.requesterName,
        subject: values.subject,
        categoryLabel: category?.labelDe ?? values.categoryCode,
        body: values.body,
      };
      sequence += 1;
      tickets.push(row);
      return row;
    },
    async assign(ticketId, staffId) {
      const row = tickets.find((ticket) => ticket.id === ticketId);
      const person = people.find((candidate) => candidate.id === staffId);
      if (!row || !person) return;
      row.assignedStaffId = staffId;
      row.assigneeEmail = person.email;
    },
    async addEvent(ticketId, kind, payload) {
      const id = `event-${events.length + 1}`;
      events.push({ id, ticketId, kind, payload });
      return id;
    },
    async closeTicket(ticketId) {
      closed.push(ticketId);
    },
    publishedFaqs: async () => faqs,
    async hasEvent(ticketId, kind) {
      return events.some((event) => event.ticketId === ticketId && event.kind === kind);
    },
    activeStaffEmails: async () => people.map((person) => person.email),
    pendingReopens: async () => [],
    heartbeat: async () => undefined,
    lesson: async () => null,
    rememberLesson: async () => undefined,
    recentLessons: async () => [],
    ticketByNumber: async (number) => {
      const row = tickets.find((ticket) => ticket.number === number);
      if (!row) return null;
      return {
        id: row.id,
        number: row.number,
        status: closed.includes(row.id) ? 'closed' : 'open',
        requesterEmail: row.requesterEmail,
      };
    },
    setSatisfaction: async (ticketId, satisfaction, reply) => {
      events.push({
        id: `event-${events.length + 1}`,
        ticketId,
        kind: 'satisfaction',
        payload: { satisfaction, reply },
      });
    },
  };
  return store;
}

function doubles(): {
  mailer: Mailer & {
    sent: { to: string; subject: string; text: string; attachments?: { content: string }[] }[];
  };
  calendar: CalendarReader;
  writer: CalendarWriter & { events: { email: string; subject: string; body: string }[] };
} {
  return {
    mailer: {
      configured: true,
      sent: [],
      async send(mail) {
        this.sent.push(mail);
      },
    },
    calendar: {
      configured: true,
      async availability(email) {
        if (email === 'ada@example.com') {
          return [{ start: '2026-10-27T00:00:00.000Z', end: '2026-10-28T00:00:00.000Z' }];
        }
        return [];
      },
    },
    writer: {
      configured: true,
      events: [],
      async createEvent(email, event) {
        this.events.push({ email, subject: event.subject, body: event.body });
        return { id: 'event-1' };
      },
    },
  };
}

const supportDecision = {
  category: 'elda',
  priority: 'p3' as const,
  skill: 'payroll',
  confidence: 0.9,
  auto_reply_allowed: false,
  faq_slug: null,
  is_support: true,
};

const mail = {
  graphId: 'graph-1',
  internetMessageId: '<once@example.com>',
  subject: 'ELDA / SV-Meldung hängt',
  body: 'Die Meldung geht nicht raus.',
  fromEmail: 'sender@example.com',
  fromName: 'Sender',
};

describe('ingestMail', () => {
  it('creates one ticket, one reply and one calendar entry for the first free person', async () => {
    const store = memoryStore();
    const ports = doubles();
    const deps = {
      store,
      mailer: ports.mailer,
      calendar: ports.calendar,
      writer: ports.writer,
      now: new Date('2026-10-27T08:10:00.000Z'),
      origin: 'https://helpdesk.kmbcloud.at',
      fallbackCategory: 'printer',
      duration: 30,
      delays: { p1: 0, p2: 60, p3: 240 },
      oncallEmail: '',
      estimatedMinutes: null,
      domains: ['example.com'],
      model: scriptedModel({ decision: supportDecision, answer: 'JA\nEine Support-Anfrage.' }),
    };
    expect(await ingestMail(mail, deps)).toBe('created');
    expect(await ingestMail(mail, deps)).toBe('duplicate');
    expect(store.tickets).toHaveLength(1);
    expect(store.tickets[0]?.assignedStaffId).toBe('bea');
    expect(ports.mailer.sent).toHaveLength(2);
    expect(ports.mailer.sent[0]?.text).toContain('https://helpdesk.kmbcloud.at/?ticket=1');
    expect(ports.mailer.sent[1]?.to).toBe('bea@example.com');
    expect(ports.mailer.sent[1]?.attachments?.[0]?.content).toContain('ELDA');
    expect(ports.mailer.sent[0]?.text.toLowerCase()).not.toContain('token');
    expect(ports.writer.events).toEqual([
      expect.objectContaining({
        email: 'bea@example.com',
        subject: 'Neues Ticket ELDA / SV-Meldung hängt',
      }),
    ]);
    expect(ports.writer.events[0]?.body).toContain('/mitarbeit/ticket/1');
    expect(ports.writer.events[0]?.body).toContain('Die Meldung geht nicht raus.');
    expect(ports.writer.events[0]?.body).toContain('sender@example.com');
  });

  it('does not turn a mail without a sender into a ticket', async () => {
    const store = memoryStore();
    const ports = doubles();
    const result = await ingestMail(
      { ...mail, fromEmail: '', internetMessageId: '<missing@example.com>' },
      {
        store,
        mailer: ports.mailer,
        calendar: ports.calendar,
        writer: ports.writer,
        now: new Date('2026-10-27T08:10:00.000Z'),
        origin: 'https://helpdesk.kmbcloud.at',
        fallbackCategory: 'printer',
        duration: 30,
        delays: { p1: 0, p2: 60, p3: 240 },
        oncallEmail: '',
        estimatedMinutes: null,
      },
    );
    expect(result).toBe('skip');
    expect(store.tickets).toHaveLength(0);
  });

  it('leaves the mail untouched when the model is missing or does not answer', async () => {
    const store = memoryStore();
    const ports = doubles();
    const deps = {
      store,
      mailer: ports.mailer,
      calendar: ports.calendar,
      writer: ports.writer,
      now: new Date('2026-10-27T08:10:00.000Z'),
      origin: 'https://helpdesk.kmbcloud.at',
      fallbackCategory: 'printer',
      duration: 30,
      delays: { p1: 0, p2: 60, p3: 240 },
      oncallEmail: '',
      estimatedMinutes: null,
      domains: ['example.com'],
    };
    expect(await ingestMail(mail, deps)).toBe('retry');
    expect(
      await ingestMail(
        { ...mail, internetMessageId: '<silent@example.com>' },
        { ...deps, model: scriptedModel({ decision: null, answer: null }) },
      ),
    ).toBe('retry');
    expect(store.tickets).toHaveLength(0);
    expect(ports.mailer.sent).toHaveLength(0);
    expect(ports.writer.events).toHaveLength(0);
  });

  it('does not create a ticket when the model says the mail is not support', async () => {
    const store = memoryStore();
    const ports = doubles();
    const result = await ingestMail(mail, {
      store,
      mailer: ports.mailer,
      calendar: ports.calendar,
      writer: ports.writer,
      now: new Date('2026-10-27T08:10:00.000Z'),
      origin: 'https://helpdesk.kmbcloud.at',
      fallbackCategory: 'printer',
      duration: 30,
      delays: { p1: 0, p2: 60, p3: 240 },
      oncallEmail: '',
      estimatedMinutes: null,
      domains: ['example.com'],
      model: scriptedModel({
        decision: { ...supportDecision, is_support: false },
        answer: 'NEIN\nDas ist ein Newsletter.',
      }),
    });
    expect(result).toBe('declined');
    expect(store.tickets).toHaveLength(0);
    expect(ports.mailer.sent).toHaveLength(0);
  });

  it('closes from a published FAQ only when the model gate allows it', async () => {
    const store = memoryStore([{ slug: 'printer', bodyDe: 'Papier nachlegen und neu starten.' }]);
    const ports = doubles();
    const base = {
      store,
      mailer: ports.mailer,
      calendar: ports.calendar,
      writer: ports.writer,
      now: new Date('2026-10-27T08:10:00.000Z'),
      origin: 'https://helpdesk.kmbcloud.at',
      fallbackCategory: 'printer',
      duration: 30,
      delays: { p1: 0, p2: 60, p3: 240 } as const,
      oncallEmail: '',
      estimatedMinutes: null,
      autoReplyCategories: ['printer'],
      domains: ['example.com'],
    };
    const blocked = await ingestMail(
      { ...mail, internetMessageId: '<svnr@example.com>', body: 'SVNR 1234 010180' },
      {
        ...base,
        model: scriptedModel({
          decision: {
            category: 'printer',
            priority: 'p3',
            skill: 'workplace',
            confidence: 0.95,
            auto_reply_allowed: true,
            faq_slug: 'printer',
            is_support: true,
          },
          answer: 'JA\nEine Support-Anfrage.',
        }),
      },
    );
    expect(blocked).toBe('created');
    expect(store.closed).toHaveLength(0);
    expect(ports.mailer.sent[0]?.text).not.toContain('1234');

    ports.mailer.sent.length = 0;
    const closed = await ingestMail(
      {
        ...mail,
        internetMessageId: '<faq@example.com>',
        subject: 'Der Drucker klemmt',
        body: 'Es kommt kein Papier.',
      },
      {
        ...base,
        model: scriptedModel({
          decision: {
            category: 'printer',
            priority: 'p3',
            skill: 'workplace',
            confidence: 0.95,
            auto_reply_allowed: true,
            faq_slug: 'printer',
            is_support: true,
          },
          answer: 'JA\nEine Support-Anfrage.',
        }),
      },
    );
    expect(closed).toBe('created');
    expect(store.closed).toEqual(['ticket-2']);
    expect(ports.mailer.sent[0]?.text).toContain('Papier nachlegen');
    expect(ports.mailer.sent[0]?.text).not.toContain('Es kommt kein Papier');
    expect(store.events.some((event) => event.kind === 'model_decision')).toBe(true);
    const helpdesk = await ingestMail(
      { ...mail, fromEmail: 'helpdesk@example.com', internetMessageId: '<desk@example.com>' },
      {
        ...base,
        model: scriptedModel({
          answer: 'JA\nEine Support-Anfrage.',
          onReview: () => {
            throw new Error('helpdesk must not reach the model');
          },
        }),
      },
    );
    expect(helpdesk).toBe('declined');
    const recorded = store.events.find((event) => event.kind === 'model_decision');
    expect(JSON.stringify(recorded?.payload)).not.toContain('Papier');
  });
});

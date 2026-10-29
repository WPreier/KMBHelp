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

function memoryStore(faqs: { slug: string; bodyDe: string }[] = []): MailStore & {
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
    async ensureCategory(label) {
      const text = label.trim().slice(0, 80);
      const folded = text.toLowerCase();
      const found = categories.find(
        (item) =>
          item.labelDe.toLowerCase() === folded ||
          item.labelEn.toLowerCase() === folded ||
          item.code === folded,
      );
      if (found) return found;
      const code = text
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-+|-+$/gu, '')
        .slice(0, 80);
      if (!code) return null;
      const row: MailCategory = {
        code,
        groupCode: 'manual',
        labelDe: text,
        labelEn: text,
        defaultSkillCode: 'workplace',
      };
      categories.push(row);
      return row;
    },
    async latestOpenFrom(email) {
      const row = [...tickets]
        .reverse()
        .find(
          (ticket) =>
            ticket.requesterEmail.toLowerCase() === email.toLowerCase() &&
            !closed.includes(ticket.id),
        );
      return row ? { id: row.id, number: row.number } : null;
    },
    async appendReply(ticketId, text) {
      const row = tickets.find((ticket) => ticket.id === ticketId);
      if (!row) return;
      row.body = `${row.body}\n\n---\n${text}`;
      events.push({
        id: `event-${events.length + 1}`,
        ticketId,
        kind: 'mail_reply',
        payload: { bytes: text.length },
      });
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
      askMail: async () =>
        ({
          kind: 'support',
          category: 'ELDA / SV-Meldung',
          priority: null,
          model: 'qwen2.5:7b',
        }) as const,
      mailErrorTo: 'helpdesk@ppc.at',
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
    };
    expect(await ingestMail(mail, deps)).toBe('retry');
    expect(
      await ingestMail(
        { ...mail, internetMessageId: '<silent@example.com>' },
        { ...deps, askMail: async () => 'unreachable' },
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
      askMail: async () =>
        ({
          kind: 'spam',
          category: null,
          priority: null,
          model: 'qwen2.5:7b',
        }) as const,
    });
    expect(result).toBe('declined');
    expect(store.tickets).toHaveLength(0);
    expect(ports.mailer.sent).toHaveLength(0);
  });

  it('files a named category, asks every sender, and keeps the mail body out of the decision', async () => {
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
    };
    const blocked = await ingestMail(
      { ...mail, internetMessageId: '<svnr@example.com>', body: 'SVNR 1234 010180' },
      {
        ...base,
        askMail: async () =>
          ({
            kind: 'support',
            category: 'Drucker',
            priority: 'p1',
            model: 'qwen2.5:7b',
          }) as const,
      },
    );
    expect(blocked).toBe('created');
    expect(store.closed).toHaveLength(0);
    expect(ports.mailer.sent[0]?.text).not.toContain('1234');

    ports.mailer.sent.length = 0;
    const opened = await ingestMail(
      {
        ...mail,
        internetMessageId: '<faq@example.com>',
        subject: 'Der Drucker klemmt',
        body: 'Es kommt kein Papier.',
      },
      {
        ...base,
        askMail: async () =>
          ({
            kind: 'support',
            category: 'Netzwerkdrucker',
            priority: null,
            model: 'qwen2.5:7b',
          }) as const,
      },
    );
    expect(opened).toBe('created');
    expect(store.closed).toHaveLength(0);
    expect(categories.some((item) => item.labelDe === 'Netzwerkdrucker')).toBe(true);
    expect(ports.mailer.sent[0]?.text).not.toContain('Es kommt kein Papier');
    expect(store.events.some((event) => event.kind === 'model_decision')).toBe(true);
    let asked = 0;
    const helpdesk = await ingestMail(
      { ...mail, fromEmail: 'helpdesk@example.com', internetMessageId: '<desk@example.com>' },
      {
        ...base,
        askMail: async () => {
          asked += 1;
          return {
            kind: 'foreign',
            category: null,
            priority: null,
            model: 'qwen2.5:7b',
          } as const;
        },
      },
    );
    expect(asked).toBe(1);
    expect(helpdesk).toBe('declined');
    const recorded = store.events.find((event) => event.kind === 'model_decision');
    expect(JSON.stringify(recorded?.payload)).not.toContain('Papier');
  });

  it('opens a low-priority default ticket and sends the timeout notice', async () => {
    const store = memoryStore();
    const ports = doubles();
    const delivered: string[] = [];
    const result = await ingestMail(
      { ...mail, internetMessageId: '<slow@example.com>' },
      {
        store,
        mailer: {
          ...ports.mailer,
          async deliver(message) {
            delivered.push(message.to);
          },
        },
        calendar: ports.calendar,
        writer: ports.writer,
        now: new Date('2026-10-27T08:10:00.000Z'),
        origin: 'https://helpdesk.kmbcloud.at',
        fallbackCategory: 'printer',
        duration: 30,
        delays: { p1: 0, p2: 60, p3: 240 },
        oncallEmail: '',
        estimatedMinutes: null,
        mailErrorTo: 'helpdesk@ppc.at',
        askMail: async () => 'timeout',
      },
    );
    expect(result).toBe('created');
    expect(store.tickets[0]?.categoryLabel).toBe('Drucker');
    expect(store.events.some((event) => event.payload.reason === 'model_timeout')).toBe(true);
    expect(delivered).toEqual(['helpdesk@ppc.at']);
    expect(ports.mailer.sent.some((message) => message.to === 'helpdesk@ppc.at')).toBe(false);
  });

  it('appends a reply and closes the latest open ticket from the same sender', async () => {
    const store = memoryStore();
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
      askMail: async () =>
        ({
          kind: 'support',
          category: 'Drucker',
          priority: 'p2',
          model: 'qwen2.5:7b',
        }) as const,
    };
    expect(await ingestMail(mail, base)).toBe('created');
    const reply = await ingestMail(
      {
        ...mail,
        internetMessageId: '<reply@example.com>',
        subject: 'AW: Ticket 1',
        inReplyTo: '<once@example.com>',
      },
      {
        ...base,
        askMail: async () =>
          ({
            kind: 'reply',
            category: null,
            priority: null,
            model: 'qwen2.5:7b',
          }) as const,
      },
    );
    expect(reply).toBe('declined');
    expect(store.tickets[0]?.body).toContain('AW: Ticket 1');
    const closed = await ingestMail(
      { ...mail, fromEmail: 'other@example.com', internetMessageId: '<other@example.com>' },
      base,
    );
    expect(closed).toBe('created');
    const finish = await ingestMail(
      {
        ...mail,
        fromEmail: 'other@example.com',
        internetMessageId: '<done@example.com>',
        subject: 'Erledigt',
      },
      {
        ...base,
        askMail: async () =>
          ({
            kind: 'close',
            category: null,
            priority: null,
            model: 'qwen2.5:7b',
          }) as const,
      },
    );
    expect(finish).toBe('declined');
    expect(store.closed).toEqual(['ticket-2']);
  });
});

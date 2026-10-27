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

function memoryStore(): MailStore & { tickets: StoredMailTicket[]; events: { kind: string }[] } {
  const tickets: StoredMailTicket[] = [];
  const events: { id: string; ticketId: string; kind: string; payload: Record<string, unknown> }[] =
    [];
  let sequence = 1;
  const store: MailStore & { tickets: StoredMailTicket[]; events: { kind: string }[] } = {
    tickets,
    events,
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
    async hasEvent(ticketId, kind) {
      return events.some((event) => event.ticketId === ticketId && event.kind === kind);
    },
    activeStaffEmails: async () => people.map((person) => person.email),
    pendingReopens: async () => [],
    heartbeat: async () => undefined,
  };
  return store;
}

function doubles(): {
  mailer: Mailer & { sent: { to: string; subject: string; text: string }[] };
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
    };
    expect(await ingestMail(mail, deps)).toBe('created');
    expect(await ingestMail(mail, deps)).toBe('duplicate');
    expect(store.tickets).toHaveLength(1);
    expect(store.tickets[0]?.assignedStaffId).toBe('bea');
    expect(ports.mailer.sent).toHaveLength(1);
    expect(ports.mailer.sent[0]?.text).toContain('https://helpdesk.kmbcloud.at/?ticket=1');
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
});

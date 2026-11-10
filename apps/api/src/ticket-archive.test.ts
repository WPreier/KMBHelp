import { describe, expect, it } from 'vitest';
import { isTicketCode } from '@kmbhelp/shared';
import {
  archiveDue,
  archiveIndexHtml,
  formatTicketHistory,
  ticketTexts,
} from './ticket-archive.js';

describe('ticket archive clock', () => {
  it('runs at 23:00 on a workday and catches a missed Friday on Saturday', () => {
    expect(archiveDue(new Date('2026-11-06T22:00:00+01:00'), null)).toBe(true);
    expect(archiveDue(new Date('2026-11-06T22:00:00+01:00'), '2026-11-05')).toBe(false);
    expect(archiveDue(new Date('2026-11-06T23:05:00+01:00'), '2026-11-05')).toBe(true);
    expect(archiveDue(new Date('2026-11-07T10:00:00+01:00'), '2026-11-05')).toBe(true);
    expect(archiveDue(new Date('2026-11-07T10:00:00+01:00'), '2026-11-06')).toBe(false);
  });

  it('keeps the verdict short and names the files', () => {
    const text = ticketTexts({
      code: '26-0091',
      subject: 'Drucker',
      category: 'Arbeitsplatz',
      impact: 'workplace',
      priority: 'p2',
      dueOn: '2026-11-20',
      requesterName: 'Ada',
      body: 'Das Fach klemmt.',
      workingMarkdown: 'Patrone gewechselt.',
      files: ['foto.png'],
    });
    expect(text.verdict).toBe('Das Fach klemmt.');
    expect(text.summary).toContain('26-0091');
    expect(text.markdown).toContain('foto.png');
    expect(text.markdown).toContain('Patrone gewechselt.');
    expect(text.markdown).toContain('## Beschreibung');
    const history = formatTicketHistory({
      createdAt: new Date('2026-11-10T18:49:00.000Z'),
      requester: 'Ada',
      description: 'Das Fach klemmt.',
      changes: [
        { at: new Date('2026-11-10T19:05:00.000Z'), actor: 'Wolf', text: 'Patrone gewechselt.' },
      ],
    });
    expect(history).toContain('Ticket am 10.11.2026 19:49, Von Ada, Beschreibung');
    expect(history).toContain('Das Fach klemmt.');
    expect(history).toContain('----------------------------------------');
    expect(history).toContain('10.11.2026 20:05, Wolf, Beschreibung');
    expect(isTicketCode('26-0091')).toBe(true);
    const page = archiveIndexHtml({
      code: '26-0091',
      markdown: text.markdown,
      files: [{ name: 'foto.png', bytes: 2048, modifiedAt: '2026-11-06T18:00:00.000Z' }],
    });
    expect(page).toContain('summary.md');
    expect(page).toContain('fazit.md');
    expect(page).toContain('ticket.pdf');
    expect(page).toContain('foto.png');
    expect(page).toContain('Patrone gewechselt.');
  });

  it('numbers each year with two digits and four sequence digits', () => {
    expect(isTicketCode('27-0001')).toBe(true);
  });
});

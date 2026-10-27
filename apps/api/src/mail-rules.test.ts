import { describe, expect, it } from 'vitest';
import {
  calendarBody,
  calendarSubject,
  classifyMail,
  durationMinutes,
  fallbackCategoryCode,
  firstFreeSlot,
  pickAssignee,
  replyText,
  type MailCategory,
} from './mail-rules.js';

const categories: MailCategory[] = [
  {
    code: 'elda',
    groupCode: 'payroll',
    labelDe: 'ELDA / SV-Meldung',
    labelEn: 'ELDA / social insurance filing',
    defaultSkillCode: 'payroll',
  },
  {
    code: 'printer',
    groupCode: 'workplace',
    labelDe: 'Drucker',
    labelEn: 'Printer',
    defaultSkillCode: 'workplace',
  },
  {
    code: 'mover',
    groupCode: 'access',
    labelDe: 'Rollenwechsel Lohn / Steuer',
    labelEn: 'Role change payroll / tax',
    defaultSkillCode: 'identity',
  },
];

describe('mail rules', () => {
  it('uses the longest category label and otherwise the workplace fallback', () => {
    expect(classifyMail('Bitte die ELDA / SV-Meldung prüfen', categories)).toBe('elda');
    expect(classifyMail('Rollenwechsel Lohn / Steuer von Anna', categories)).toBe('mover');
    expect(classifyMail('Der Bildschirm bleibt schwarz', categories)).toBe(fallbackCategoryCode);
    expect(classifyMail('Der Bildschirm bleibt schwarz', categories, 'elda')).toBe('elda');
  });

  it('starts at the requested minute and skips a busy person', () => {
    const now = new Date('2026-10-27T09:10:00.000Z');
    expect(firstFreeSlot(now, 30, [])?.start).toBe('2026-10-27T09:10:00.000Z');
    expect(durationMinutes(45, 30)).toBe(45);
    expect(durationMinutes(null, 30)).toBe(30);
    const chosen = pickAssignee(
      [
        { id: 'ada', email: 'ada@example.com', displayName: 'Ada' },
        { id: 'bea', email: 'bea@example.com', displayName: 'Bea' },
      ],
      new Map([
        [
          'ada@example.com',
          [{ start: '2026-10-27T08:00:00.000Z', end: '2026-10-27T20:00:00.000Z' }],
        ],
        ['bea@example.com', []],
      ]),
      now,
      30,
    );
    expect(chosen?.id).toBe('bea');
    expect(chosen?.slot?.start).toBe('2026-10-27T09:10:00.000Z');
  });

  it('answers with the number and the public list, without a secret link', () => {
    const text = replyText(12, 'https://helpdesk.kmbcloud.at');
    expect(text).toContain('Ticket 12');
    expect(text).toContain('https://helpdesk.kmbcloud.at/?ticket=12');
    expect(text.toLowerCase()).not.toContain('token');
    expect(calendarSubject('Drucker klemmt')).toBe('Neues Ticket Drucker klemmt');
    expect(
      calendarBody(
        12,
        'https://helpdesk.kmbcloud.at',
        'Sender',
        'sender@example.com',
        'Drucker klemmt',
        'Papierstau',
      ),
    ).toContain('/mitarbeit/ticket/12');
  });
});

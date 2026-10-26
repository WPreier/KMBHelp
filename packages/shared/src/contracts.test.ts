import { describe, expect, it } from 'vitest';
import { createTicketSchema } from './contracts.js';
import { departmentLabel } from './departments.js';

describe('createTicketSchema', () => {
  it('accepts a ticket and stores the due date as an ISO day', () => {
    const parsed = createTicketSchema.parse({
      categoryCode: 'payroll_run',
      impact: 'payroll',
      subject: 'Lauf',
      body: 'steht',
      dueOn: '04.03.2026',
      clientPriority: 'p3',
    });
    expect(parsed.dueOn).toBe('2026-03-04');
    expect(parsed.source).toBe('web');
    expect(parsed.clientPriority).toBe('p3');
    expect('requesterEmail' in parsed).toBe(false);
  });

  it('rejects an impossible calendar day', () => {
    const parsed = createTicketSchema.safeParse({
      categoryCode: 'payroll_run',
      impact: 'payroll',
      subject: 'Lauf',
      body: 'steht',
      dueOn: '31.02.2026',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a missing subject', () => {
    const parsed = createTicketSchema.safeParse({
      categoryCode: 'payroll_run',
      impact: 'payroll',
      subject: ' ',
      body: 'steht',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('departmentLabel', () => {
  it('names the payroll department in both languages', () => {
    expect(departmentLabel('payroll')).toEqual({ de: 'Lohn', en: 'Payroll' });
    expect(departmentLabel('unknown')).toEqual({ de: 'unknown', en: 'unknown' });
  });
});

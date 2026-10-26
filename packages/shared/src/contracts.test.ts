import { describe, expect, it } from 'vitest';
import { createTicketSchema } from './contracts.js';
import { departmentLabel } from './departments.js';

describe('createTicketSchema', () => {
  it('accepts a ticket and drops an empty email', () => {
    const parsed = createTicketSchema.parse({
      categoryCode: 'payroll_run',
      impact: 'payroll',
      subject: 'Lauf',
      body: 'steht',
      requesterEmail: '  ',
      clientPriority: 'p3',
    });
    expect(parsed.requesterEmail).toBeUndefined();
    expect(parsed.source).toBe('web');
    expect(parsed.clientPriority).toBe('p3');
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

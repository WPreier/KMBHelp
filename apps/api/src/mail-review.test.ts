import { scriptedModel } from '@kmbhelp/ai';
import { describe, expect, it } from 'vitest';
import { parseSupportAnswer } from '@kmbhelp/ai';
import { exclusionReason, reviewInboundMail } from './mail-review.js';

const domains = ['kmb-steuerberatung.at', 'ght.at', 'koller-rohrschach.at'];

describe('support mail gate', () => {
  it('reads JA and NEIN and keeps one sentence', () => {
    expect(parseSupportAnswer('JA\nDer Drucker druckt nicht.')).toEqual({
      support: true,
      reason: 'Der Drucker druckt nicht.',
    });
    expect(parseSupportAnswer('"NEIN"\nDas ist ein Newsletter.')?.support).toBe(false);
    expect(parseSupportAnswer('vielleicht')).toBeNull();
  });

  it('excludes helpdesk, staff and foreign domains before any model call', async () => {
    expect(
      exclusionReason({
        fromEmail: 'helpdesk@kmb-steuerberatung.at',
        domains,
        helpdeskMailbox: 'helpdesk@kmbcloud.at',
        staffEmails: [],
      }),
    ).toBe('helpdesk');
    expect(
      exclusionReason({
        fromEmail: 'ada@kmb-steuerberatung.at',
        domains,
        helpdeskMailbox: 'helpdesk@kmbcloud.at',
        staffEmails: ['Ada@kmb-steuerberatung.at'],
      }),
    ).toBe('staff');
    let called = 0;
    const foreign = await reviewInboundMail(
      { fromEmail: 'news@example.com', subject: 'Angebot', body: 'Bitte helfen' },
      {
        domains,
        helpdeskMailbox: 'helpdesk@kmbcloud.at',
        staffEmails: [],
        provider: scriptedModel({
          answer: 'JA\nSupport',
          onReview: () => {
            called += 1;
          },
        }),
      },
    );
    expect(foreign.excluded).toBe(true);
    expect(foreign.is_support).toBe(false);
    expect(called).toBe(0);
  });

  it('sets is_support only when an internal sender gets JA', async () => {
    const notes: string[] = [];
    const accepted = await reviewInboundMail(
      { fromEmail: 'anna@ght.at', subject: 'Drucker', body: 'Er klemmt.' },
      {
        domains,
        helpdeskMailbox: 'helpdesk@kmbcloud.at',
        staffEmails: [],
        providerName: 'grok',
        provider: scriptedModel({ answer: 'JA\nEine Support-Anfrage.' }),
        syslog: async (_category, message) => {
          notes.push(message);
        },
      },
    );
    expect(accepted.is_support).toBe(true);
    expect(accepted.reason).toBe('Eine Support-Anfrage.');
    expect(notes).toEqual(['external grok review JA']);

    const held = await reviewInboundMail(
      { fromEmail: 'anna@ght.at', subject: 'Drucker', body: 'Er klemmt.' },
      {
        domains,
        helpdeskMailbox: '',
        staffEmails: [],
        provider: scriptedModel({ answer: null }),
      },
    );
    expect(held.held).toBe(true);
    expect(held.is_support).toBe(false);
  });
});

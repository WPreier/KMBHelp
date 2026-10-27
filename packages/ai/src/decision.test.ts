import { describe, expect, it } from 'vitest';
import { autoReplyGate, confirmsSupportMail, stricterPriority } from './decision.js';

const decision = {
  category: 'printer',
  priority: 'p3' as const,
  skill: 'workplace',
  confidence: 0.9,
  auto_reply_allowed: true,
  faq_slug: 'printer',
  is_support: true,
};

describe('autoReplyGate', () => {
  it('closes only when every rule passes', () => {
    expect(
      autoReplyGate({
        decision,
        allowlist: ['printer'],
        publishedFaqSlugs: ['printer'],
        text: 'Der Drucker klemmt.',
      }),
    ).toEqual({ close: true, reason: 'ok' });
  });

  it('refuses an empty allowlist, low confidence and personal data', () => {
    expect(
      autoReplyGate({
        decision,
        allowlist: [],
        publishedFaqSlugs: ['printer'],
        text: 'Der Drucker klemmt.',
      }).reason,
    ).toBe('allowlist');
    expect(
      autoReplyGate({
        decision: { ...decision, confidence: 0.84 },
        allowlist: ['printer'],
        publishedFaqSlugs: ['printer'],
        text: 'Der Drucker klemmt.',
      }).reason,
    ).toBe('confidence');
    expect(
      autoReplyGate({
        decision,
        allowlist: ['printer'],
        publishedFaqSlugs: ['printer'],
        text: 'SVNR 1234 010180',
        now: new Date('2026-10-27T00:00:00.000Z'),
      }).reason,
    ).toBe('personal_data');
  });

  it('treats only an explicit support flag as confirmation', () => {
    expect(confirmsSupportMail(decision)).toBe(true);
    expect(confirmsSupportMail({ ...decision, is_support: false })).toBe(false);
    expect(confirmsSupportMail(null)).toBe(false);
  });

  it('keeps the more urgent priority', () => {
    expect(stricterPriority('p3', 'p1')).toBe('p1');
    expect(stricterPriority('p1', 'p3')).toBe('p1');
  });
});

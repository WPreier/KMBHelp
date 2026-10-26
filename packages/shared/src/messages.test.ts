import { describe, expect, it } from 'vitest';
import { messages, publicErrors } from './messages.js';

describe('messages', () => {
  it('keeps the same keys in German and English', () => {
    expect(Object.keys(messages.de).sort()).toEqual(Object.keys(messages.en).sort());
  });

  it('fills every visible string', () => {
    for (const language of ['de', 'en'] as const) {
      for (const value of Object.values(messages[language])) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
    for (const value of Object.values(publicErrors)) {
      expect(value.de).not.toEqual(value.en);
    }
  });
});

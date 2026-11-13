import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';

describe('admin mail test', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('checks a pasted mail with the same classification call', async () => {
    vi.stubGlobal('fetch', async (_input: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: { content: string }[] };
      const prompt = body.messages?.[0]?.content ?? '';
      expect(prompt).toContain('SUPPORT');
      expect(prompt).toContain('From: Ada <ada@example.com>');
      expect(prompt).toContain('Subject: Hallo');
      return Response.json({ message: { content: 'SPAM' } });
    });
    const app = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/mail-test',
      payload: {
        prompt: '',
        email: 'From: Ada <ada@example.com>\nSubject: Hallo\n\nDer Drucker klemmt.',
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      textDe: string;
      seconds: number;
      exchanges: { kind: string; answer: string }[];
    };
    expect(body.textDe).toBe('Ergebnis: spam.');
    expect(body.exchanges[0]?.kind).toBe('classify');
    expect(body.exchanges[0]?.answer).toContain('SPAM');
    expect(body.seconds).toBeGreaterThanOrEqual(0);
    await app.close();
  });

  it('accepts a long pasted mail that used to fail at 20000 characters', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ message: { content: 'SPAM' } }));
    const app = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/mail-test',
      payload: {
        prompt: 'Lies diese E-Mail.',
        email: `From: Ada <ada@example.com>\nSubject: Hallo\n\n${'x'.repeat(30_000)}`,
        model: 'gemma3:4b',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ textDe: 'Ergebnis: spam.' });
    await app.close();
  });
});

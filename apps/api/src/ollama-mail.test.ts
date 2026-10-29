import { describe, expect, it } from 'vitest';
import type { InboundMail } from './graph.js';
import { askOllama, classificationPrompt, importanceOf, parseMailAnswer } from './ollama-mail.js';

const mail: InboundMail = {
  graphId: '1',
  internetMessageId: '<once@example.com>',
  subject: 'Drucker klemmt',
  body: 'SVNR 1234 010180 und das Fach 2 ist leer.',
  fromEmail: 'sender@example.com',
  fromName: 'Sender',
  to: 'helpdesk@kmbcloud.at',
  cc: '',
  sentAt: '2026-10-29T08:00:00Z',
  inReplyTo: '',
  references: '',
};

describe('local mail review', () => {
  it('reads the five classes and a clear importance', () => {
    expect(parseMailAnswer('SUPPORT\nKATEGORIE: Netzwerkdrucker\nWICHTIGKEIT: P1')).toEqual({
      kind: 'support',
      category: 'Netzwerkdrucker',
      priority: 'p1',
    });
    expect(parseMailAnswer('ANTWORT')).toEqual({ kind: 'reply', category: null, priority: null });
    expect(parseMailAnswer('Abschluss')).toEqual({ kind: 'close', category: null, priority: null });
    expect(parseMailAnswer('FREMD')).toEqual({ kind: 'foreign', category: null, priority: null });
    expect(parseMailAnswer('SPAM')).toEqual({ kind: 'spam', category: null, priority: null });
    expect(parseMailAnswer('vielleicht')).toBeNull();
    expect(importanceOf('unklar')).toBeNull();
    expect(importanceOf('wichtig')).toBeNull();
    expect(importanceOf('bei Gelegenheit')).toBe('p3');
  });

  it('sends the important headers and masks the body', () => {
    const prompt = classificationPrompt(mail);
    expect(prompt).toContain('From: Sender <sender@example.com>');
    expect(prompt).toContain('To: helpdesk@kmbcloud.at');
    expect(prompt).toContain('Subject: Drucker klemmt');
    expect(prompt).toContain('Message-ID: <once@example.com>');
    expect(prompt).not.toContain('1234');
    expect(prompt).not.toContain('Received:');
  });

  it('asks again when the importance is missing and stops at five minutes', async () => {
    const calls: string[] = [];
    const answered = await askOllama({
      baseUrl: 'http://192.168.191.131:11434',
      model: 'qwen2.5:7b',
      mail,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          messages: { content: string }[];
        };
        calls.push(body.messages[0]?.content ?? '');
        const content = calls.length === 1 ? 'SUPPORT\nKATEGORIE: Drucker' : 'UNKLAR';
        return new Response(JSON.stringify({ message: { content } }), { status: 200 });
      },
    });
    expect(answered).toEqual({
      kind: 'support',
      category: 'Drucker',
      priority: null,
      model: 'qwen2.5:7b',
    });
    expect(calls).toHaveLength(2);

    const timedOut = await askOllama({
      baseUrl: 'http://192.168.191.131:11434',
      model: 'qwen2.5:7b',
      mail,
      timeoutMs: 5,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          const fail = () => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
          if (signal?.aborted) fail();
          signal?.addEventListener('abort', fail);
        }),
    });
    expect(timedOut).toBe('timeout');
  });
});

import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flushFileLogs } from './file-log.js';
import { mailboxFromEnv, type InboundMail } from './graph.js';
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

  it('writes the model exchange and the mailbox access', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kmbhelp-ki-'));
    const previous = process.env.ACTIVITY_LOG_FILE;
    process.env.ACTIVITY_LOG_FILE = join(directory, 'activity.log');
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/oauth2/v2.0/token')) {
        return Response.json({ access_token: 'token' });
      }
      if (url.includes('/api/chat')) {
        return Response.json({ message: { content: 'SUPPORT' } });
      }
      return Response.json({ value: [] });
    };
    try {
      await askOllama({
        baseUrl: 'http://192.168.191.131:11434',
        model: 'qwen2.5:7b',
        mail,
        fetchImpl,
      });
      await mailboxFromEnv(
        {
          GRAPH_TENANT_ID: 'tenant',
          GRAPH_CLIENT_ID: 'client',
          GRAPH_CLIENT_SECRET: 'contract-secret',
          GRAPH_MAILBOX: 'helpdesk@kmbcloud.at',
        },
        fetchImpl,
      ).listUnread(10);
      await flushFileLogs();
      const model = await readFile(join(directory, 'ki.log'), 'utf8');
      const mailbox = await readFile(join(directory, 'mail.log'), 'utf8');
      expect(model).toContain('kmblmt1');
      expect(model).toContain('qwen2.5:7b');
      expect(model).toContain('classify');
      expect(model).toContain('importance');
      expect(model).toContain('\tSUPPORT');
      expect(model).toMatch(/\t\d+\.\d\t/u);
      expect(model).not.toContain('1234');
      expect(model).not.toContain('Bearer');
      expect(mailbox).toContain('helpdesk@kmbcloud.at');
      expect(mailbox).toContain('posteingang');
      expect(mailbox).toContain('anzahl=0');
      expect(mailbox).not.toContain('contract-secret');
      expect(mailbox).not.toContain('access_token');
    } finally {
      if (previous === undefined) delete process.env.ACTIVITY_LOG_FILE;
      else process.env.ACTIVITY_LOG_FILE = previous;
    }
  });
});

import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flushFileLogs } from './file-log.js';
import { mailboxFromEnv, type InboundMail } from './graph.js';
import {
  askOllama,
  classificationPrompt,
  formatMailSource,
  importanceOf,
  mailcheckAiActive,
  mailcheckInputMax,
  mailExcerpt,
  parseMailAnswer,
  parsePastedMail,
  readImportance,
} from './ollama-mail.js';

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
  unread: true,
};

describe('local mail review', () => {
  it('treats MAILCHECK_AI_ACTIVE off as inactive', () => {
    expect(mailcheckAiActive(undefined)).toBe(true);
    expect(mailcheckAiActive('')).toBe(true);
    expect(mailcheckAiActive('on')).toBe(true);
    expect(mailcheckAiActive('off')).toBe(false);
    expect(mailcheckAiActive('OFF')).toBe(false);
  });

  it('reads SUPPORT, ANTWORT, SPAM and P1–P4', () => {
    expect(parseMailAnswer('SUPPORT\nKATEGORIE: Netzwerkdrucker\nWICHTIGKEIT: P1')).toEqual({
      kind: 'support',
      category: 'Netzwerkdrucker',
      priority: 'p1',
      importanceSettled: true,
    });
    expect(parseMailAnswer('ANTWORT')).toEqual({
      kind: 'reply',
      category: null,
      priority: null,
      importanceSettled: true,
    });
    expect(parseMailAnswer('SPAM')).toEqual({
      kind: 'spam',
      category: null,
      priority: null,
      importanceSettled: true,
    });
    expect(parseMailAnswer('Abschluss')).toBeNull();
    expect(parseMailAnswer('FREMD')).toBeNull();
    expect(parseMailAnswer('vielleicht')).toBeNull();
    expect(
      parseMailAnswer('SUPPORT\nKATEGORIE: Scanner\nWICHTIGKEIT: P4'),
    ).toEqual({
      kind: 'support',
      category: 'Scanner',
      priority: null,
      importanceSettled: true,
    });
    expect(importanceOf('unklar')).toBeNull();
    expect(importanceOf('wichtig')).toBe('p2');
    expect(importanceOf('bei Gelegenheit')).toBe('p3');
    expect(readImportance('P4')).toEqual({ priority: null, settled: true });
  });

  it('sends the important headers and masks the body', () => {
    const prompt = classificationPrompt(mail);
    expect(prompt).toContain('From: Sender <sender@example.com>');
    expect(prompt).toContain('To: helpdesk@kmbcloud.at');
    expect(prompt).toContain('Subject: Drucker klemmt');
    expect(prompt).toContain('Message-ID: <once@example.com>');
    expect(prompt).toContain('SUPPORT');
    expect(prompt).toContain('ANTWORT');
    expect(prompt).toContain('SPAM');
    expect(prompt).not.toContain('ABSCHLUSS');
    expect(prompt).not.toContain('FREMD');
    expect(prompt).not.toContain('1234');
    expect(prompt).not.toContain('Received:');
    const again = parsePastedMail(formatMailSource(mail));
    expect(classificationPrompt(again)).toBe(prompt);
    expect(again.fromEmail).toBe('sender@example.com');
    expect(again.subject).toBe('Drucker klemmt');
  });

  it('cuts the mail excerpt to mailcheckInputMax before the model sees it', () => {
    const long: InboundMail = {
      ...mail,
      body: 'A'.repeat(mailcheckInputMax + 2000),
    };
    const excerpt = mailExcerpt(long);
    expect(excerpt.length).toBe(mailcheckInputMax);
    expect(excerpt.startsWith('From:')).toBe(true);
    expect(classificationPrompt(long).endsWith(excerpt)).toBe(true);
  });

  it('skips the second importance ask when P4 is already set', async () => {
    const calls: string[] = [];
    const answered = await askOllama({
      baseUrl: 'http://192.168.191.131:11434',
      model: 'gemma4:12b',
      mail,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          messages: { content: string }[];
        };
        calls.push(body.messages[0]?.content ?? '');
        return new Response(
          JSON.stringify({
            message: { content: 'SUPPORT\nKATEGORIE: Drucker\nWICHTIGKEIT: P4' },
          }),
          { status: 200 },
        );
      },
    });
    expect(answered).toEqual({
      kind: 'support',
      category: 'Drucker',
      priority: null,
      model: 'gemma4:12b',
    });
    expect(calls).toHaveLength(1);
  });

  it('asks again when the importance is missing and stops at five minutes', async () => {
    const calls: string[] = [];
    const answered = await askOllama({
      baseUrl: 'http://192.168.191.131:11434',
      model: 'gemma4:12b',
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
      model: 'gemma4:12b',
    });
    expect(calls).toHaveLength(2);

    const timedOut = await askOllama({
      baseUrl: 'http://192.168.191.131:11434',
      model: 'gemma4:12b',
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
        model: 'gemma4:12b',
        mail,
        fetchImpl,
      });
      await mailboxFromEnv(
        {
          GRAPH_TENANT_ID: 'tenant',
          GRAPH_CLIENT_ID: 'client',
          GRAPH_CLIENT_SECRET: 'secret',
          GRAPH_MAILBOX: 'helpdesk@kmbcloud.at',
        },
        fetchImpl,
      ).listUnread(10);
      await flushFileLogs();
      const ki = await readFile(join(directory, 'ki.log'), 'utf8');
      const model = await readFile(join(directory, 'mail.log'), 'utf8');
      expect(ki).toContain('gemma4:12b');
      expect(model).toContain('helpdesk@kmbcloud.at');
    } finally {
      if (previous === undefined) delete process.env.ACTIVITY_LOG_FILE;
      else process.env.ACTIVITY_LOG_FILE = previous;
    }
  });
});

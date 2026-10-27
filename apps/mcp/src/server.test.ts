import { describe, expect, it } from 'vitest';
import { callReviewMail, listToolNames, reviewMailTool } from './server.js';

describe('mcp tools', () => {
  it('exposes the mail review and leaves the prompt on the server', async () => {
    expect(listToolNames()).toEqual(['review_mail']);
    expect(reviewMailTool().name).toBe('review_mail');
    let sent = '';
    const result = await callReviewMail(
      { fromEmail: 'anna@ght.at', subject: 'Drucker', body: 'Er klemmt.' },
      {
        origin: 'http://127.0.0.1:3000',
        fetchImpl: (async (_url, init) => {
          sent = String(init?.body ?? '');
          return new Response(JSON.stringify({ is_support: true }), { status: 200 });
        }) as typeof fetch,
      },
    );
    expect(sent).not.toContain('Analysiere');
    expect(JSON.parse(sent)).toEqual({
      fromEmail: 'anna@ght.at',
      subject: 'Drucker',
      body: 'Er klemmt.',
    });
    expect(result).toEqual({ is_support: true });
  });
});

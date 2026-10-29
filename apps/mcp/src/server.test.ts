import { describe, expect, it } from 'vitest';
import { callTool, listToolNames } from './server.js';
import { handleRpc } from './rpc.js';

describe('mcp tools', () => {
  it('does not expose a mail review tool or a sql console', () => {
    expect(listToolNames()).not.toContain('review_mail');
    expect(listToolNames().some((name) => name.toLowerCase().includes('sql'))).toBe(false);
  });

  it('sends the service token only on staff tools and keeps it out of the body', async () => {
    let authorization = '';
    let url = '';
    const result = await callTool(
      'get_ticket',
      { number: 10 },
      {
        origin: 'http://127.0.0.1:3000',
        token: 'test-token-not-a-secret-01',
        fetchImpl: (async (target, init) => {
          url = String(target);
          authorization = new Headers(init?.headers).get('authorization') ?? '';
          return new Response(JSON.stringify({ number: 10 }), { status: 200 });
        }) as typeof fetch,
      },
    );
    expect(url).toBe('http://127.0.0.1:3000/api/v1/staff/tickets/10');
    expect(authorization).toBe('Bearer test-token-not-a-secret-01');
    expect(result.json).toEqual({ number: 10 });
    const missing = await callTool('dashboard', {}, { origin: 'http://127.0.0.1:3000', token: '' });
    expect(missing.isError).toBe(true);
    const listed = await handleRpc(
      { id: 1, method: 'tools/list' },
      { origin: 'http://127.0.0.1:3000', token: '' },
    );
    const tools = (listed?.result as { tools: { name: string }[] }).tools;
    expect(tools.some((tool) => tool.name === 'run_reviews')).toBe(true);
    expect(JSON.stringify(tools)).not.toContain('select ');
  });
});

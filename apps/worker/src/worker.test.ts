import { describe, expect, it } from 'vitest';
import { workerStartupEvent } from './worker.js';

describe('workerStartupEvent', () => {
  it('stays quiet without tenant credentials', () => {
    expect(workerStartupEvent({})).toBe('not_configured');
    expect(workerStartupEvent({ GRAPH_TENANT_ID: 'tenant', GRAPH_CLIENT_ID: 'id' })).toBe(
      'not_configured',
    );
  });

  it('does not call Graph even when credentials are present', () => {
    expect(
      workerStartupEvent({
        GRAPH_TENANT_ID: 'tenant',
        GRAPH_CLIENT_ID: 'id',
        GRAPH_CLIENT_SECRET: 'secret',
      }),
    ).toBe('not_implemented');
  });
});

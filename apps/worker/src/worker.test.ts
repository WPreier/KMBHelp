import { describe, expect, it } from 'vitest';
import { workerStartupEvent } from './worker.js';

describe('workerStartupEvent', () => {
  it('stays up and reports not_configured without tenant credentials', () => {
    expect(workerStartupEvent({})).toBe('not_configured');
    expect(
      workerStartupEvent({
        GRAPH_TENANT_ID: 'tenant',
        GRAPH_CLIENT_ID: 'id',
        GRAPH_MAILBOX: 'helpdesk@kmbcloud.at',
      }),
    ).toBe('not_configured');
  });

  it('starts the poll when mailbox, tenant, client and secret are set', () => {
    expect(
      workerStartupEvent({
        GRAPH_TENANT_ID: 'tenant',
        GRAPH_CLIENT_ID: 'id',
        GRAPH_CLIENT_SECRET: 'secret',
        GRAPH_MAILBOX: 'helpdesk@kmbcloud.at',
      }),
    ).toBe('started');
  });
});

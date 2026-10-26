import { describe, expect, it } from 'vitest';
import { listToolNames } from './server.js';

describe('mcp tools', () => {
  it('exposes no tools and no database access in this phase', () => {
    expect(listToolNames()).toEqual([]);
  });
});

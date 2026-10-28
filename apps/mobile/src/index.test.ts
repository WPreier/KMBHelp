import { describe, expect, it } from 'vitest';
import { mobileShell } from './index.js';

describe('mobile shell', () => {
  it('names the app and the production origin', () => {
    expect(mobileShell.name).toBe('KMBHelp');
    expect(mobileShell.origin).toBe('https://helpdesk.kmbcloud.at');
  });
});

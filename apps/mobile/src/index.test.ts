import { describe, expect, it } from 'vitest';
import { mobileShell } from './index.js';

describe('mobile shell', () => {
  it('waits for the Expo screens', () => {
    expect(mobileShell.name).toBe('KMBHelp');
    expect(mobileShell.screensInPhase).toBe(11);
  });
});

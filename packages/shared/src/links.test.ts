import { describe, expect, it } from 'vitest';
import { publicLinkTargets } from './links.js';

describe('publicLinkTargets', () => {
  it('leaves unknown addresses empty', () => {
    expect(publicLinkTargets({})).toEqual({ www: '', home: '', wiki: '' });
    expect(publicLinkTargets({ www: '   ', home: undefined, wiki: '' })).toEqual({
      www: '',
      home: '',
      wiki: '',
    });
  });

  it('keeps an address the firm configured', () => {
    expect(publicLinkTargets({ home: ' https://intranet.example ' }).home).toBe(
      'https://intranet.example',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { publicLinkTargets } from './links.js';

describe('publicLinkTargets', () => {
  it('uses the firm addresses when none are configured', () => {
    expect(publicLinkTargets({})).toEqual({
      www: 'https://kmb-steuerberatung.at',
      home: 'https://home.kmbcloud.at',
      wiki: 'https://wiki.kmbcloud.at',
    });
    expect(publicLinkTargets({ www: '   ', home: undefined, wiki: '' }).www).toBe(
      'https://kmb-steuerberatung.at',
    );
  });

  it('keeps an address the firm configured', () => {
    expect(publicLinkTargets({ home: ' https://intranet.example ' }).home).toBe(
      'https://intranet.example',
    );
  });
});

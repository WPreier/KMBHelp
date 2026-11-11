import { describe, expect, it } from 'vitest';
import { classifyLink, extractHrefs, verdictForLinks } from '../server/links';

const note = { de: 'tls', en: 'tls' };
const lan = { de: 'lan', en: 'lan' };

describe('external links', () => {
  it('extracts anchors and skips mail and fragments', () => {
    const html = '<a href="https://example.com/a">A</a><a href="#top">T</a><a href="mailto:a@example.com">M</a>';
    expect(extractHrefs(html)).toEqual(['https://example.com/a', '#top', 'mailto:a@example.com']);
    const base = new URL('https://kmbhelp.kmbcloud.at/');
    expect(classifyLink('https://example.com/a', base).kind).toBe('external');
    expect(classifyLink('/tickets', base).kind).toBe('internal');
    expect(classifyLink('mailto:a@example.com', base).kind).toBe('skip');
  });

  it('passes when the page has no external links', () => {
    const verdict = verdictForLinks({
      retrieved: true,
      pageStatus: 404,
      pageType: 'text/plain',
      tlsNote: note,
      lanNote: lan,
      checked: [],
    });
    expect(verdict.status).toBe('pass');
    expect(verdict.report?.de).toContain('0 externe Links');
  });

  it('lists broken links in the error', () => {
    const verdict = verdictForLinks({
      retrieved: true,
      pageStatus: 200,
      pageType: 'text/html',
      tlsNote: note,
      lanNote: lan,
      checked: [{ url: 'https://example.invalid/a', ok: false, detail: 'HTTP 404' }],
    });
    expect(verdict.status).toBe('fail');
    expect(verdict.error?.de).toContain('https://example.invalid/a');
    expect(verdict.error?.de).toContain('HTTP 404');
  });

  it('fails when the page cannot be retrieved', () => {
    const verdict = verdictForLinks({
      retrieved: false,
      retrieveError: 'timeout',
      pageStatus: 0,
      pageType: '',
      tlsNote: note,
      lanNote: lan,
      checked: [],
    });
    expect(verdict.status).toBe('fail');
  });
});

import { describe, expect, it } from 'vitest';
import { maxTicketFileBytes, renderMarkdownHtml } from './markdown.js';

describe('ticket markdown', () => {
  it('renders headings, bold and italic and escapes html', () => {
    const html = renderMarkdownHtml('# Titel\n\n**fett** und *kursiv*\n\n<script>alert(1)</script>');
    expect(html).toContain('<h1>Titel</h1>');
    expect(html).toContain('<strong>fett</strong>');
    expect(html).toContain('<em>kursiv</em>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('keeps the upload limit at 10 megabytes', () => {
    expect(maxTicketFileBytes).toBe(10 * 1024 * 1024);
  });
});
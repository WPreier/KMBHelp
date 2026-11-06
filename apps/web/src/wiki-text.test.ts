import { describe, expect, it } from 'vitest';
import { renderMarkdownHtml } from '@kmbhelp/shared';
import { htmlToMarkdown } from './wiki-text.js';

describe('wiki text', () => {
  it('keeps headings, bold and italic through the editor', () => {
    const markdown = '# Titel\n\n**fett** und *kursiv*\n\n- eins';
    const back = htmlToMarkdown(renderMarkdownHtml(markdown));
    expect(back).toContain('# Titel');
    expect(back).toContain('**fett**');
    expect(back).toContain('*kursiv*');
    expect(back).toContain('- eins');
  });
});
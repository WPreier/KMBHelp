const maxTicketFileBytes = 10 * 1024 * 1024;

export { maxTicketFileBytes };

export function renderMarkdownHtml(source: string): string {
  const lines = source.replace(/\r\n/gu, '\n').split('\n');
  const blocks: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (line.startsWith('```')) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').startsWith('```')) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      index += 1;
      blocks.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    if (line.startsWith('### ')) {
      blocks.push(`<h3>${inlineHtml(line.slice(4))}</h3>`);
      index += 1;
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push(`<h2>${inlineHtml(line.slice(3))}</h2>`);
      index += 1;
      continue;
    }
    if (line.startsWith('# ')) {
      blocks.push(`<h1>${inlineHtml(line.slice(2))}</h1>`);
      index += 1;
      continue;
    }
    if (/^[-*] /u.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*] /u.test(lines[index] ?? '')) {
        items.push(`<li>${inlineHtml((lines[index] ?? '').slice(2))}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    if (line.trim() === '') {
      index += 1;
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length && !isBlock(lines[index] ?? '')) {
      paragraph.push(lines[index] ?? '');
      index += 1;
    }
    blocks.push(`<p>${inlineHtml(paragraph.join(' '))}</p>`);
  }
  return blocks.join('\n');
}

function isBlock(line: string): boolean {
  return (
    line.trim() === '' || line.startsWith('#') || line.startsWith('```') || /^[-*] /u.test(line)
  );
}

function inlineHtml(text: string): string {
  let value = escapeHtml(text);
  value = value.replace(/`([^`]+)`/gu, '<code>$1</code>');
  value = value.replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>');
  value = value.replace(/(^|[^*])\*([^*]+)\*/gu, '$1<em>$2</em>');
  value = value.replace(/\[([^[\]]+)\]\(([^)\s]+)\)/gu, (match, label: string, href: string) => {
    if (!/^(https?:\/\/|dateien\/|[A-Za-z0-9._-]+)$/u.test(href)) return match;
    return `<a href="${href}">${label}</a>`;
  });
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
}

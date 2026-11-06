export function htmlToMarkdown(html: string): string {
  const document = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
  const root = document.getElementById('root');
  if (!root) return '';
  return blocks(root)
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function blocks(node: ParentNode): string {
  const parts: string[] = [];
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child.textContent ?? '').replace(/\s+/gu, ' ').trim();
      if (text) parts.push(text);
      continue;
    }
    if (!(child instanceof HTMLElement)) continue;
    const tag = child.tagName;
    if (tag === 'H1') parts.push(`# ${inline(child)}`);
    else if (tag === 'H2') parts.push(`## ${inline(child)}`);
    else if (tag === 'H3') parts.push(`### ${inline(child)}`);
    else if (tag === 'UL' || tag === 'OL') {
      const items = [...child.children]
        .filter((item) => item.tagName === 'LI')
        .map((item) => `- ${inline(item)}`);
      if (items.length > 0) parts.push(items.join('\n'));
    } else if (tag === 'PRE') {
      parts.push(`\`\`\`\n${child.textContent ?? ''}\n\`\`\``);
    } else if (tag === 'P' || tag === 'DIV') {
      const text = inline(child).trim();
      if (text) parts.push(text);
    } else {
      const text = inline(child).trim();
      if (text) parts.push(text);
    }
  }
  return parts.join('\n\n');
}

function inline(node: ParentNode): string {
  let value = '';
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      value += child.textContent ?? '';
      continue;
    }
    if (!(child instanceof HTMLElement)) continue;
    const tag = child.tagName;
    const inner = inline(child);
    if (tag === 'STRONG' || tag === 'B') value += `**${inner}**`;
    else if (tag === 'EM' || tag === 'I') value += `*${inner}*`;
    else if (tag === 'CODE') value += `\`${inner}\``;
    else if (tag === 'A') {
      const href = child.getAttribute('href') ?? '';
      value += href ? `[${inner}](${href})` : inner;
    } else if (tag === 'BR') value += '\n';
    else value += inner;
  }
  return value.replace(/[ \t]+\n/gu, '\n').replace(/\n{3,}/gu, '\n\n');
}

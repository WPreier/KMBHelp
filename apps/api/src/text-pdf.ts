const winAnsi: Record<string, number> = {
  '€': 0x80,
  '‚': 0x82,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  '‰': 0x89,
  'Š': 0x8a,
  '‹': 0x8b,
  'Œ': 0x8c,
  'Ž': 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  'š': 0x9a,
  '›': 0x9b,
  'œ': 0x9c,
  'ž': 0x9e,
  'Ÿ': 0x9f,
  ß: 0xdf,
  ä: 0xe4,
  ö: 0xf6,
  ü: 0xfc,
  Ä: 0xc4,
  Ö: 0xd6,
  Ü: 0xdc,
};

function encodeWinAnsi(text: string): Buffer {
  const bytes: number[] = [];
  for (const character of text) {
    const code = character.codePointAt(0) ?? 63;
    if (code === 10 || code === 13) continue;
    if (code >= 32 && code <= 126) bytes.push(code);
    else if (winAnsi[character] !== undefined) bytes.push(winAnsi[character]);
    else bytes.push(63);
  }
  return Buffer.from(bytes);
}

function pdfEscape(text: string): string {
  return encodeWinAnsi(text)
    .toString('latin1')
    .replace(/\\/gu, '\\\\')
    .replace(/\(/gu, '\\(')
    .replace(/\)/gu, '\\)');
}

export function renderTextPdf(title: string, lines: readonly string[]): Buffer {
  const wrapped: string[] = [];
  for (const line of [title, '', ...lines]) {
    const clean = line.replace(/[\r\n]/gu, ' ');
    if (clean.length <= 90) wrapped.push(clean);
    else {
      for (let index = 0; index < clean.length; index += 90) wrapped.push(clean.slice(index, index + 90));
    }
  }
  const pages: string[][] = [];
  for (let index = 0; index < Math.max(wrapped.length, 1); index += 48) {
    pages.push(wrapped.slice(index, index + 48));
  }
  const objects: string[] = [];
  const pageIds: number[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('');
  let nextId = 3;
  for (const page of pages) {
    const contentId = nextId;
    const pageId = nextId + 1;
    nextId += 2;
    pageIds.push(pageId);
    const commands = ['BT', '/F1 10 Tf', '48 800 Td', '14 TL'];
    for (const line of page) commands.push(`(${pdfEscape(line)}) Tj`, 'T*');
    commands.push('ET');
    const stream = commands.join('\n');
    objects.push(
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    );
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentId} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>`,
    );
  }
  objects[1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, 'latin1');
}

export function parseSupportAnswer(text: string): { support: boolean; reason: string } | null {
  const lines = text
    .replace(/^\uFEFF/u, '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const first = lines[0];
  if (!first) return null;
  const token = first.replace(/^["„“]+|["“”]+$/gu, '').trim();
  const head = token.toUpperCase();
  const support = head === 'JA' || head.startsWith('JA ') || head.startsWith('JA.') || head.startsWith('JA:');
  const reject =
    head === 'NEIN' || head.startsWith('NEIN ') || head.startsWith('NEIN.') || head.startsWith('NEIN:');
  if (!support && !reject) return null;
  const inline = token.replace(/^(JA|NEIN)\b[:.\s-]*/iu, '').trim();
  const reason = (inline || lines.slice(1).join(' ')).replace(/\s+/gu, ' ').trim().slice(0, 300);
  return { support, reason: reason || (support ? 'JA' : 'NEIN') };
}

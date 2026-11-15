/** Default instructions for the automatic mail check and KI-Mailtest. */
export const defaultMailcheckPrompt = [
  'Lies diese E-Mail. Antworte mit:',
  'SUPPORT',
  'ANTWORT',
  'SPAM',
  '',
  'SUPPORT ist eine neue Support-Anfrage von einem Kunden.',
  'ANTWORT ist eine Antwort auf ein bestehendes Ticket.',
  'SPAM ist alles andere',
  '',
  'Wenn es ein SUPPORT Email ist, schreibe:',
  'KATEGORIE: eine kurze Bezeichnung der Anfrage',
  'WICHTIGKEIT: P1 ist sehr wichtig. P2 ist wichtig. P3 ist bei Gelegenheit, P4 alles andere',
].join('\n');

export function resolveMailcheckPrompt(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? defaultMailcheckPrompt : trimmed;
}

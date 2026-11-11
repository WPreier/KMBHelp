export function redact(text: string, secrets: readonly string[]): string {
  let out = text;
  const unique = [...new Set(secrets.map((secret) => secret.trim()).filter((secret) => secret.length >= 4))];
  unique.sort((left, right) => right.length - left.length);
  for (const secret of unique) {
    out = out.split(secret).join('[redacted]');
  }
  return out;
}

export function scrubExcerpt(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b\d{6,}\b/g, '[number]')
    .trim()
    .slice(0, 180);
}

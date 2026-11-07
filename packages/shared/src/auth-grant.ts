export const defaultAuthDomains = 'kmbcloud.at,kmb-steuerberatung.at,krottendorfer.com,ght.at';

export const grantSeconds = 30 * 24 * 60 * 60;
const renewAfterMs = 24 * 60 * 60 * 1000;

export function authDomains(value: string | null | undefined): string[] {
  const source = value?.trim() ? value : defaultAuthDomains;
  return source
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.includes('.'));
}

export function emailDomainAllowed(email: string, domains: string[]): boolean {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  return domain.length > 0 && domains.includes(domain);
}

export function grantIsStale(renewedAt: Date, now: Date): boolean {
  return now.getTime() - renewedAt.getTime() >= renewAfterMs;
}

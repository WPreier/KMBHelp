export type SessionCookies = { session: string; csrf: string };

type CookieSource = {
  get(name: string): string | null;
  getSetCookie?: () => string[];
};

export function readSessionCookies(headers: CookieSource): SessionCookies | null {
  const lines = headers.getSetCookie?.() ?? splitSetCookie(headers.get('set-cookie'));
  const session = cookieValue(lines, 'kmbhelp_session');
  const csrf = cookieValue(lines, 'kmbhelp_csrf');
  if (!session || !csrf) return null;
  return { session, csrf };
}

export function cookieHeader(cookies: SessionCookies): string {
  return `kmbhelp_session=${cookies.session}; kmbhelp_csrf=${cookies.csrf}`;
}

function cookieValue(lines: string[], name: string): string | null {
  for (const line of lines) {
    const match = new RegExp(`(?:^|;\\s*)${name}=([^;\\s]+)`, 'u').exec(line.trim());
    if (match?.[1]) return match[1];
  }
  return null;
}

function splitSetCookie(value: string | null): string[] {
  if (!value) return [];
  return value.split(/,(?=\s*[A-Za-z0-9_]+=)/u);
}

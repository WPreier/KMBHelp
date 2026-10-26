export const LANG_COOKIE = 'kmbhelp_lang';
export const THEME_COOKIE = 'kmbhelp_theme';

const YEAR_SECONDS = 60 * 60 * 24 * 365;

export type ThemeName = 'light' | 'dark';

export function readCookie(source: string, name: string): string | undefined {
  for (const part of source.split(';')) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    if (trimmed.slice(0, separator) !== name) continue;
    return decodeURIComponent(trimmed.slice(separator + 1));
  }
  return undefined;
}

export function serializePreferenceCookie(name: string, value: string, secure: boolean): string {
  const secureAttribute = secure ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${YEAR_SECONDS}; SameSite=Lax${secureAttribute}`;
}

export function resolveLang(
  stored: string | undefined,
  browserLanguage: string | undefined,
): 'de' | 'en' {
  if (stored === 'de' || stored === 'en') return stored;
  if ((browserLanguage ?? '').toLowerCase().startsWith('en')) return 'en';
  return 'de';
}

export function resolveTheme(stored: string | undefined, prefersDark: boolean): ThemeName {
  if (stored === 'light' || stored === 'dark') return stored;
  return prefersDark ? 'dark' : 'light';
}

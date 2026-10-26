import { describe, expect, it } from 'vitest';
import { readCookie, resolveLang, resolveTheme, serializePreferenceCookie } from './preferences.js';

describe('preferences', () => {
  it('reads one named cookie', () => {
    expect(readCookie('a=1; kmbhelp_lang=de; b=2', 'kmbhelp_lang')).toBe('de');
    expect(readCookie('kmbhelp_lang=en', 'kmbhelp_theme')).toBeUndefined();
    expect(readCookie('', 'kmbhelp_lang')).toBeUndefined();
  });

  it('stores language and theme for a year without HttpOnly', () => {
    expect(serializePreferenceCookie('kmbhelp_lang', 'de', false)).toBe(
      'kmbhelp_lang=de; Path=/; Max-Age=31536000; SameSite=Lax',
    );
    const secure = serializePreferenceCookie('kmbhelp_theme', 'dark', true);
    expect(secure).toContain('SameSite=Lax');
    expect(secure).toContain('; Secure');
    expect(secure).not.toContain('HttpOnly');
  });

  it('prefers the saved language over the browser language', () => {
    expect(resolveLang('de', 'en-US')).toBe('de');
    expect(resolveLang('en', 'de-AT')).toBe('en');
    expect(resolveLang('fr', 'en-GB')).toBe('en');
    expect(resolveLang(undefined, 'de-AT')).toBe('de');
    expect(resolveLang(undefined, 'fr-FR')).toBe('de');
  });

  it('prefers the saved theme over the system theme', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme(undefined, true)).toBe('dark');
    expect(resolveTheme('blue', false)).toBe('light');
  });
});

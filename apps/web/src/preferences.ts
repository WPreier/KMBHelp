import {
  LANG_COOKIE,
  THEME_COOKIE,
  readCookie,
  resolveLang,
  resolveTheme,
  serializePreferenceCookie,
  type Lang,
  type ThemeName,
} from '@kmbhelp/shared';

export function readClientPreferences(): { lang: Lang; theme: ThemeName } {
  return {
    lang: resolveLang(readCookie(document.cookie, LANG_COOKIE), navigator.language),
    theme: resolveTheme(
      readCookie(document.cookie, THEME_COOKIE),
      window.matchMedia('(prefers-color-scheme: dark)').matches,
    ),
  };
}

export function writeClientPreference(name: string, value: string): void {
  document.cookie = serializePreferenceCookie(name, value, window.location.protocol === 'https:');
  if (name === LANG_COOKIE && (value === 'de' || value === 'en')) {
    document.documentElement.lang = value;
  }
  if (name === THEME_COOKIE && (value === 'light' || value === 'dark')) {
    document.documentElement.dataset.theme = value;
  }
}

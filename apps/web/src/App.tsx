import {
  LANG_COOKIE,
  THEME_COOKIE,
  messages,
  publicLinkTargets,
  type Lang,
  type ThemeName,
} from '@kmbhelp/shared';
import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { readClientPreferences, writeClientPreference } from './preferences';

const targets = publicLinkTargets({
  www: import.meta.env.VITE_PUBLIC_URL_WWW,
  home: import.meta.env.VITE_PUBLIC_URL_HOME,
  wiki: import.meta.env.VITE_PUBLIC_URL_WIKI,
});

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  );
}

function HomePage() {
  const initial = readClientPreferences();
  const [lang, setLang] = useState<Lang>(initial.lang);
  const [theme, setTheme] = useState<ThemeName>(initial.theme);
  const copy = messages[lang];
  const linksMissing = !targets.www || !targets.home || !targets.wiki;

  useEffect(() => {
    document.title = copy.documentTitle;
    document.documentElement.lang = lang;
    document.documentElement.dataset.theme = theme;
  }, [copy.documentTitle, lang, theme]);

  function chooseLang(next: Lang) {
    writeClientPreference(LANG_COOKIE, next);
    setLang(next);
  }

  function chooseTheme(next: ThemeName) {
    writeClientPreference(THEME_COOKIE, next);
    setTheme(next);
  }

  return (
    <>
      <a className="skip" href="#content">
        {copy.skip}
      </a>
      <header>
        <div className="brand">
          <a className="wordmark" href="/">
            {copy.kmb}
          </a>
          <nav aria-label={copy.navigation}>
            <SiteLink href={targets.www}>{copy.www}</SiteLink>
            <SiteLink href={targets.home}>{copy.home}</SiteLink>
            <SiteLink href={targets.wiki}>{copy.wiki}</SiteLink>
          </nav>
        </div>
        <a className="wordmark" href="https://malama.at" rel="noreferrer">
          {copy.malama}
        </a>
      </header>
      <main id="content">
        <h1>{copy.documentTitle}</h1>
        <p>{copy.lead}</p>
        {linksMissing ? <p>{copy.linksMissing}</p> : null}
        <div className="controls">
          <div role="group" aria-label={copy.language}>
            <span className="control-label">{copy.language}</span>
            <button type="button" aria-pressed={lang === 'de'} onClick={() => chooseLang('de')}>
              {copy.langDe}
            </button>
            <button type="button" aria-pressed={lang === 'en'} onClick={() => chooseLang('en')}>
              {copy.langEn}
            </button>
          </div>
          <div role="group" aria-label={copy.theme}>
            <span className="control-label">{copy.theme}</span>
            <button
              type="button"
              aria-pressed={theme === 'light'}
              onClick={() => chooseTheme('light')}
            >
              {copy.themeLight}
            </button>
            <button
              type="button"
              aria-pressed={theme === 'dark'}
              onClick={() => chooseTheme('dark')}
            >
              {copy.themeDark}
            </button>
          </div>
        </div>
      </main>
    </>
  );
}

function SiteLink({ href, children }: { href: string; children: string }) {
  if (!href) return <span>{children}</span>;
  return <a href={href}>{children}</a>;
}

import {
  LANG_COOKIE,
  THEME_COOKIE,
  publicLinkTargets,
  type Lang,
  type ThemeName,
} from '@kmbhelp/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router-dom';
import { LocaleProvider, useLocale } from './locale.js';
import { ArticlePage, FaqListPage, FaqPage, HomePage, MissingPage, SearchPage } from './pages.js';
import { readClientPreferences, writeClientPreference } from './preferences.js';

const targets = publicLinkTargets({
  www: import.meta.env.VITE_PUBLIC_URL_WWW,
  home: import.meta.env.VITE_PUBLIC_URL_HOME,
  wiki: import.meta.env.VITE_PUBLIC_URL_WIKI,
});

export function App() {
  const initial = readClientPreferences();
  const [lang, setLang] = useState<Lang>(initial.lang);
  const [theme, setTheme] = useState<ThemeName>(initial.theme);

  return (
    <BrowserRouter>
      <LocaleProvider lang={lang}>
        <Shell
          theme={theme}
          onLang={(next) => {
            writeClientPreference(LANG_COOKIE, next);
            setLang(next);
          }}
          onTheme={(next) => {
            writeClientPreference(THEME_COOKIE, next);
            setTheme(next);
          }}
        />
      </LocaleProvider>
    </BrowserRouter>
  );
}

function Shell({
  theme,
  onLang,
  onTheme,
}: {
  theme: ThemeName;
  onLang: (lang: Lang) => void;
  onTheme: (theme: ThemeName) => void;
}) {
  const { lang, copy } = useLocale();

  useEffect(() => {
    document.title = copy.documentTitle;
    document.documentElement.lang = lang;
    document.documentElement.dataset.theme = theme;
  }, [copy.documentTitle, lang, theme]);

  return (
    <>
      <a className="skip" href="#content">
        {copy.skip}
      </a>
      <header className="band">
        <div className="brand">
          <Link className="wordmark" to="/">
            {copy.kmb}
          </Link>
          <nav aria-label={copy.navigation}>
            <SiteLink href={targets.www}>{copy.www}</SiteLink>
            <SiteLink href={targets.home}>{copy.home}</SiteLink>
            <SiteLink href={targets.wiki}>{copy.wiki}</SiteLink>
          </nav>
          <SearchForm />
        </div>
        <a className="wordmark" href="https://malama.at" target="_blank" rel="noopener noreferrer">
          {copy.malama}
        </a>
      </header>
      <div className="band identity">
        <h1>{copy.documentTitle}</h1>
        <p>{copy.lead}</p>
      </div>
      <main id="content">
        <nav className="content-nav" aria-label={copy.contentNav}>
          <Link to="/">{copy.fileTicket}</Link>
          <Link to="/faq">{copy.guides}</Link>
        </nav>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/faq" element={<FaqListPage />} />
          <Route path="/faq/:slug" element={<FaqPage />} />
          <Route path="/wissen/:id" element={<ArticlePage />} />
          <Route path="/suche" element={<SearchPage />} />
          <Route path="*" element={<MissingPage />} />
        </Routes>
        <div className="controls">
          <div role="group" aria-label={copy.language}>
            <span className="control-label">{copy.language}</span>
            <button type="button" aria-pressed={lang === 'de'} onClick={() => onLang('de')}>
              {copy.langDe}
            </button>
            <button type="button" aria-pressed={lang === 'en'} onClick={() => onLang('en')}>
              {copy.langEn}
            </button>
          </div>
          <div role="group" aria-label={copy.theme}>
            <span className="control-label">{copy.theme}</span>
            <button type="button" aria-pressed={theme === 'light'} onClick={() => onTheme('light')}>
              {copy.themeLight}
            </button>
            <button type="button" aria-pressed={theme === 'dark'} onClick={() => onTheme('dark')}>
              {copy.themeDark}
            </button>
          </div>
        </div>
      </main>
    </>
  );
}

function SearchForm() {
  const { copy } = useLocale();
  const navigate = useNavigate();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = String(new FormData(event.currentTarget).get('q') ?? '').trim();
    navigate(q ? `/suche?q=${encodeURIComponent(q)}` : '/suche');
  }

  return (
    <form className="search" role="search" onSubmit={onSubmit}>
      <input name="q" type="search" maxLength={80} aria-label={copy.searchSubmit} />
      <button type="submit" title={copy.searchTitle} aria-label={copy.searchSubmit}>
        <SearchIcon />
      </button>
    </form>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M16 16.5 20 20.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function SiteLink({ href, children }: { href: string; children: string }) {
  if (!href) return <span>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

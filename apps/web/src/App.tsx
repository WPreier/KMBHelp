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
import {
  ArticlePage,
  FaqListPage,
  FaqPage,
  HomePage,
  MissingPage,
  SearchPage,
  SecretPage,
} from './pages.js';
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
      <header>
        <div className="brand">
          <Link className="wordmark" to="/">
            {copy.kmb}
          </Link>
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
        <SearchForm />
        <nav className="content-nav" aria-label={copy.contentNav}>
          <Link to="/">{copy.fileTicket}</Link>
          <Link to="/faq">{copy.guides}</Link>
        </nav>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/faq" element={<FaqListPage />} />
          <Route path="/faq/:slug" element={<FaqPage />} />
          <Route path="/wissen/:id" element={<ArticlePage />} />
          <Route path="/t/:token" element={<SecretPage />} />
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
      <label>
        {copy.searchLabel}
        <input name="q" type="search" maxLength={80} />
      </label>
      <button type="submit">{copy.searchSubmit}</button>
    </form>
  );
}

function SiteLink({ href, children }: { href: string; children: string }) {
  if (!href) return <span>{children}</span>;
  return <a href={href}>{children}</a>;
}

import {
  LANG_COOKIE,
  THEME_COOKIE,
  publicLinkTargets,
  type Lang,
  type ThemeName,
} from '@kmbhelp/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import kmbDark from '../../../brand/kmb-logo-dark.png';
import kmbLight from '../../../brand/kmb-logo--light.png';
import malamaDark from '../../../brand/malama-logo-dark.svg';
import malamaLight from '../../../brand/malama-logo-light.svg';
import { LocaleProvider, useLocale } from './locale.js';
import { AdminPage, SignInPage } from './auth-pages.js';
import { ConfigurationPage, NoticesPage } from './operations-pages.js';
import { ArticlePage, FaqListPage, FaqPage, HomePage, MissingPage, SearchPage } from './pages.js';
import { ActivityPage } from './activity-page.js';
import { DashboardPage } from './dashboard-page.js';
import { TicketPage } from './ticket-page.js';
import { ProcessPage, ProcurementDecisionPage } from './process-pages.js';
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
  const location = useLocation();
  useEffect(() => {
    const path = location.pathname;
    void fetch('/api/v1/activity', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path }),
    }).catch(() => undefined);
  }, [location.pathname]);
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
          <Link className="logo-link" to="/">
            <img src={theme === 'dark' ? kmbDark : kmbLight} alt={copy.kmb} />
          </Link>
          <nav aria-label={copy.navigation}>
            <SiteLink href={targets.www}>{copy.www}</SiteLink>
            <SiteLink href={targets.home}>{copy.home}</SiteLink>
            <SiteLink href={targets.wiki}>{copy.wiki}</SiteLink>
          </nav>
          <SearchForm />
        </div>
        <div className="header-end">
          <div className="header-tools" role="group" aria-label={copy.language}>
            <button
              type="button"
              className="icon-button"
              aria-pressed={lang === 'de'}
              aria-label={copy.langDe}
              title={copy.langDe}
              onClick={() => onLang('de')}
            >
              <GermanFlag />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-pressed={lang === 'en'}
              aria-label={copy.langEn}
              title={copy.langEn}
              onClick={() => onLang('en')}
            >
              <EnglishFlag />
            </button>
          </div>
          <div className="header-tools" role="group" aria-label={copy.theme}>
            <button
              type="button"
              className="icon-button"
              aria-pressed={theme === 'light'}
              aria-label={copy.themeLight}
              title={copy.themeLight}
              onClick={() => onTheme('light')}
            >
              <SunIcon />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-pressed={theme === 'dark'}
              aria-label={copy.themeDark}
              title={copy.themeDark}
              onClick={() => onTheme('dark')}
            >
              <MoonIcon />
            </button>
          </div>
          <a
            className="logo-link"
            href="https://malama.at"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img src={theme === 'dark' ? malamaDark : malamaLight} alt={copy.malama} />
          </a>
        </div>
      </header>
      <div className="band identity">
        <h1>{copy.documentTitle}</h1>
        <p>{copy.lead}</p>
      </div>
      <main id="content">
        <nav className="content-nav" aria-label={copy.contentNav}>
          <Link to="/">{copy.fileTicket}</Link>
          <Link to="/faq">{copy.guides}</Link>
          <Link to="/anmelden">{copy.signIn}</Link>
          <Link to="/verwaltung">{copy.adminTitle}</Link>
          <Link to="/mitarbeit/vorgaenge">{copy.processesTitle}</Link>
          <Link to="/mitarbeit/dashboard">{copy.dashboardTitle}</Link>
          <Link to="/verwaltung/protokoll">{copy.activityTitle}</Link>
        </nav>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/faq" element={<FaqListPage />} />
          <Route path="/faq/:slug" element={<FaqPage />} />
          <Route path="/wissen/:id" element={<ArticlePage />} />
          <Route path="/suche" element={<SearchPage />} />
          <Route path="/anmelden" element={<SignInPage />} />
          <Route path="/verwaltung" element={<AdminPage />} />
          <Route path="/verwaltung/meldungen" element={<NoticesPage />} />
          <Route path="/verwaltung/konfiguration" element={<ConfigurationPage />} />
          <Route path="/verwaltung/protokoll" element={<ActivityPage />} />
          <Route path="/mitarbeit/vorgaenge" element={<ProcessPage />} />
          <Route path="/mitarbeit/dashboard" element={<DashboardPage />} />
          <Route path="/mitarbeit/ticket/:number" element={<TicketPage />} />
          <Route path="/beschaffung/:token" element={<ProcurementDecisionPage />} />
          <Route path="*" element={<MissingPage />} />
        </Routes>
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

function GermanFlag() {
  return (
    <svg viewBox="0 0 5 3" width="22" height="14" aria-hidden="true">
      <rect width="5" height="1" fill="#000" />
      <rect y="1" width="5" height="1" fill="#dd0000" />
      <rect y="2" width="5" height="1" fill="#ffce00" />
    </svg>
  );
}

function EnglishFlag() {
  return (
    <svg viewBox="0 0 60 30" width="22" height="14" aria-hidden="true">
      <rect width="60" height="30" fill="#012169" />
      <path d="M0 0 L60 30 M60 0 L0 30" stroke="#fff" strokeWidth="6" />
      <path d="M0 0 L60 30 M60 0 L0 30" stroke="#c8102e" strokeWidth="3" />
      <path d="M30 0 V30 M0 15 H60" stroke="#fff" strokeWidth="10" />
      <path d="M30 0 V30 M0 15 H60" stroke="#c8102e" strokeWidth="6" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M15.5 3.5a8.5 8.5 0 1 0 5 14.5 7 7 0 0 1-5-14.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
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

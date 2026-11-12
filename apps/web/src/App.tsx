import {
  LANG_COOKIE,
  THEME_COOKIE,
  publicLinkTargets,
  sessionViewSchema,
  type Lang,
  type SessionView,
  type ThemeName,
} from '@kmbhelp/shared';
import { useEffect, useState, type FormEvent } from 'react';
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import kmbDark from '../../../brand/kmb-logo-dark.png';
import kmbLight from '../../../brand/kmb-logo--light.png';
import helpdeskMark from '../../../brand/kmb-helpdesk.png';
import malamaDark from '../../../brand/malama-logo-dark.svg';
import malamaLight from '../../../brand/malama-logo-light.svg';
import { LocaleProvider, useLocale } from './locale.js';
import { getJson, postJson } from './api.js';
import { AdminPage, QrSignInPage, SignInPage } from './auth-pages.js';
import { AdminLinks, ConfigurationPage, NoticesPage } from './operations-pages.js';
import { MailboxAdminPage, MailTestPage, TestsPage } from './admin-test-pages.js';
import { TermPage } from './vocabulary-pages.js';
import {
  ArticlePage,
  FaqListPage,
  FaqPage,
  HomePage,
  MissingPage,
  MyOpenTicketsPage,
  OpenTicketsPage,
  SearchPage,
} from './pages.js';
import {
  ArchiveIndexPage,
  ClosedSummaryPage,
  ClosedTicketsPage,
  TicketWikiPage,
} from './ticket-wiki-page.js';
import { ActivityPage } from './activity-page.js';
import { DashboardPage } from './dashboard-page.js';
import { TicketPage } from './ticket-page.js';
import { ProcurementDecisionPage } from './process-pages.js';
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
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionView | null>(null);
  useEffect(() => {
    let cancelled = false;
    function load() {
      getJson('/api/v1/auth/session', sessionViewSchema.parse)
        .then((loaded) => {
          if (!cancelled) setSession(loaded);
        })
        .catch(() => {
          if (!cancelled) {
            setSession({
              signedIn: false,
              isLocalAdmin: false,
              displayName: null,
              internalAdmin: false,
            });
          }
        });
    }
    load();
    window.addEventListener('kmbhelp-session', load);
    return () => {
      cancelled = true;
      window.removeEventListener('kmbhelp-session', load);
    };
  }, [location.pathname]);
  useEffect(() => {
    const path = location.pathname;
    void fetch('/api/v1/activity', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path }),
    }).catch(() => undefined);
  }, [location.pathname]);
  const admitted = Boolean(session?.signedIn || session?.internalAdmin);
  const onLogin = location.pathname === '/anmelden' || location.pathname.startsWith('/anmelden/');
  const markOnDark = theme === 'dark';
  useEffect(() => {
    if (session && !admitted && !onLogin) navigate('/anmelden', { replace: true });
  }, [admitted, navigate, onLogin, session]);
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
            <img src={markOnDark ? kmbDark : kmbLight} alt={copy.kmb} />
          </Link>
          <nav aria-label={copy.navigation}>
            <SiteLink href={targets.www}>{copy.www}</SiteLink>
            <SiteLink href={targets.home}>{copy.home}</SiteLink>
            <SiteLink href={targets.wiki}>{copy.wiki}</SiteLink>
          </nav>
          <SearchForm />
        </div>
        <div className="header-end">
          <p className="who">{identityLabel(session, copy)}</p>
          <button
            type="button"
            className="header-signin"
            onClick={() => {
              if (session?.signedIn && !session.internalAdmin) {
                void postJson('/api/v1/auth/logout', {}, () => ({ ok: true })).finally(() => {
                  setSession({
                    signedIn: false,
                    isLocalAdmin: false,
                    displayName: null,
                    internalAdmin: false,
                    email: null,
                    audience: null,
                  });
                  navigate('/anmelden');
                });
                return;
              }
              navigate('/anmelden');
            }}
          >
            {session?.signedIn && !session.internalAdmin ? copy.signOut : copy.signIn}
          </button>
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
            <img src={markOnDark ? malamaDark : malamaLight} alt={copy.malama} />
          </a>
        </div>
      </header>
      <main id="content">
        <div className="shell-body">
          {admitted || session?.signedIn ? (
            <div className="shell-rail">
              <Link className="rail-mark" to="/" title={copy.helpdeskMark}>
                <img src={helpdeskMark} alt={copy.helpdeskMark} />
              </Link>
              {admitted ? (
                <nav className="content-nav" aria-label={copy.contentNav}>
                  <NavLink to="/" end>
                    {copy.fileTicket}
                  </NavLink>
                  <NavLink to="/meine">{copy.myOpenTickets}</NavLink>
                  <NavLink to="/offen">{copy.openTickets}</NavLink>
                  <NavLink to="/abgeschlossen">{copy.guides}</NavLink>
                  <NavLink to="/mitarbeit/dashboard">{copy.dashboardTitle}</NavLink>
                </nav>
              ) : null}
              {session?.signedIn ? (
                <AdminLinks
                  administrator={
                    session.audience === 'administrator' || Boolean(session.internalAdmin)
                  }
                />
              ) : null}
            </div>
          ) : null}
          <div className="shell-stage">
            {session && !admitted && !onLogin ? (
              <SignInPage />
            ) : (
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/offen" element={<OpenTicketsPage />} />
                <Route path="/meine" element={<MyOpenTicketsPage />} />
                <Route path="/abgeschlossen" element={<ClosedTicketsPage />} />
                <Route path="/abgeschlossen/:code" element={<ClosedSummaryPage />} />
                <Route path="/ticket/:code" element={<TicketWikiPage />} />
                <Route path="/archiv/:code" element={<ArchiveIndexPage />} />
                <Route path="/faq" element={<FaqListPage />} />
                <Route path="/faq/:slug" element={<FaqPage />} />
                <Route path="/wissen/:id" element={<ArticlePage />} />
                <Route path="/suche" element={<SearchPage />} />
                <Route path="/anmelden" element={<SignInPage />} />
                <Route path="/anmelden/qr/:token" element={<QrSignInPage />} />
                <Route path="/verwaltung" element={<AdminPage />} />
                <Route path="/verwaltung/kenntnisse" element={<TermPage kind="skill" />} />
                <Route path="/verwaltung/kategorien" element={<TermPage kind="category" />} />
                <Route path="/verwaltung/meldungen" element={<NoticesPage />} />
                <Route path="/verwaltung/konfiguration" element={<ConfigurationPage />} />
                <Route path="/verwaltung/protokoll" element={<ActivityPage />} />
                <Route path="/verwaltung/tests" element={<TestsPage />} />
                <Route path="/verwaltung/ki-mailtest" element={<MailTestPage />} />
                <Route path="/verwaltung/mailbox" element={<MailboxAdminPage />} />
                <Route path="/mitarbeit/dashboard" element={<DashboardPage />} />
                <Route path="/mitarbeit/ticket/:number" element={<TicketPage />} />
                <Route path="/beschaffung/:token" element={<ProcurementDecisionPage />} />
                <Route path="*" element={<MissingPage />} />
              </Routes>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

function identityLabel(
  session: SessionView | null,
  copy: { roleAdministrator: string; roleUser: string; notSignedIn: string },
): string {
  if (session?.internalAdmin) return copy.roleAdministrator;
  if (session?.signedIn) {
    const role = session.audience === 'user' ? copy.roleUser : copy.roleAdministrator;
    const who = session.email || session.displayName;
    return who ? `${role}, ${who}` : role;
  }
  return copy.notSignedIn;
}

function SearchForm() {
  const { copy } = useLocale();
  const navigate = useNavigate();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const q = String(data.get('q') ?? '').trim();
    const scope = String(data.get('scope') ?? 'verdict');
    navigate(q ? `/suche?q=${encodeURIComponent(q)}&scope=${encodeURIComponent(scope)}` : '/suche');
  }

  return (
    <form className="search" role="search" onSubmit={onSubmit}>
      <input name="q" type="search" maxLength={80} aria-label={copy.searchSubmit} />
      <select name="scope" defaultValue="verdict" aria-label={copy.searchScope}>
        <option value="verdict">{copy.scopeVerdict}</option>
        <option value="summary">{copy.scopeSummary}</option>
        <option value="ticket">{copy.scopeTicket}</option>
      </select>
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

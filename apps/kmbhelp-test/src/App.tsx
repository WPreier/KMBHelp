import { useEffect, useState } from 'react';
import { fetchCredentials, fetchPlan, runCase, runPhase, runTest, saveCredentials } from './api';
import { text, type CopyKey } from './i18n';
import { TestRow } from './TestRow';
import type { CaseResult, CredentialStatus, Lang, PlanDocument, RowStatus, TestId, TestOutcome } from './types';
import { APP_VERSION } from './version';

const TESTS: { id: TestId; de: string; en: string }[] = [
  { id: 'certificate', de: 'Zertifikat', en: 'Certificate' },
  { id: 'external-links', de: 'Externe Links', en: 'External links' },
  { id: 'search', de: 'Suche', en: 'Search' },
  { id: 'login', de: 'Anmeldung', en: 'Sign-in' },
  { id: 'language', de: 'Sprache', en: 'Language' },
  { id: 'theme', de: 'Hell/Dunkel', en: 'Light/Dark' },
];

type RowState = {
  status: RowStatus;
  error?: TestOutcome['error'];
  report?: TestOutcome['report'];
};

const idleRow = (): RowState => ({ status: 'idle' });

function statusLabel(lang: Lang, status: RowStatus): string {
  const key: CopyKey = status === 'pass' ? 'passed' : status === 'fail' ? 'failed' : status === 'running' ? 'running' : 'idle';
  return text(lang, key);
}

export function App() {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('kmbhelp_test_lang') === 'en' ? 'en' : 'de'));
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('kmbhelp_test_theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [credentials, setCredentials] = useState<CredentialStatus | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [runningCase, setRunningCase] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<TestId, RowState>>(() => ({
    certificate: idleRow(),
    'external-links': idleRow(),
    search: idleRow(),
    login: idleRow(),
    language: idleRow(),
    theme: idleRow(),
  }));
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<PlanDocument | null>(null);
  const [caseResults, setCaseResults] = useState<Record<string, CaseResult>>({});
  const [phaseError, setPhaseError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem('kmbhelp_test_lang', lang);
  }, [lang]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('kmbhelp_test_theme', theme);
  }, [theme]);

  useEffect(() => {
    void fetchCredentials().then(setCredentials).catch(() => setCredentials(null));
    void fetchPlan()
      .then((payload) => {
        setPlan(payload.plan);
        setCaseResults(payload.results);
        setComplete(payload.complete);
      })
      .catch(() => setPlan(null));
  }, []);

  async function execute(id: TestId): Promise<void> {
    setRows((current) => ({ ...current, [id]: { status: 'running' } }));
    try {
      const outcome = await runTest(id);
      setRows((current) => ({
        ...current,
        [id]: { status: outcome.status, error: outcome.error, report: outcome.report },
      }));
    } catch {
      setRows((current) => ({
        ...current,
        [id]: {
          status: 'fail',
          error: { de: text('de', 'serviceError'), en: text('en', 'serviceError') },
        },
      }));
    }
  }

  async function runAll(): Promise<void> {
    setBusy(true);
    for (const test of TESTS) {
      await execute(test.id);
    }
    setBusy(false);
  }

  async function onSave(form: HTMLFormElement): Promise<void> {
    const data = new FormData(form);
    const username = String(data.get('username') ?? '');
    const password = String(data.get('password') ?? '');
    setFormError(null);
    try {
      const status = await saveCredentials(username, password);
      form.reset();
      setCredentials(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : text(lang, 'serviceError');
      setFormError(message);
    }
  }

  async function onPhase(): Promise<void> {
    setBusy(true);
    setPhaseError(null);
    try {
      const payload = await runPhase();
      setPlan(payload.plan);
      setCaseResults(payload.results);
      setComplete(payload.complete);
      if (payload.error) setPhaseError(payload.error[lang]);
    } catch {
      setPhaseError(text(lang, 'serviceError'));
    } finally {
      setBusy(false);
    }
  }

  async function onCase(id: string): Promise<void> {
    setBusy(true);
    setRunningCase(id);
    try {
      const payload = await runCase(id);
      setPlan(payload.plan);
      setCaseResults(payload.results);
      setComplete(payload.complete);
    } catch {
      setPhaseError(text(lang, 'serviceError'));
    } finally {
      setRunningCase(null);
      setBusy(false);
    }
  }

  const t = (key: CopyKey) => text(lang, key);

  return (
    <div className="wrap">
      <p id="run-one-desc" className="visually-hidden">
        {t('runOne')}
      </p>
      <header>
        <div>
          <h1>kmbhelp-test</h1>
          <p className="meta">Version {APP_VERSION}</p>
          <p className="intro">{t('intro')}</p>
          <p className="print-only">kmbhelp-test {APP_VERSION} · kmbhelp · https://kmbhelp.kmbcloud.at</p>
        </div>
        <div className="toolbar no-print">
          <button type="button" onClick={() => setLang(lang === 'de' ? 'en' : 'de')}>
            {lang === 'de' ? 'English' : 'Deutsch'}
          </button>
          <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? t('themeLight') : t('themeDark')}
          </button>
          <button type="button" className="wide-sm" onClick={() => window.print()}>
            {t('pdf')}
          </button>
        </div>
      </header>

      <section className="panel no-print">
        <h2>{t('credentialsTitle')}</h2>
        <p className="note">{credentials?.configured ? t('credentialsSaved') : t('credentialsMissing')}</p>
        <p className="note">{t('credentialsWhy')}</p>
        {credentials ? (
          <p className="meta">
            {credentials.file} · {credentials.mode}
          </p>
        ) : null}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onSave(event.currentTarget);
          }}
        >
          <label>
            {t('username')}
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            {t('password')}
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button type="submit">{credentials?.configured ? t('replace') : t('save')}</button>
        </form>
        {formError ? <p className="detail">{formError}</p> : null}
      </section>

      <ol className="tests" aria-busy={busy}>
        {TESTS.map((test) => {
          const row = rows[test.id];
          return (
            <TestRow
              key={test.id}
              name={lang === 'de' ? test.de : test.en}
              status={row.status}
              error={row.error}
              report={row.report}
              lang={lang}
              busy={busy || row.status === 'running'}
              statusLabel={statusLabel(lang, row.status)}
              onRun={() => {
                setBusy(true);
                void execute(test.id).finally(() => setBusy(false));
              }}
            />
          );
        })}
      </ol>

      <section className="section">
        <h2>{t('runAllHeading')}</h2>
        <button type="button" className="wide-sm" onClick={() => void runAll()} disabled={busy}>
          {t('runAll')}
        </button>
      </section>

      <section className="section">
        <h2>{t('phaseHeading')}</h2>
        <p className="note">{credentials?.configured ? (complete ? t('phaseComplete') : t('phaseIncomplete')) : t('phaseWaiting')}</p>
        <button type="button" className="wide-sm no-print" onClick={() => void onPhase()} disabled={busy || !credentials?.configured}>
          {t('phaseStart')}
        </button>
        {phaseError ? <p className="detail">{phaseError}</p> : null}
        <h3>{t('pages')}</h3>
        {plan && plan.pages.length > 0 ? (
          <ul className="pages">
            {plan.pages.map((page) => (
              <li key={page.url}>
                <div>{page.url}</div>
                <div>
                  {t('purpose')}: {page.purpose[lang]}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="note">{t('phaseEmpty')}</p>
        )}
        {plan && plan.cases.length > 0 ? (
          <ol className="tests">
            {plan.cases.map((item) => {
              const result = caseResults[item.id];
              const status: RowStatus = runningCase === item.id ? 'running' : result ? result.status : 'idle';
              return (
                <TestRow
                  key={item.id}
                  name={item.title[lang]}
                  status={status}
                  error={result?.error}
                  report={result?.report}
                  lang={lang}
                  busy={busy}
                  statusLabel={statusLabel(lang, status)}
                  onRun={() => void onCase(item.id)}
                />
              );
            })}
          </ol>
        ) : null}
      </section>
      <p className="meta no-print">{t('devOnly')}</p>
    </div>
  );
}

import {
  configFieldResultSchema,
  configurationSchema,
  noticeListSchema,
  serviceCodes,
  serviceReportSchema,
  serviceRowSchema,
  type ConfigurationReport,
  type NoticeList,
  type ServiceRow,
} from '@kmbhelp/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { NavLink } from 'react-router-dom';
import { getJson, postJson, RequestFailed } from './api.js';
import { useLocale } from './locale.js';

export function AdminLinks({ administrator }: { administrator: boolean }) {
  const { copy } = useLocale();
  return (
    <nav className="content-nav admin-nav" aria-label={copy.adminTitle}>
      <NavLink to="/verwaltung" end>
        {copy.adminTitle}
      </NavLink>
      <NavLink to="/verwaltung/kenntnisse">{copy.skills}</NavLink>
      <NavLink to="/verwaltung/kategorien">{copy.categories}</NavLink>
      <NavLink to="/verwaltung/meldungen">{copy.noticesTitle}</NavLink>
      <NavLink to="/verwaltung/konfiguration">{copy.configurationTitle}</NavLink>
      <NavLink to="/verwaltung/protokoll">{copy.activityTitle}</NavLink>
      {administrator ? <NavLink to="/verwaltung/tests">{copy.testsTitle}</NavLink> : null}
      {administrator ? <NavLink to="/verwaltung/ki-mailtest">{copy.mailTestTitle}</NavLink> : null}
      {administrator ? <NavLink to="/verwaltung/mailbox">{copy.mailboxAdminTitle}</NavLink> : null}
    </nav>
  );
}

export function NoticesPage() {
  const { lang, copy } = useLocale();
  const [data, setData] = useState<NoticeList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJson('/api/v1/admin/notices', noticeListSchema.parse)
      .then((loaded) => {
        if (!cancelled) setData(loaded);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof RequestFailed
              ? (caught.text?.[lang] ?? copy.loadFailed)
              : copy.loadFailed,
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [copy.loadFailed, lang]);

  async function save(event: FormEvent<HTMLFormElement>, code: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    try {
      await postJson(
        `/api/v1/admin/notices/${encodeURIComponent(code)}`,
        { category: String(form.get('category') ?? ''), enabled: form.get('enabled') === 'on' },
        (value) => value,
        'PATCH',
      );
      setNotice(copy.signedIn);
    } catch (caught) {
      setError(
        caught instanceof RequestFailed
          ? (caught.text?.[lang] ?? copy.loadFailed)
          : copy.loadFailed,
      );
    }
  }

  if (!data) {
    return (
      <section>
        <h2>{copy.noticesTitle}</h2>
        {error ? <p role="alert">{error}</p> : null}
      </section>
    );
  }

  return (
    <section>
      <h2>{copy.noticesTitle}</h2>
      <p>{copy.noticesLead}</p>
      {notice ? <p role="status">{notice}</p> : null}
      {data.notices.map((entry) => (
        <form key={entry.code} className="form" onSubmit={(event) => void save(event, entry.code)}>
          <h3>{lang === 'de' ? entry.textDe : entry.textEn}</h3>
          <p>{entry.code}</p>
          <label>
            {copy.noticeCategory}
            <select name="category" defaultValue={entry.category}>
              <option value="informational">{copy.informational}</option>
              <option value="warning">{copy.warning}</option>
              <option value="error">{copy.error}</option>
            </select>
          </label>
          <label className="check-line">
            <input type="checkbox" name="enabled" defaultChecked={entry.enabled} />
            {copy.triggered}
          </label>
          <div className="form-actions">
            <button type="submit">{copy.saveNotice}</button>
          </div>
        </form>
      ))}
    </section>
  );
}

function ConfigField({ entry }: { entry: ConfigurationReport['entries'][number] }) {
  const { lang, copy } = useLocale();
  const [value, setValue] = useState(entry.secret ? '' : entry.value);
  const [result, setResult] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wide =
    entry.key === 'LDAPS_CA_PEM' ||
    entry.key === 'ADMIN_IP_ALLOWLIST' ||
    entry.key === 'WORKER_SCHEDULE' ||
    entry.key === 'MAIL_AI_PROMPT' ||
    entry.key === 'INTERNAL_MAIL_DOMAINS';

  async function run(
    path: '/api/v1/admin/configuration/value' | '/api/v1/admin/configuration/value/check',
  ) {
    setBusy(true);
    setError(null);
    setResult(null);
    setSaved(false);
    try {
      const next = await postJson(path, { key: entry.key, value }, configFieldResultSchema.parse);
      setResult(lang === 'de' ? next.check.textDe : next.check.textEn);
      setSaved(path.endsWith('/value'));
    } catch (caught) {
      setError(
        caught instanceof RequestFailed
          ? (caught.text?.[lang] ?? copy.loadFailed)
          : copy.loadFailed,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        void run('/api/v1/admin/configuration/value');
      }}
    >
      <h3>{entry.key}</h3>
      <p>{lang === 'de' ? entry.textDe : entry.textEn}</p>
      {entry.secret ? <p>{copy.secretKeep}</p> : null}
      <label>
        {entry.key}
        {wide ? (
          <textarea
            value={value}
            autoComplete="off"
            rows={4}
            onChange={(event) => setValue(event.target.value)}
          />
        ) : (
          <input
            value={value}
            type={entry.secret ? 'password' : 'text'}
            autoComplete="off"
            onChange={(event) => setValue(event.target.value)}
          />
        )}
      </label>
      <div className="form-actions">
        <button type="submit" disabled={busy}>
          {copy.saveValue}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run('/api/v1/admin/configuration/value/check')}
        >
          {copy.checkValue}
        </button>
      </div>
      {saved ? <p role="status">{copy.valueSaved}</p> : null}
      {result ? <p role="status">{result}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}

export function ConfigurationPage() {
  const { lang, copy } = useLocale();
  const [data, setData] = useState<ConfigurationReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(report: boolean) {
    setError(null);
    try {
      const next = report
        ? await postJson('/api/v1/admin/configuration/check', {}, configurationSchema.parse)
        : await getJson('/api/v1/admin/configuration', configurationSchema.parse);
      setData(next);
    } catch (caught) {
      setError(
        caught instanceof RequestFailed
          ? (caught.text?.[lang] ?? copy.loadFailed)
          : copy.loadFailed,
      );
    }
  }

  useEffect(() => {
    let cancelled = false;
    getJson('/api/v1/admin/configuration', configurationSchema.parse)
      .then((loaded) => {
        if (!cancelled) setData(loaded);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof RequestFailed
              ? (caught.text?.[lang] ?? copy.loadFailed)
              : copy.loadFailed,
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [copy.loadFailed, lang]);

  return (
    <section>
      <h2>{copy.configurationTitle}</h2>
      <p>{copy.configurationLead}</p>
      <p>{copy.configurationSource}</p>
      <p>{copy.graphSetup}</p>
      <button type="button" onClick={() => void load(true)}>
        {copy.checkAgain}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {data ? (
        <>
          <h3>{copy.configurationTitle}</h3>
          {data.entries.map((entry) => (
            <ConfigField key={entry.key} entry={entry} />
          ))}
          <h3>{copy.checkAgain}</h3>
          <ul>
            {data.checks.map((entry) => (
              <li key={entry.code}>
                {entry.status}: {lang === 'de' ? entry.textDe : entry.textEn}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

export function ServiceChecks() {
  const { lang, copy } = useLocale();
  const [rows, setRows] = useState<ServiceRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJson('/api/v1/staff/services', serviceReportSchema.parse)
      .then((loaded) => {
        if (!cancelled) setRows(loaded.services);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function testOne(code: string) {
    setBusy(code);
    try {
      const row = await getJson(
        `/api/v1/staff/services/${encodeURIComponent(code)}`,
        serviceRowSchema.parse,
      );
      setFailed(false);
      setRows((current) => {
        const list = current ?? [];
        if (!list.some((entry) => entry.code === code)) return [...list, row];
        return list.map((entry) => (entry.code === code ? row : entry));
      });
    } catch {
      const missed: ServiceRow = {
        code,
        status: 'error',
        textDe: copy.serviceUnavailable,
        textEn: copy.serviceUnavailable,
      };
      setRows((current) => {
        const list = current ?? serviceCodes.map((item) => ({ ...missed, code: item }));
        if (!list.some((entry) => entry.code === code)) return [...list, missed];
        return list.map((entry) => (entry.code === code ? missed : entry));
      });
    } finally {
      setBusy(null);
    }
  }

  const shown =
    rows ??
    (failed
      ? serviceCodes.map((code): ServiceRow => ({
          code,
          status: 'error',
          textDe: copy.serviceUnavailable,
          textEn: copy.serviceUnavailable,
        }))
      : []);

  return (
    <>
      <h3>{copy.serviceTitle}</h3>
      <p>{copy.serviceLead}</p>
      <ul className="service-list">
        {shown.map((service) => (
          <li key={service.code} className="service-row">
            <button
              type="button"
              className="service-test"
              title={copy.serviceTest}
              aria-label={copy.serviceTest}
              disabled={busy === service.code}
              onClick={() => void testOne(service.code)}
            >
              T
            </button>
            <Mark ok={service.status === 'ok'} />
            <span>{lang === 'de' ? service.textDe : service.textEn}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Mark({ ok }: { ok: boolean }) {
  return ok ? (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#1b7f3a" />
      <path
        d="M6.5 12.5 l3.5 3.5 7.5-8"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#a32020" />
      <path
        d="M8 8 l8 8 M16 8 l-8 8"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

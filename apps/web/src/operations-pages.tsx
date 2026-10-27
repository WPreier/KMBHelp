import {
  configFieldResultSchema,
  configurationSchema,
  noticeListSchema,
  syslogFacilities,
  syslogTestSchema,
  type ConfigurationReport,
  type NoticeList,
} from '@kmbhelp/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getJson, postJson, RequestFailed } from './api.js';
import { useLocale } from './locale.js';

export function AdminLinks() {
  const { copy } = useLocale();
  return (
    <nav className="content-nav" aria-label={copy.adminTitle}>
      <Link to="/verwaltung">{copy.adminTitle}</Link>
      <Link to="/verwaltung/meldungen">{copy.noticesTitle}</Link>
      <Link to="/verwaltung/konfiguration">{copy.configurationTitle}</Link>
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
      <AdminLinks />
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

function ConfigField({
  entry,
  onSyslog,
}: {
  entry: ConfigurationReport['entries'][number];
  onSyslog: (syslog: ConfigurationReport['syslog']) => void;
}) {
  const { lang, copy } = useLocale();
  const [value, setValue] = useState(entry.secret ? '' : entry.value);
  const [result, setResult] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wide =
    entry.key === 'LDAPS_CA_PEM' ||
    entry.key === 'ADMIN_IP_ALLOWLIST' ||
    entry.key === 'WORKER_SCHEDULE';

  async function run(
    path: '/api/v1/admin/configuration/value' | '/api/v1/admin/configuration/value/check',
  ) {
    setBusy(true);
    setError(null);
    setResult(null);
    setSaved(false);
    try {
      const next = await postJson(path, { key: entry.key, value }, configFieldResultSchema.parse);
      onSyslog(next.syslog);
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
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [appName, setAppName] = useState('KMBHelp');
  const [facility, setFacility] = useState('local0');
  const [offset, setOffset] = useState('+01:00');
  const [statusText, setStatusText] = useState<string | null>(null);

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
    if (!data) return;
    setHost(data.syslog.host);
    setPort(String(data.syslog.port));
    setAppName(data.syslog.appName);
    setFacility(data.syslog.facility);
    setOffset(data.syslog.offset);
  }, [data]);

  async function saveSyslog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatusText(null);
    try {
      const next = await postJson(
        '/api/v1/admin/configuration/syslog',
        { host, port: Number(port), appName, facility, offset },
        configurationSchema.parse,
      );
      setData(next);
      setStatusText(copy.syslogSaved);
    } catch (caught) {
      setError(
        caught instanceof RequestFailed
          ? (caught.text?.[lang] ?? copy.loadFailed)
          : copy.loadFailed,
      );
    }
  }

  async function testSyslog() {
    setError(null);
    setStatusText(null);
    try {
      const result = await postJson(
        '/api/v1/admin/configuration/syslog/test',
        { host, port: Number(port), appName, facility, offset },
        syslogTestSchema.parse,
      );
      setStatusText(result.ok ? copy.syslogTestOk : copy.syslogTestFailed);
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

  if (!data) {
    return (
      <section>
        <h2>{copy.configurationTitle}</h2>
        {error ? <p role="alert">{error}</p> : null}
      </section>
    );
  }

  return (
    <section>
      <AdminLinks />
      <h2>{copy.configurationTitle}</h2>
      <p>{copy.configurationLead}</p>
      <p>{copy.configurationSource}</p>
      <p>{copy.graphSetup}</p>
      <form className="form" onSubmit={(event) => void saveSyslog(event)}>
        <h3>{copy.syslogServer}</h3>
        <label>
          {copy.syslogServer}
          <input
            name="host"
            value={host}
            autoComplete="off"
            onChange={(event) => setHost(event.target.value)}
          />
        </label>
        <label>
          {copy.syslogPort}
          <input
            name="port"
            inputMode="numeric"
            value={port}
            autoComplete="off"
            onChange={(event) => setPort(event.target.value)}
          />
        </label>
        <label>
          {copy.syslogName}
          <input
            name="appName"
            value={appName}
            maxLength={48}
            autoComplete="off"
            onChange={(event) => setAppName(event.target.value)}
          />
        </label>
        <label>
          {copy.syslogFacility}
          <select
            name="facility"
            value={facility}
            onChange={(event) => setFacility(event.target.value)}
          >
            {syslogFacilities.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          {copy.syslogOffset}
          <input
            name="offset"
            value={offset}
            autoComplete="off"
            onChange={(event) => setOffset(event.target.value)}
          />
        </label>
        <div className="form-actions">
          <button type="submit">{copy.saveSyslog}</button>
          <button type="button" onClick={() => void testSyslog()}>
            {copy.testSyslog}
          </button>
        </div>
      </form>
      {statusText ? <p role="status">{statusText}</p> : null}
      <button type="button" onClick={() => void load(true)}>
        {copy.checkAgain}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {data ? (
        <>
          <h3>{copy.configurationTitle}</h3>
          {data.entries.map((entry) => (
            <ConfigField
              key={entry.key}
              entry={entry}
              onSyslog={(syslog) => {
                setHost(syslog.host);
                setPort(String(syslog.port));
                setAppName(syslog.appName);
                setFacility(syslog.facility);
                setOffset(syslog.offset);
              }}
            />
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

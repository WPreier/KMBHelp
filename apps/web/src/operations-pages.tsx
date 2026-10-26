import {
  configurationSchema,
  noticeListSchema,
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
      <button type="button" onClick={() => void load(true)}>
        {copy.checkAgain}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {data ? (
        <>
          <h3>{copy.configurationTitle}</h3>
          <ul>
            {data.values.map((entry) => (
              <li key={entry.key}>
                {entry.key}:{' '}
                {entry.state === 'shown'
                  ? entry.value
                  : entry.state === 'set'
                    ? copy.valueSet
                    : copy.valueMissing}
              </li>
            ))}
          </ul>
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

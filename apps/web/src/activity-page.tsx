import { activityListSchema, displayDateToIso, readCookie, type ActivityList } from '@kmbhelp/shared';
import { useState, type FormEvent } from 'react';
import { getJson, RequestFailed } from './api.js';
import { useLocale } from './locale.js';
import { AdminLinks } from './operations-pages.js';

export function ActivityPage() {
  const { lang, copy } = useLocale();
  const [data, setData] = useState<ActivityList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const from = displayDateToIso(String(form.get('from') ?? '').trim());
    const to = displayDateToIso(String(form.get('to') ?? '').trim());
    if (
      (String(form.get('from') ?? '').trim() && !from) ||
      (String(form.get('to') ?? '').trim() && !to)
    ) {
      setError(copy.activityDate);
      return;
    }
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const q = String(form.get('q') ?? '').trim();
    if (q) params.set('q', q);
    setBusy(true);
    setError(null);
    try {
      const loaded = await getJson(
        `/api/v1/staff/activity${params.size ? `?${params.toString()}` : ''}`,
        activityListSchema.parse,
      );
      setData(loaded);
    } catch (caught) {
      setError(
        caught instanceof RequestFailed ? (caught.text?.[lang] ?? copy.loadFailed) : copy.loadFailed,
      );
    } finally {
      setBusy(false);
    }
  }

  async function download(format: 'txt' | 'csv' | 'pdf', form: HTMLFormElement) {
    const fields = new FormData(form);
    const params = new URLSearchParams();
    const from = displayDateToIso(String(fields.get('from') ?? '').trim());
    const to = displayDateToIso(String(fields.get('to') ?? '').trim());
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const q = String(fields.get('q') ?? '').trim();
    if (q) params.set('q', q);
    params.set('format', format);
    const token = readCookie(document.cookie, 'kmbhelp_csrf');
    const response = await fetch(`/api/v1/staff/activity?${params.toString()}`, {
      credentials: 'include',
      headers: token ? { 'x-kmbhelp-csrf': token } : {},
    });
    if (!response.ok) {
      setError(copy.loadFailed);
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kmbhelp-protokoll.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section>
      <AdminLinks />
      <h2>{copy.activityTitle}</h2>
      <p>{copy.activityLead}</p>
      <form className="form" onSubmit={(event) => void load(event)}>
        <label>
          {copy.activityFrom}
          <input name="from" inputMode="numeric" autoComplete="off" placeholder="dd.MM.yyyy" />
        </label>
        <label>
          {copy.activityTo}
          <input name="to" inputMode="numeric" autoComplete="off" placeholder="dd.MM.yyyy" />
        </label>
        <label>
          {copy.activitySearch}
          <input name="q" autoComplete="off" />
        </label>
        <div className="form-actions">
          <button type="submit" disabled={busy}>
            {copy.activityApply}
          </button>
          <button
            type="button"
            onClick={(event) => void download('txt', event.currentTarget.form as HTMLFormElement)}
          >
            {copy.activityExportTxt}
          </button>
          <button
            type="button"
            onClick={(event) => void download('csv', event.currentTarget.form as HTMLFormElement)}
          >
            {copy.activityExportCsv}
          </button>
          <button
            type="button"
            onClick={(event) => void download('pdf', event.currentTarget.form as HTMLFormElement)}
          >
            {copy.activityExportPdf}
          </button>
        </div>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {data && data.entries.length === 0 ? <p>{copy.activityEmpty}</p> : null}
      {data && data.entries.length > 0 ? (
        <ul className="ticket-list">
          {data.entries.map((entry) => (
            <li key={`${entry.at}-${entry.actor}-${entry.target}`}>
              <p>
                {entry.at} {entry.actor} {entry.kind}
              </p>
              <p>{entry.target}</p>
              <p>{entry.detail}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

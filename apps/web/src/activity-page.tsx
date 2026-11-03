import {
  displayDateToIso,
  isoDateToDisplay,
  logNames,
  logReportSchema,
  readCookie,
  type LogLine,
  type LogName,
} from '@kmbhelp/shared';
import { useEffect, useState } from 'react';
import { getJson, RequestFailed } from './api.js';
import { useLocale } from './locale.js';

const titles = {
  activity: 'logActivityTitle',
  error: 'logErrorTitle',
  mail: 'logMailTitle',
} as const;

export function ActivityPage() {
  const { lang, copy } = useLocale();
  const [from, setFrom] = useState(dayOffset(-7));
  const [to, setTo] = useState(dayOffset(0));
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState({ from: dayOffset(-7), to: dayOffset(0), q: '' });
  const [logs, setLogs] = useState<Record<LogName, LogLine[]>>({
    activity: [],
    error: [],
    mail: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void load(applied, (next, message) => {
      if (cancelled) return;
      setLogs(next);
      setError(message);
    });
    return () => {
      cancelled = true;
    };
  }, [applied, lang, copy.activityDate, copy.loadFailed]);

  async function load(
    filter: { from: string; to: string; q: string },
    done: (logs: Record<LogName, LogLine[]>, message: string | null) => void,
  ) {
    const fromIso = displayDateToIso(filter.from.trim());
    const toIso = displayDateToIso(filter.to.trim());
    if (!fromIso || !toIso) {
      done(emptyLogs(), copy.activityDate);
      return;
    }
    const params = new URLSearchParams({ from: fromIso, to: toIso });
    if (filter.q.trim()) params.set('q', filter.q.trim());
    setBusy(true);
    try {
      const loaded = await Promise.all(
        logNames.map((file) =>
          getJson(`/api/v1/staff/logs?file=${file}&${params.toString()}`, logReportSchema.parse),
        ),
      );
      const next = emptyLogs();
      for (const report of loaded) next[report.file] = report.lines;
      done(next, null);
    } catch (caught) {
      done(
        emptyLogs(),
        caught instanceof RequestFailed
          ? (caught.text?.[lang] ?? copy.loadFailed)
          : copy.loadFailed,
      );
    } finally {
      setBusy(false);
    }
  }

  async function download(file: LogName, format: 'csv' | 'pdf') {
    const fromIso = displayDateToIso(applied.from.trim());
    const toIso = displayDateToIso(applied.to.trim());
    if (!fromIso || !toIso) {
      setError(copy.activityDate);
      return;
    }
    const params = new URLSearchParams({ file, from: fromIso, to: toIso, format });
    if (applied.q.trim()) params.set('q', applied.q.trim());
    const token = readCookie(document.cookie, 'kmbhelp_csrf');
    const response = await fetch(`/api/v1/staff/logs?${params.toString()}`, {
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
    link.download = `kmbhelp-${file}.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section>
      <h2>{copy.activityTitle}</h2>
      <p>{copy.activityLead}</p>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied({ from, to, q });
        }}
      >
        <div className="date-pair">
          <label>
            {copy.activityFrom}
            <input
              name="from"
              inputMode="numeric"
              autoComplete="off"
              placeholder="dd.MM.yyyy"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label>
            {copy.activityTo}
            <input
              name="to"
              inputMode="numeric"
              autoComplete="off"
              placeholder="dd.MM.yyyy"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
        </div>
        <label>
          {copy.activitySearch}
          <input
            name="q"
            autoComplete="off"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </label>
        <div className="form-actions">
          <button type="submit" disabled={busy}>
            {copy.activityApply}
          </button>
        </div>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {logNames.map((file) => (
        <section key={file} className="log-block">
          <div className="log-head">
            <h3>{copy[titles[file]]}</h3>
            <div className="form-actions">
              <button type="button" onClick={() => void download(file, 'csv')}>
                {copy.activityExportCsv}
              </button>
              <button type="button" onClick={() => void download(file, 'pdf')}>
                {copy.activityExportPdf}
              </button>
            </div>
          </div>
          <div className="log-scroll">
            <table className="log-table">
              <thead>
                <tr>
                  <th>{copy.activityWhen}</th>
                  {file === 'error' ? (
                    <th>{copy.activityText}</th>
                  ) : (
                    <>
                      <th>{copy.activityActor}</th>
                      <th>{copy.activityKind}</th>
                      <th>{copy.activityTarget}</th>
                      <th>{copy.activityDetail}</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {logs[file].length === 0 ? (
                  <tr>
                    <td colSpan={file === 'error' ? 2 : 5}>{copy.activityEmpty}</td>
                  </tr>
                ) : (
                  logs[file].map((line) => (
                    <tr key={`${file}-${line.at}-${line.actor}-${line.target}-${line.detail}`}>
                      <td>{line.at}</td>
                      {file === 'error' ? (
                        <td>{line.detail}</td>
                      ) : (
                        <>
                          <td>{line.actor}</td>
                          <td>{line.kind}</td>
                          <td>{line.target}</td>
                          <td>{line.detail}</td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </section>
  );
}

function emptyLogs(): Record<LogName, LogLine[]> {
  return { activity: [], error: [], mail: [] };
}

function dayOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return isoDateToDisplay(`${date.getFullYear()}-${month}-${day}`);
}

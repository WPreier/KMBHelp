import { staffTicketViewSchema, type StaffTicketView } from '@kmbhelp/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getJson, RequestFailed } from './api.js';
import { useLocale } from './locale.js';

export function TicketPage() {
  const { number } = useParams();
  const { lang, copy } = useLocale();
  const [data, setData] = useState<StaffTicketView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);
    getJson(`/api/v1/staff/tickets/${number ?? ''}`, staffTicketViewSchema.parse)
      .then((loaded) => {
        if (!cancelled) setData(loaded);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof RequestFailed ? (caught.text?.[lang] ?? copy.loadFailed) : copy.loadFailed);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [copy.loadFailed, lang, number]);

  return (
    <section>
      <p>
        <Link to="/mitarbeit/dashboard">{copy.ticketBack}</Link>
      </p>
      <h2>
        {copy.ticketTitle} {number}
      </h2>
      {error ? <p role="alert">{error}</p> : null}
      {data ? (
        <>
          <p>{data.subject}</p>
          <p>
            {(lang === 'de' ? data.categoryLabelDe : data.categoryLabelEn)} · {data.priority} · {data.status} ·{' '}
            {data.source}
          </p>
          <h3>{copy.ticketRequester}</h3>
          <p>
            {data.requesterName ?? copy.dashboardNone}
            {data.requesterEmail ? ` · ${data.requesterEmail}` : ''}
          </p>
          <h3>{copy.ticketBody}</h3>
          <p>{data.body}</p>
          {data.remote ? (
            <>
              <h3>{copy.dashboardRemote}</h3>
              <p>
                {copy.dashboardSupplier}: {data.remote.supplierName}
              </p>
              <p>
                {copy.dashboardAccount}: {data.remote.accountName ?? copy.dashboardNone}
              </p>
              <p>
                {copy.dashboardWindow}: {when(data.remote.windowStart, lang)} – {when(data.remote.windowEnd, lang)}
              </p>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function when(value: string | null, lang: 'de' | 'en'): string {
  if (!value) return '–';
  return new Date(value).toLocaleString(lang === 'de' ? 'de-AT' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

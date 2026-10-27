import {
  dashboardRanges,
  dashboardSchema,
  pieSliceKeys,
  type DashboardRange,
  type DashboardReport,
  type PieSliceKey,
} from '@kmbhelp/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getJson, RequestFailed } from './api.js';
import { useLocale } from './locale.js';

const labels: Record<DashboardRange, 'dashboardDay' | 'dashboardWeek' | 'dashboardMonth' | 'dashboardQuarter' | 'dashboardYear'> = {
  day: 'dashboardDay',
  week: 'dashboardWeek',
  month: 'dashboardMonth',
  quarter: 'dashboardQuarter',
  year: 'dashboardYear',
};

const sliceLabel = {
  mail: 'dashboardSliceMail',
  web: 'dashboardSliceWeb',
  done: 'dashboardSliceDone',
  p1: 'dashboardSliceP1',
  p2: 'dashboardSliceP2',
  p3: 'dashboardSliceP3',
} as const;

const sliceColor: Record<PieSliceKey, string> = {
  mail: '#1B4F72',
  web: '#1D6B45',
  done: '#5C6B73',
  p1: '#8E2F2F',
  p2: '#A86B12',
  p3: '#3E5C76',
};

export function DashboardPage() {
  const { lang, copy } = useLocale();
  const [range, setRange] = useState<DashboardRange>('month');
  const [data, setData] = useState<DashboardReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getJson(`/api/v1/staff/dashboard?range=${range}`, dashboardSchema.parse)
      .then((loaded) => {
        if (!cancelled) setData(loaded);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setData(null);
          setError(
            caught instanceof RequestFailed ? (caught.text?.[lang] ?? copy.loadFailed) : copy.loadFailed,
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [copy.loadFailed, lang, range]);

  return (
    <section>
      <h2>{copy.dashboardTitle}</h2>
      <p>{data?.scope === 'own' ? copy.dashboardOwn : copy.dashboardFirm}</p>
      <div className="form-actions" role="group" aria-label={copy.dashboardRange}>
        {dashboardRanges.map((entry) => (
          <button
            key={entry}
            type="button"
            aria-pressed={range === entry}
            onClick={() => setRange(entry)}
          >
            {copy[labels[entry]]}
          </button>
        ))}
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {data ? (
        <>
          <p>{copy.dashboardPieLead}</p>
          <div className="pie-wrap">
            <PieChart slices={data.slices} caption={sliceText(data, copy)} />
            <ul className="pie-legend">
              {pieSliceKeys.map((key) => {
                const slice = data.slices.find((entry) => entry.key === key);
                return (
                  <li key={key}>
                    <span className="pie-swatch" style={{ background: sliceColor[key] }} />
                    <span>
                      {copy[sliceLabel[key]]}: {slice?.count ?? 0} ({slice?.percent ?? 0}%)
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <dl className="ticket-list">
            <div>
              <dt>{copy.dashboardResponse}</dt>
              <dd>{data.medianFirstResponseMinutes ?? copy.dashboardNone}</dd>
            </div>
            <div>
              <dt>{copy.dashboardResolution}</dt>
              <dd>{data.medianResolutionMinutes ?? copy.dashboardNone}</dd>
            </div>
            <div>
              <dt>{copy.dashboardEffort}</dt>
              <dd>{data.effortMinutes}</dd>
            </div>
          </dl>
          <h3>{copy.dashboardRemote}</h3>
          {data.remoteOverruns.length === 0 ? <p>{copy.dashboardNone}</p> : null}
          {data.remoteOverruns.map((row) => (
            <article className="remote-case" key={row.number}>
              <Link to={`/mitarbeit/ticket/${row.number}`}>
                {copy.dashboardOpenTicket} {row.number}: {row.subject}
              </Link>
              <span>
                {(lang === 'de' ? row.categoryLabelDe : row.categoryLabelEn)} · {row.priority} · {row.status}
              </span>
              <span>
                {copy.dashboardSupplier}: {row.supplierName}
              </span>
              <span>
                {copy.dashboardAccount}: {row.accountName ?? copy.dashboardNone}
              </span>
              <span>
                {copy.dashboardWindow}: {when(row.windowStart, lang)} – {when(row.windowEnd, lang)}
              </span>
            </article>
          ))}
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

function sliceText(
  data: DashboardReport,
  copy: Record<(typeof sliceLabel)[PieSliceKey], string>,
): string {
  return data.slices
    .map((slice) => `${copy[sliceLabel[slice.key]]} ${slice.count} ${slice.percent}%`)
    .join(', ');
}

function PieChart({ slices, caption }: { slices: DashboardReport['slices']; caption: string }) {
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  const cx = 200;
  const cy = 200;
  const radius = 118;
  let angle = -Math.PI / 2;
  const drawn = slices.filter((slice) => slice.count > 0);
  const parts = drawn.map((slice) => {
    const sweep = (slice.count / total) * Math.PI * 2;
    const start = angle;
    angle += sweep;
    return { slice, start, end: angle, sweep };
  });
  return (
    <svg viewBox="0 0 400 400" role="img" aria-label={caption}>
      {total === 0 ? (
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="currentColor" />
      ) : parts.length === 1 && parts[0] ? (
        <circle cx={cx} cy={cy} r={radius} fill={sliceColor[parts[0].slice.key]} />
      ) : (
        parts.map((part) => (
          <path key={part.slice.key} d={wedge(cx, cy, radius, part.start, part.end)} fill={sliceColor[part.slice.key]} />
        ))
      )}
      {parts.map((part) => {
        const mid = (part.start + part.end) / 2;
        const inside = part.sweep >= 0.55;
        const distance = inside ? radius * 0.62 : radius + 36;
        const x = cx + Math.cos(mid) * distance;
        const y = cy + Math.sin(mid) * distance;
        return (
          <text
            key={`${part.slice.key}-label`}
            x={x}
            y={y}
            textAnchor="middle"
            fill={inside ? '#ffffff' : 'currentColor'}
            fontSize="13"
            fontFamily="system-ui, sans-serif"
          >
            <tspan x={x} dy="-0.35em">
              {part.slice.count}
            </tspan>
            <tspan x={x} dy="1.25em">
              {part.slice.percent}%
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

function wedge(cx: number, cy: number, radius: number, start: number, end: number): string {
  const x1 = cx + radius * Math.cos(start);
  const y1 = cy + radius * Math.sin(start);
  const x2 = cx + radius * Math.cos(end);
  const y2 = cy + radius * Math.sin(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`;
}

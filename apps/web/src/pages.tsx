import {
  assignableStaffSchema,
  availabilitySchema,
  categoryListSchema,
  createdTicketSchema,
  faqArticleSchema,
  faqListSchema,
  isoDateToDisplay,
  knowledgeArticleSchema,
  publicLinkTargets,
  publicTicketListSchema,
  publicTicketStateSchema,
  searchResultSchema,
  type CategoryOption,
  type CreatedTicket,
  type PriorityReason,
  type PublicTicket,
} from '@kmbhelp/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getJson, postJson, RequestFailed } from './api.js';
import { formatAge, priorityLabel, reasonLabel } from './format.js';
import { useLocale } from './locale.js';

const firmLinks = publicLinkTargets({
  www: import.meta.env.VITE_PUBLIC_URL_WWW,
  home: import.meta.env.VITE_PUBLIC_URL_HOME,
  wiki: import.meta.env.VITE_PUBLIC_URL_WIKI,
});
const firmLinksMissing = !firmLinks.www || !firmLinks.home || !firmLinks.wiki;

function weekDays(lang: 'de' | 'en'): Array<{ key: string; label: string }> {
  const start = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const label = new Intl.DateTimeFormat(lang === 'de' ? 'de-AT' : 'en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    }).format(day);
    return { key: day.toISOString().slice(0, 10), label };
  });
}

export function HomePage() {
  const { lang, copy } = useLocale();
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [tickets, setTickets] = useState<PublicTicket[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedTicket | null>(null);
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [askNotice, setAskNotice] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<{ id: string; displayName: string }[]>([]);
  const [staffId, setStaffId] = useState('');
  const [availability, setAvailability] = useState<{
    configured: boolean;
    windows: { start: string; end: string }[];
    textDe: string;
    textEn: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getJson('/api/v1/categories', (value) => categoryListSchema.parse(value)),
      getJson('/api/v1/tickets/public', (value) => publicTicketListSchema.parse(value)),
    ])
      .then(([categoryBody, ticketBody]) => {
        if (cancelled) return;
        setCategories(categoryBody.categories);
        setTickets(ticketBody.tickets);
        setLoadError(false);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [created, revision]);

  useEffect(() => {
    let cancelled = false;
    getJson('/api/v1/staff/assignable', assignableStaffSchema.parse)
      .then((body) => {
        if (!cancelled) {
          setAssignees(body.staff.filter((person) => person.active));
        }
      })
      .catch(() => {
        if (!cancelled) setAssignees([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (staffId === '') {
      setAvailability(null);
      return;
    }
    let cancelled = false;
    getJson(`/api/v1/staff/${staffId}/availability`, availabilitySchema.parse)
      .then((body) => {
        if (!cancelled) setAvailability(body);
      })
      .catch(() => {
        if (!cancelled) setAvailability(null);
      });
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setFormError(null);
    try {
      const result = await postJson(
        '/api/v1/tickets',
        {
          categoryCode: String(data.get('categoryCode') ?? ''),
          impact: String(data.get('impact') ?? ''),
          subject: String(data.get('subject') ?? ''),
          body: String(data.get('body') ?? ''),
          requesterName: String(data.get('requesterName') ?? ''),
          assignedStaffId: staffId,
          dueOn: String(data.get('dueOn') ?? ''),
          clientPriority: String(data.get('clientPriority') ?? ''),
          source: 'web',
        },
        (value) => createdTicketSchema.parse(value),
      );
      setCreated(result);
      setStaffId('');
      form.reset();
    } catch (error) {
      const text = error instanceof RequestFailed ? error.text : null;
      setFormError(text ? text[lang] : copy.sendFailed);
    } finally {
      setPending(false);
    }
  }

  async function askTicket(number: number) {
    setAskNotice(null);
    setActionError(null);
    try {
      await postJson(`/api/v1/tickets/public/${number}/ask`, {}, (value) => value);
      setAskNotice(copy.mailSent);
    } catch (error) {
      const text = error instanceof RequestFailed ? error.text : null;
      setActionError(text ? text[lang] : copy.sendFailed);
    }
  }

  async function changeTicket(number: number, body: { action: string; priority?: string }) {
    setActionError(null);
    try {
      await postJson(`/api/v1/tickets/public/${number}`, body, (value) =>
        publicTicketStateSchema.parse(value),
      );
      setRevision((value) => value + 1);
    } catch (error) {
      const text = error instanceof RequestFailed ? error.text : null;
      setActionError(text ? text[lang] : copy.sendFailed);
    }
  }

  const groups = new Map<string, PublicTicket[]>();
  for (const entry of tickets) {
    const list = groups.get(entry.groupCode) ?? [];
    list.push(entry);
    groups.set(entry.groupCode, list);
  }

  return (
    <>
      {firmLinksMissing ? <p>{copy.linksMissing}</p> : null}
      <h2>{copy.fileTicket}</h2>
      <form className="form" onSubmit={onSubmit}>
        <label>
          {copy.category}
          <select
            key={categories[0]?.code ?? 'empty'}
            name="categoryCode"
            required
            defaultValue={categories[0]?.code ?? ''}
          >
            <option value=""></option>
            {categories.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {lang === 'de' ? entry.groupLabelDe : entry.groupLabelEn}
                {' / '}
                {lang === 'de' ? entry.labelDe : entry.labelEn}
              </option>
            ))}
          </select>
        </label>
        <label>
          {copy.impact}
          <select name="impact" required defaultValue="workplace">
            <option value=""></option>
            <option value="filing">{copy.impactFiling}</option>
            <option value="payroll">{copy.impactPayroll}</option>
            <option value="workplace">{copy.impactWorkplace}</option>
            <option value="cosmetic">{copy.impactCosmetic}</option>
          </select>
        </label>
        <label>
          {copy.subject}
          <input name="subject" required maxLength={200} />
        </label>
        <label>
          {copy.description}
          <textarea name="body" required maxLength={8000} />
        </label>
        <label>
          {copy.dueOn}
          <input
            name="dueOn"
            inputMode="numeric"
            placeholder="dd.MM.yyyy"
            maxLength={10}
            pattern="\d{2}\.\d{2}\.\d{4}"
          />
        </label>
        <label>
          {copy.name}
          <input name="requesterName" maxLength={200} autoComplete="name" />
        </label>
        <label>
          {copy.assignee}
          <select
            name="assignedStaffId"
            value={staffId}
            onChange={(event) => setStaffId(event.target.value)}
          >
            <option value="">{copy.priorityUnset}</option>
            {assignees.map((person) => (
              <option key={person.id} value={person.id}>
                {person.displayName}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>{copy.calendarTitle}</legend>
          <div className="week">
            {weekDays(lang).map((day) => (
              <div key={day.key}>{day.label}</div>
            ))}
          </div>
          {availability ? <p>{lang === 'de' ? availability.textDe : availability.textEn}</p> : null}
          {availability && availability.windows.length > 0 ? (
            <ul>
              {availability.windows.map((window) => (
                <li key={`${window.start}-${window.end}`}>
                  {window.start} – {window.end}
                </li>
              ))}
            </ul>
          ) : null}
        </fieldset>
        <label>
          {copy.reportedPriority}
          <select name="clientPriority" defaultValue="">
            <option value="">{copy.priorityUnset}</option>
            <option value="p1">{copy.priorityP1}</option>
            <option value="p2">{copy.priorityP2}</option>
            <option value="p3">{copy.priorityP3}</option>
          </select>
        </label>
        <p>{copy.priorityHint}</p>
        {formError ? <p role="alert">{formError}</p> : null}
        <div className="form-actions">
          <button type="submit" disabled={pending}>
            {copy.submit}
          </button>
          <button
            type="button"
            onClick={(event) => {
              const form = event.currentTarget.form;
              if (!form) return;
              for (const field of form.elements) {
                if (
                  field instanceof HTMLInputElement ||
                  field instanceof HTMLTextAreaElement ||
                  field instanceof HTMLSelectElement
                ) {
                  field.value = '';
                }
              }
            }}
          >
            {copy.reset}
          </button>
        </div>
      </form>
      {created ? (
        <section aria-live="polite">
          <h2>
            {copy.ticketCreated} {created.number}
          </h2>
          <p>
            {priorityLabel(created.priority, copy)}.{' '}
            {reasonLabel(created.priorityReason as PriorityReason, copy)}
          </p>
        </section>
      ) : null}
      <h2>{copy.openTickets}</h2>
      {loadError ? <p role="alert">{copy.loadFailed}</p> : null}
      {actionError ? <p role="alert">{actionError}</p> : null}
      {askNotice ? <p role="status">{askNotice}</p> : null}
      {tickets.length === 0 && !loadError ? <p>{copy.noOpenTickets}</p> : null}
      {[...groups.entries()].map(([groupCode, entries]) => (
        <section className="group" key={groupCode}>
          <h3>{lang === 'de' ? entries[0]?.groupLabelDe : entries[0]?.groupLabelEn}</h3>
          <div className="ticket-panel">
            <table className="ticket-table">
              <thead>
                <tr>
                  <th scope="col">{copy.ticketId}</th>
                  <th scope="col">{copy.ticketText}</th>
                  <th scope="col">{copy.staffMark}</th>
                  <th scope="col">{copy.age}</th>
                  <th scope="col">{copy.dueUntil}:</th>
                  <th scope="col">
                    <span className="visually-hidden">{copy.markOpen}</span>
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">{copy.priority}</span>
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">{copy.done}</span>
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">{copy.askStaffTitle}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const switchTitle =
                    entry.status === 'inactive' ? copy.reopenTitle : copy.deactivateTitle;
                  const locked = entry.status === 'closed' || entry.status === 'expired';
                  return (
                    <tr key={entry.number}>
                      <td>{entry.number}</td>
                      <td className="ticket-text" title={entry.subject}>
                        {entry.subject}
                      </td>
                      <td>{entry.staffMark ?? ''}</td>
                      <td>{formatAge(entry.ageSeconds, copy)}</td>
                      <td>{entry.dueOn ? isoDateToDisplay(entry.dueOn) : copy.noDue}</td>
                      <td>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={entry.status === 'open'}
                            disabled={locked}
                            title={switchTitle}
                            aria-label={switchTitle}
                            onChange={() => {
                              void changeTicket(entry.number, { action: 'toggle' });
                            }}
                          />
                          {copy.markOpen}
                        </label>
                      </td>
                      <td>
                        <select
                          value={entry.priority}
                          title={copy.priorityTitle}
                          aria-label={copy.priorityTitle}
                          disabled={entry.status === 'closed'}
                          onChange={(event) => {
                            void changeTicket(entry.number, {
                              action: 'priority',
                              priority: event.target.value,
                            });
                          }}
                        >
                          <option value="p1">{copy.priorityP1}</option>
                          <option value="p2">{copy.priorityP2}</option>
                          <option value="p3">{copy.priorityP3}</option>
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          title={copy.closeTitle}
                          aria-label={copy.done}
                          disabled={entry.status === 'closed'}
                          onClick={() => {
                            void changeTicket(entry.number, { action: 'close' });
                          }}
                        >
                          <CheckIcon />
                        </button>
                      </td>
                      <td>
                        {entry.status === 'open' ? (
                          <button
                            type="button"
                            title={copy.askStaffTitle}
                            aria-label={copy.askStaffTitle}
                            onClick={() => {
                              void askTicket(entry.number);
                            }}
                          >
                            {copy.askStaff}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}

export function FaqListPage() {
  const { lang, copy } = useLocale();
  const [titles, setTitles] = useState<{ slug: string; title: string }[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJson('/api/v1/faq', (value) => faqListSchema.parse(value))
      .then((body) => {
        if (cancelled) return;
        setTitles(
          body.articles.map((article) => ({
            slug: article.slug,
            title: lang === 'de' ? article.titleDe : article.titleEn,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  return (
    <>
      <h1>{copy.guides}</h1>
      {failed ? <p role="alert">{copy.loadFailed}</p> : null}
      {titles.length === 0 && !failed ? <p>{copy.noGuides}</p> : null}
      <ul className="ticket-list">
        {titles.map((article) => (
          <li key={article.slug}>
            <Link to={`/faq/${article.slug}`}>{article.title}</Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function FaqPage() {
  const { slug = '' } = useParams();
  const { lang, copy } = useLocale();
  const [article, setArticle] = useState<{ title: string; body: string } | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJson(`/api/v1/faq/${encodeURIComponent(slug)}`, (value) => faqArticleSchema.parse(value))
      .then((body) => {
        if (cancelled) return;
        setArticle({
          title: lang === 'de' ? body.titleDe : body.titleEn,
          body: lang === 'de' ? body.bodyDe : body.bodyEn,
        });
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [lang, slug]);

  if (missing) return <MissingPage />;
  return (
    <>
      <h1>{article?.title ?? copy.guides}</h1>
      <p>{article?.body ?? ''}</p>
    </>
  );
}

export function ArticlePage() {
  const { id = '' } = useParams();
  const { copy } = useLocale();
  const [article, setArticle] = useState<{ title: string; body: string } | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJson(`/api/v1/knowledge/${encodeURIComponent(id)}`, (value) =>
      knowledgeArticleSchema.parse(value),
    )
      .then((body) => {
        if (!cancelled) setArticle(body);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (missing) return <MissingPage />;
  return (
    <>
      <h1>{article?.title ?? copy.guides}</h1>
      <p>{article?.body ?? ''}</p>
    </>
  );
}

export function SearchPage() {
  const { lang, copy } = useLocale();
  const [params] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const [hits, setHits] = useState<{ title: string; href: string | null; sentence: string }[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    getJson(`/api/v1/search?q=${encodeURIComponent(q)}`, (value) => searchResultSchema.parse(value))
      .then((body) => {
        if (cancelled) return;
        setHits(
          body.hits.map((hit) => ({
            title: lang === 'de' ? hit.titleDe : hit.titleEn,
            href: hit.href,
            sentence: lang === 'de' ? hit.sentenceDe : hit.sentenceEn,
          })),
        );
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [lang, q]);

  return (
    <>
      <h1>{copy.searchResults}</h1>
      {failed ? <p role="alert">{copy.loadFailed}</p> : null}
      {q.length >= 2 && hits.length === 0 && !failed ? <p>{copy.noHits}</p> : null}
      <ul className="ticket-list">
        {hits.map((hit) => (
          <li key={`${hit.href ?? 'ticket'}-${hit.title}`}>
            {hit.href ? <Link to={hit.href}>{hit.title}</Link> : <span>{hit.title}</span>}
            <p>{hit.sentence}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M5 12.5 9.2 17 19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MissingPage() {
  const { copy } = useLocale();
  return (
    <>
      <h1>{copy.pageMissing}</h1>
      <p>
        <Link to="/">{copy.homeLink}</Link>
      </p>
    </>
  );
}

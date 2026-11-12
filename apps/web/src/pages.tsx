import {
  helpdeskAssigneeEmail,
  helpdeskRosterSchema,
  categoryListSchema,
  createdTicketSchema,
  faqArticleSchema,
  faqListSchema,
  isoDateToDisplay,
  knowledgeArticleSchema,
  publicLinkTargets,
  publicTicketListSchema,
  publicTicketStateSchema,
  sessionViewSchema,
  searchResultSchema,
  type CategoryOption,
  type CreatedTicket,
  type PriorityReason,
  type PublicTicket,
} from '@kmbhelp/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getJson, postJson, RequestFailed } from './api.js';
import { priorityLabel, reasonLabel } from './format.js';
import { Hint } from './hint.js';
import { useLocale } from './locale.js';

const firmLinks = publicLinkTargets({
  www: import.meta.env.VITE_PUBLIC_URL_WWW,
  home: import.meta.env.VITE_PUBLIC_URL_HOME,
  wiki: import.meta.env.VITE_PUBLIC_URL_WIKI,
});
const firmLinksMissing = !firmLinks.www || !firmLinks.home || !firmLinks.wiki;

function useSessionAccess(): { mayClose: boolean; mayAssign: boolean } {
  const [access, setAccess] = useState({ mayClose: true, mayAssign: false });
  useEffect(() => {
    getJson('/api/v1/auth/session', sessionViewSchema.parse)
      .then((session) =>
        setAccess({
          mayClose: session.audience !== 'user',
          mayAssign: session.audience === 'administrator' || session.internalAdmin,
        }),
      )
      .catch(() => setAccess({ mayClose: true, mayAssign: false }));
  }, []);
  return access;
}

export function HomePage() {
  const { lang, copy } = useLocale();
  const { mayClose, mayAssign } = useSessionAccess();
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedTicket | null>(null);
  const [pending, setPending] = useState(false);
  const [assigneeEmail, setAssigneeEmail] = useState(helpdeskAssigneeEmail);
  const [roster, setRoster] = useState<Array<{ displayName: string; email: string }>>([]);
  const [askNotice, setAskNotice] = useState<string | null>(null);
  const [askConfirm, setAskConfirm] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{
    message: string;
    run: () => void;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJson('/api/v1/categories', (value) => categoryListSchema.parse(value))
      .then((categoryBody) => {
        if (cancelled) return;
        setCategories(categoryBody.categories);
        setLoadError(false);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    getJson('/api/v1/tickets/assignees', (value) => helpdeskRosterSchema.parse(value))
      .then((body) => {
        if (!cancelled) setRoster(body.staff);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPendingConfirm({
      message: copy.confirmCreate,
      run: () => {
        void createTicket(form);
      },
    });
  }

  async function createTicket(form: HTMLFormElement) {
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
          assigneeEmail,
          dueOn: String(data.get('dueOn') ?? '').trim(),
          clientPriority: String(data.get('clientPriority') ?? ''),
          source: 'web',
        },
        (value) => createdTicketSchema.parse(value),
      );
      setCreated(result);
      form.reset();
      setAssigneeEmail(helpdeskAssigneeEmail);
      return result;
    } catch (error) {
      const text = error instanceof RequestFailed ? error.text : null;
      setFormError(text ? text[lang] : copy.sendFailed);
      return null;
    } finally {
      setPending(false);
    }
  }

  async function createAndClose(form: HTMLFormElement) {
    const result = await createTicket(form);
    if (!result) return;
    try {
      await postJson(`/api/v1/tickets/public/${result.number}`, { action: 'close' }, (value) =>
        publicTicketStateSchema.parse(value),
      );
      setAskNotice(copy.closeQueued);
    } catch (error) {
      const text = error instanceof RequestFailed ? error.text : null;
      setFormError(text ? text[lang] : copy.sendFailed);
    }
  }

  async function askCreated() {
    if (!created) return;
    setAskNotice(null);
    setFormError(null);
    try {
      await postJson(`/api/v1/tickets/public/${created.number}/ask`, {}, (value) => value);
      setAskNotice(copy.mailSent);
    } catch (error) {
      const text = error instanceof RequestFailed ? error.text : null;
      setFormError(text ? text[lang] : copy.sendFailed);
    }
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
          <input name="dueOn" type="text" inputMode="numeric" placeholder="dd.MM.yyyy" />
        </label>
        <div className="field">
          <span>{copy.assignedStaff}</span>
          <span className="assignee-line">
            <Hint text={created ? copy.askStaffTitle : copy.askNeedsTicket}>
              <button
                type="button"
                aria-label={copy.askStaffTitle}
                disabled={!created}
                onClick={() => setAskConfirm(true)}
              >
                {copy.askStaff}
              </button>
            </Hint>
            <select
              name="assigneeEmail"
              aria-label={copy.assignedStaff}
              value={assigneeEmail}
              disabled={!mayAssign}
              onChange={(event) => {
                const next = event.target.value;
                if (next === assigneeEmail) return;
                setPendingConfirm({
                  message: copy.confirmAssignee,
                  run: () => setAssigneeEmail(next),
                });
              }}
            >
              {assigneeChoices(roster, assigneeEmail).map((person) => (
                <option key={person.email} value={person.email}>
                  {person.displayName} ({person.email})
                </option>
              ))}
            </select>
          </span>
        </div>
        <label>
          {copy.name}
          <input name="requesterName" maxLength={200} autoComplete="name" />
        </label>
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
        {askNotice ? <p role="status">{askNotice}</p> : null}
        <div className="form-actions">
          <Hint text={copy.submitTitle}>
            <button type="submit" disabled={pending}>
              {copy.submit}
            </button>
          </Hint>
          {mayClose ? (
            <Hint text={copy.confirmFinish}>
              <button
                type="button"
                disabled={pending}
                onClick={(event) => {
                  const form = event.currentTarget.form;
                  if (!form) return;
                  setPendingConfirm({
                    message: copy.confirmFinish,
                    run: () => {
                      void createAndClose(form);
                    },
                  });
                }}
              >
                {copy.closeTicket}
              </button>
            </Hint>
          ) : null}
          <Hint text={copy.resetTitle}>
            <button
              type="button"
              onClick={(event) => {
                const form = event.currentTarget.form;
                if (!form) return;
                setAssigneeEmail(helpdeskAssigneeEmail);
                for (const field of form.elements) {
                  if (
                    field instanceof HTMLInputElement ||
                    field instanceof HTMLTextAreaElement ||
                    field instanceof HTMLSelectElement
                  ) {
                    if (field.name === 'assigneeEmail') continue;
                    field.value = '';
                  }
                }
              }}
            >
              {copy.reset}
            </button>
          </Hint>
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
      {loadError ? <p role="alert">{copy.loadFailed}</p> : null}
      <OpenTicketList refreshToken={created?.number ?? 0} />
      {askConfirm ? (
        <ConfirmDialog
          message={copy.confirmAsk}
          yesLabel={copy.confirmYes}
          noLabel={copy.confirmNo}
          onYes={() => {
            setAskConfirm(false);
            void askCreated();
          }}
          onNo={() => setAskConfirm(false)}
        />
      ) : null}
      {pendingConfirm ? (
        <ConfirmDialog
          message={pendingConfirm.message}
          yesLabel={copy.confirmYes}
          noLabel={copy.confirmNo}
          onYes={() => {
            const run = pendingConfirm.run;
            setPendingConfirm(null);
            run();
          }}
          onNo={() => setPendingConfirm(null)}
        />
      ) : null}
    </>
  );
}

export function OpenTicketsPage() {
  return <OpenTicketList refreshToken={0} />;
}

export function MyOpenTicketsPage() {
  return <OpenTicketList refreshToken={0} mine />;
}

export function OpenTicketList({
  refreshToken,
  mine = false,
}: {
  refreshToken: number;
  mine?: boolean;
}) {
  const { lang, copy } = useLocale();
  const { mayClose } = useSessionAccess();
  const [tickets, setTickets] = useState<PublicTicket[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [askNotice, setAskNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [pendingConfirm, setPendingConfirm] = useState<{
    message: string;
    run: () => void;
  } | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null | undefined>(
    mine ? undefined : null,
  );

  useEffect(() => {
    if (!mine) return;
    let cancelled = false;
    getJson('/api/v1/auth/session', (value) => sessionViewSchema.parse(value))
      .then((session) => {
        if (cancelled) return;
        setAccountEmail(session.signedIn && session.email ? session.email : null);
      })
      .catch(() => {
        if (!cancelled) setAccountEmail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [mine]);

  useEffect(() => {
    let cancelled = false;
    getJson('/api/v1/tickets/public', (value) => publicTicketListSchema.parse(value))
      .then((body) => {
        if (cancelled) return;
        setTickets(body.tickets);
        setLoadError(false);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken, revision]);

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

  const visible = mine
    ? tickets.filter(
        (entry) =>
          accountEmail !== null &&
          accountEmail !== undefined &&
          entry.assigneeEmail.toLowerCase() === accountEmail.toLowerCase(),
      )
    : tickets;
  const groups = new Map<string, PublicTicket[]>();
  for (const entry of visible) {
    const list = groups.get(entry.groupCode) ?? [];
    list.push(entry);
    groups.set(entry.groupCode, list);
  }

  return (
    <>
      <h2>{mine ? copy.myOpenTickets : copy.openTickets}</h2>
      {loadError ? <p role="alert">{copy.loadFailed}</p> : null}
      {actionError ? <p role="alert">{actionError}</p> : null}
      {askNotice ? <p role="status">{askNotice}</p> : null}
      {mine && accountEmail === null ? <p>{copy.myOpenSignedOut}</p> : null}
      {visible.length === 0 && !loadError && (!mine || accountEmail) ? (
        <p>{mine ? copy.myOpenEmpty : copy.noOpenTickets}</p>
      ) : null}
      {[...groups.entries()].map(([groupCode, entries]) => (
        <section className="group" key={groupCode}>
          <h3>{lang === 'de' ? entries[0]?.groupLabelDe : entries[0]?.groupLabelEn}</h3>
          <div className="ticket-panel">
            <div className="ticket-scroll">
              <table className="ticket-table">
                <thead>
                  <tr>
                    <th className="col-id" scope="col">
                      {copy.ticketId}
                    </th>
                    <th className="col-assignee" scope="col">
                      {copy.assignedStaff}
                    </th>
                    <th className="col-text" scope="col">
                      {copy.ticketText}
                    </th>
                    <th className="col-due" scope="col">
                      {copy.dueUntil}
                    </th>
                    <th className="col-open" scope="col">
                      {copy.ticketOpen}
                    </th>
                    <th className="col-priority" scope="col">
                      {copy.priority}
                    </th>
                    {mayClose ? (
                      <th className="col-done" scope="col">
                        {copy.doneHead}
                      </th>
                    ) : null}
                    <th className="col-ask" scope="col">
                      {copy.askHead}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const switchTitle =
                      entry.status === 'inactive' ? copy.reopenTitle : copy.deactivateTitle;
                    const locked =
                      entry.status === 'closed' ||
                      entry.status === 'expired' ||
                      entry.closeRequested;
                    return (
                      <tr key={entry.number}>
                        <td className="col-id">
                          <Link to={`/ticket/${entry.code}`}>{entry.code}</Link>
                        </td>
                        <td className="col-assignee" title={entry.assigneeEmail}>
                          {entry.assigneeEmail}
                        </td>
                        <td className="col-text ticket-text">
                          <Hint text={entry.subject}>{entry.subject}</Hint>
                        </td>
                        <td className="col-due">
                          {entry.dueOn ? isoDateToDisplay(entry.dueOn) : copy.noDue}
                        </td>
                        <td className="col-open">
                          <Hint text={switchTitle}>
                            <label className="check">
                              <input
                                type="checkbox"
                                checked={entry.status === 'open'}
                                disabled={locked}
                                aria-label={copy.ticketOpen}
                                onChange={() => {
                                  void changeTicket(entry.number, { action: 'toggle' });
                                }}
                              />
                            </label>
                          </Hint>
                        </td>
                        <td className="col-priority">
                          <Hint text={copy.priorityTitle}>
                            <select
                              value={entry.priority}
                              aria-label={copy.priorityTitle}
                              disabled={locked}
                              onChange={(event) => {
                                const priority = event.target.value;
                                setPendingConfirm({
                                  message: copy.confirmPriority,
                                  run: () => {
                                    void changeTicket(entry.number, {
                                      action: 'priority',
                                      priority,
                                    });
                                  },
                                });
                              }}
                            >
                              <option value="p1">{copy.priorityP1}</option>
                              <option value="p2">{copy.priorityP2}</option>
                              <option value="p3">{copy.priorityP3}</option>
                            </select>
                          </Hint>
                        </td>
                        {mayClose ? (
                          <td className="col-done">
                            <Hint text={copy.closeTitle}>
                              <button
                                type="button"
                                aria-label={entry.closeRequested ? copy.closeQueued : copy.done}
                                disabled={locked}
                                onClick={() => {
                                  setPendingConfirm({
                                    message: copy.confirmClose,
                                    run: () => {
                                      void changeTicket(entry.number, { action: 'close' });
                                    },
                                  });
                                }}
                              >
                                <CheckIcon />
                              </button>
                            </Hint>
                          </td>
                        ) : null}
                        <td className="col-ask">
                          {entry.status === 'open' ? (
                            <Hint text={copy.askStaffTitle}>
                              <button
                                type="button"
                                aria-label={copy.askStaffTitle}
                                onClick={() => {
                                  setPendingConfirm({
                                    message: copy.confirmAsk,
                                    run: () => {
                                      void askTicket(entry.number);
                                    },
                                  });
                                }}
                              >
                                {copy.askStaff}
                              </button>
                            </Hint>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ))}
      {pendingConfirm ? (
        <ConfirmDialog
          message={pendingConfirm.message}
          yesLabel={copy.confirmYes}
          noLabel={copy.confirmNo}
          onYes={() => {
            const run = pendingConfirm.run;
            setPendingConfirm(null);
            run();
          }}
          onNo={() => setPendingConfirm(null)}
        />
      ) : null}
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
  const scope = params.get('scope') ?? '';
  const chosen = scope === 'verdict' || scope === 'summary' || scope === 'ticket' ? scope : '';
  const [hits, setHits] = useState<{ title: string; href: string | null; sentence: string }[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const address = chosen
      ? `/api/v1/search?q=${encodeURIComponent(q)}&scope=${chosen}`
      : `/api/v1/search?q=${encodeURIComponent(q)}`;
    getJson(address, (value) => searchResultSchema.parse(value))
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
  }, [chosen, lang, q]);

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

function assigneeChoices(
  roster: Array<{ displayName: string; email: string }>,
  current: string,
): Array<{ displayName: string; email: string }> {
  const rows = [...roster];
  const known = () => new Set(rows.map((person) => person.email.toLowerCase()));
  if (!known().has(helpdeskAssigneeEmail)) {
    rows.unshift({ displayName: helpdeskAssigneeEmail, email: helpdeskAssigneeEmail });
  }
  if (current && !known().has(current.toLowerCase())) {
    rows.push({ displayName: current, email: current });
  }
  return rows;
}

function ConfirmDialog({
  message,
  yesLabel,
  noLabel,
  onYes,
  onNo,
}: {
  message: string;
  yesLabel: string;
  noLabel: string;
  onYes: () => void;
  onNo: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirm"
      onCancel={(event) => {
        event.preventDefault();
        onNo();
      }}
    >
      <p>{message}</p>
      <div className="form-actions">
        <button type="button" onClick={onYes}>
          {yesLabel}
        </button>
        <button type="button" onClick={onNo}>
          {noLabel}
        </button>
      </div>
    </dialog>
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

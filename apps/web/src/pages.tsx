import {
  categoryListSchema,
  createdTicketSchema,
  faqArticleSchema,
  faqListSchema,
  knowledgeArticleSchema,
  publicLinkTargets,
  publicTicketListSchema,
  searchResultSchema,
  secretTicketSchema,
  type CategoryOption,
  type CreatedTicket,
  type PriorityReason,
  type PublicTicket,
} from '@kmbhelp/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getJson, postJson, RequestFailed } from './api.js';
import { formatAge, reasonLabel, statusLabel } from './format.js';
import { useLocale } from './locale.js';

const firmLinks = publicLinkTargets({
  www: import.meta.env.VITE_PUBLIC_URL_WWW,
  home: import.meta.env.VITE_PUBLIC_URL_HOME,
  wiki: import.meta.env.VITE_PUBLIC_URL_WIKI,
});
const firmLinksMissing = !firmLinks.www || !firmLinks.home || !firmLinks.wiki;

export function HomePage() {
  const { lang, copy } = useLocale();
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [tickets, setTickets] = useState<PublicTicket[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedTicket | null>(null);
  const [pending, setPending] = useState(false);

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
  }, [created]);

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
          requesterEmail: String(data.get('requesterEmail') ?? ''),
          requesterName: String(data.get('requesterName') ?? ''),
          dueOn: String(data.get('dueOn') ?? ''),
          clientPriority: String(data.get('clientPriority') ?? ''),
          source: 'web',
        },
        (value) => createdTicketSchema.parse(value),
      );
      setCreated(result);
      form.reset();
    } catch (error) {
      const text = error instanceof RequestFailed ? error.text : null;
      setFormError(text ? text[lang] : copy.sendFailed);
    } finally {
      setPending(false);
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
      <h1>{copy.documentTitle}</h1>
      <p>{copy.lead}</p>
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
          <input name="dueOn" type="date" />
        </label>
        <label>
          {copy.email}
          <input name="requesterEmail" type="email" maxLength={200} autoComplete="email" />
        </label>
        <label>
          {copy.name}
          <input name="requesterName" maxLength={200} autoComplete="name" />
        </label>
        <label>
          {copy.reportedPriority}
          <select name="clientPriority" defaultValue="">
            <option value="">{copy.priorityUnset}</option>
            <option value="p1">P1</option>
            <option value="p2">P2</option>
            <option value="p3">P3</option>
          </select>
        </label>
        <p>{copy.priorityHint}</p>
        {formError ? <p role="alert">{formError}</p> : null}
        <button type="submit" disabled={pending}>
          {copy.submit}
        </button>
      </form>
      {created ? (
        <section aria-live="polite">
          <h2>
            {copy.ticketCreated} {created.number}
          </h2>
          <p>
            {created.priority.toUpperCase()}.{' '}
            {reasonLabel(created.priorityReason as PriorityReason, copy)}
          </p>
          {created.secretPath ? (
            <>
              <p>
                <Link to={created.secretPath}>{copy.secretLink}</Link>
              </p>
              <p>{copy.secretOnce}</p>
            </>
          ) : (
            <p>{copy.numberOnly}</p>
          )}
        </section>
      ) : null}
      <h2>{copy.openTickets}</h2>
      {loadError ? <p role="alert">{copy.loadFailed}</p> : null}
      {tickets.length === 0 && !loadError ? <p>{copy.noOpenTickets}</p> : null}
      {[...groups.entries()].map(([groupCode, entries]) => (
        <section className="group" key={groupCode}>
          <h3>{lang === 'de' ? entries[0]?.groupLabelDe : entries[0]?.groupLabelEn}</h3>
          <ul className="ticket-list">
            {entries.map((entry) => (
              <li key={entry.number}>
                <span>{entry.number}</span>
                <span>{lang === 'de' ? entry.categoryLabelDe : entry.categoryLabelEn}</span>
                <span>
                  {copy.status}: {statusLabel(entry.status, copy)}
                </span>
                <span>
                  {copy.priority}: {entry.priority.toUpperCase()}
                </span>
                <span>
                  {copy.age}: {formatAge(entry.ageSeconds, copy)}
                </span>
              </li>
            ))}
          </ul>
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

export function SecretPage() {
  const { token = '' } = useParams();
  const { lang, copy } = useLocale();
  const [ticket, setTicket] = useState<{
    number: number;
    subject: string;
    body: string;
    category: string;
    status: string;
    priority: string;
  } | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJson(`/api/v1/tickets/by-token/${encodeURIComponent(token)}`, (value) =>
      secretTicketSchema.parse(value),
    )
      .then((body) => {
        if (!cancelled) {
          setTicket({
            number: body.number,
            subject: body.subject,
            body: body.body,
            category: lang === 'de' ? body.categoryLabelDe : body.categoryLabelEn,
            status: body.status,
            priority: body.priority,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [lang, token]);

  if (missing) return <MissingPage />;
  if (!ticket) return null;
  return (
    <>
      <h1>
        {copy.ticketCreated} {ticket.number}
      </h1>
      <p>{ticket.category}</p>
      <p>
        {copy.status}: {statusLabel(ticket.status, copy)}
      </p>
      <p>
        {copy.priority}: {ticket.priority.toUpperCase()}
      </p>
      <h2>{ticket.subject}</h2>
      <p>{ticket.body}</p>
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

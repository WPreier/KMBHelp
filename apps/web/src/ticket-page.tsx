import {
  assignableStaffSchema,
  categoryListSchema,
  staffTicketViewSchema,
  unreadMailListSchema,
  type StaffTicketView,
} from '@kmbhelp/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getJson, postJson, RequestFailed } from './api.js';
import { useLocale } from './locale.js';

type Category = { code: string; labelDe: string; labelEn: string };
type Person = { id: string; displayName: string };
type UnreadMail = { graphId: string; subject: string; fromEmail: string; fromName: string };

export function TicketPage() {
  const { number } = useParams();
  const { lang, copy } = useLocale();
  const [data, setData] = useState<StaffTicketView | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [mails, setMails] = useState<UnreadMail[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [question, setQuestion] = useState('');

  function fail(caught: unknown) {
    setNotice('');
    setError(caught instanceof RequestFailed ? (caught.text?.[lang] ?? copy.loadFailed) : copy.loadFailed);
  }

  async function reload() {
    const loaded = await getJson(`/api/v1/staff/tickets/${number ?? ''}`, staffTicketViewSchema.parse);
    setData(loaded);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);
    Promise.all([
      getJson(`/api/v1/staff/tickets/${number ?? ''}`, staffTicketViewSchema.parse),
      getJson('/api/v1/categories', categoryListSchema.parse),
      getJson('/api/v1/staff/assignable', assignableStaffSchema.parse),
      getJson('/api/v1/staff/mailbox', unreadMailListSchema.parse).catch(() => ({ mails: [] })),
    ])
      .then(([loaded, catalog, staffList, mailbox]) => {
        if (cancelled) return;
        setData(loaded);
        setCategories(catalog.categories);
        setPeople(staffList.staff.filter((person) => person.active));
        setMails(mailbox.mails);
      })
      .catch((caught: unknown) => {
        if (!cancelled) fail(caught);
      });
    return () => {
      cancelled = true;
    };
  }, [lang, number]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const assigned = String(form.get('assignedStaffId') ?? '');
    try {
      const saved = await postJson(
        `/api/v1/staff/tickets/${number ?? ''}`,
        {
          subject: String(form.get('subject') ?? ''),
          body: String(form.get('body') ?? ''),
          categoryCode: String(form.get('categoryCode') ?? ''),
          impact: String(form.get('impact') ?? ''),
          priority: String(form.get('priority') ?? ''),
          priorityReason: String(form.get('priorityReason') ?? ''),
          dueOn: String(form.get('dueOn') ?? '') || null,
          requesterName: String(form.get('requesterName') ?? '') || null,
          requesterEmail: String(form.get('requesterEmail') ?? '') || null,
          explanation: String(form.get('explanation') ?? ''),
          assignedStaffId: assigned || null,
        },
        staffTicketViewSchema.parse,
        'PATCH',
      );
      setData(saved);
      setNotice(copy.valueSaved);
      setError(null);
    } catch (caught) {
      fail(caught);
    }
  }

  async function act(path: string, body?: unknown) {
    try {
      await postJson(`/api/v1/staff/tickets/${number ?? ''}/${path}`, body ?? {}, (value) => value);
      if (path === 'misread') {
        setData(null);
        setNotice(copy.valueSaved);
        setError(null);
        return;
      }
      await reload();
      setNotice(copy.valueSaved);
      setError(null);
    } catch (caught) {
      fail(caught);
    }
  }

  async function accept(graphId: string, text: string) {
    try {
      await postJson(`/api/v1/staff/mailbox/${encodeURIComponent(graphId)}/accept`, { reason: text }, (value) => value);
      setMails((current) => current.filter((mail) => mail.graphId !== graphId));
      setReasons((current) => {
        const next = { ...current };
        delete next[graphId];
        return next;
      });
      setNotice(copy.valueSaved);
      setError(null);
    } catch (caught) {
      fail(caught);
    }
  }

  const open = data !== null && data.status !== 'closed';

  return (
    <section>
      <p>
        <Link to="/mitarbeit/dashboard">{copy.ticketBack}</Link>
      </p>
      <h2>
        {copy.ticketTitle} {number}
      </h2>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p>{notice}</p> : null}
      {data ? (
        <>
          <SatisfactionMark state={data.satisfaction} copy={copy} />
          {open ? (
            <form onSubmit={(event) => void save(event)}>
              <label>
                {copy.subject}
                <input name="subject" defaultValue={data.subject} required />
              </label>
              <label>
                {copy.category}
                <select name="categoryCode" defaultValue={data.categoryCode} required>
                  {categories.map((item) => (
                    <option key={item.code} value={item.code}>
                      {lang === 'de' ? item.labelDe : item.labelEn}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {copy.impact}
                <select name="impact" defaultValue={data.impact} required>
                  <option value="filing">{copy.impactFiling}</option>
                  <option value="payroll">{copy.impactPayroll}</option>
                  <option value="workplace">{copy.impactWorkplace}</option>
                  <option value="cosmetic">{copy.impactCosmetic}</option>
                </select>
              </label>
              <label>
                {copy.priority}
                <select name="priority" defaultValue={data.priority} required>
                  <option value="p1">{copy.priorityP1}</option>
                  <option value="p2">{copy.priorityP2}</option>
                  <option value="p3">{copy.priorityP3}</option>
                </select>
              </label>
              <label>
                {copy.priorityHint}
                <input name="priorityReason" />
              </label>
              <label>
                {copy.dueOn}
                <input name="dueOn" defaultValue={data.dueOn ?? ''} placeholder="dd.MM.yyyy" />
              </label>
              <label>
                {copy.ticketRequester}
                <input name="requesterName" defaultValue={data.requesterName ?? ''} />
              </label>
              <label>
                {copy.requesterEmail}
                <input name="requesterEmail" defaultValue={data.requesterEmail ?? ''} />
              </label>
              <label>
                {copy.assignedStaff}
                <select name="assignedStaffId" defaultValue={data.assignedStaffId ?? ''}>
                  <option value="">{copy.priorityUnset}</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {copy.ticketBody}
                <textarea name="body" defaultValue={data.body} required />
              </label>
              <label>
                {copy.explanation}
                <textarea name="explanation" defaultValue={data.explanation} />
              </label>
              <div className="form-actions">
                <button type="submit">{copy.saveTicket}</button>
                <button type="button" onClick={() => void act('done')}>
                  {copy.done}
                </button>
                <button type="button" onClick={() => void act('working')}>
                  {copy.workingNow}
                </button>
              </div>
            </form>
          ) : (
            <>
              <p>{data.subject}</p>
              <p>{data.body}</p>
              {data.explanation ? (
                <>
                  <h3>{copy.explanation}</h3>
                  <p>{data.explanation}</p>
                </>
              ) : null}
            </>
          )}
          {open ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void act('question', { text: question });
              }}
            >
              <label>
                {copy.askUser}
                <textarea value={question} onChange={(event) => setQuestion(event.target.value)} required />
              </label>
              <button type="submit">{copy.sendQuestion}</button>
            </form>
          ) : null}
          {open && data.fromMail ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void act('misread', { reason: String(form.get('reason') ?? '') });
              }}
            >
              <label>
                {copy.misreadReason}
                <textarea name="reason" required />
              </label>
              <button type="submit">{copy.misread}</button>
            </form>
          ) : null}
        </>
      ) : null}
      <h3>{copy.mailboxTitle}</h3>
      {mails.length === 0 ? <p>{copy.mailboxEmpty}</p> : null}
      <ul>
        {mails.map((mail) => (
          <li key={mail.graphId}>
            <p>
              {mail.subject} — {mail.fromName || mail.fromEmail}
            </p>
            <label>
              {copy.acceptReason}
              <input
                value={reasons[mail.graphId] ?? ''}
                onChange={(event) =>
                  setReasons((current) => ({ ...current, [mail.graphId]: event.target.value }))
                }
              />
            </label>
            <button type="button" onClick={() => void accept(mail.graphId, reasons[mail.graphId] ?? '')}>
              {copy.acceptMail}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SatisfactionMark({
  state,
  copy,
}: {
  state: StaffTicketView['satisfaction'];
  copy: {
    satisfaction: string;
    satisfactionSatisfied: string;
    satisfactionNeutral: string;
    satisfactionDissatisfied: string;
    satisfactionNone: string;
  };
}) {
  const label =
    state === 'satisfied'
      ? copy.satisfactionSatisfied
      : state === 'neutral'
        ? copy.satisfactionNeutral
        : state === 'dissatisfied'
          ? copy.satisfactionDissatisfied
          : copy.satisfactionNone;
  const mouth =
    state === 'satisfied'
      ? 'M8 18c2 3 6 3 8 0'
      : state === 'dissatisfied'
        ? 'M8 20c2-3 6-3 8 0'
        : 'M8 18h8';
  const color = state === 'satisfied' ? '#e6c200' : state === 'neutral' ? '#1d6b45' : state === 'dissatisfied' ? '#d86b1a' : '#5c6570';
  return (
    <p className="satisfaction">
      <svg viewBox="0 0 24 24" width="28" height="28" role="img" aria-label={`${copy.satisfaction}: ${label}`}>
        <circle cx="12" cy="12" r="10" fill={color} />
        <circle cx="9" cy="10" r="1" fill="#1c2430" />
        <circle cx="15" cy="10" r="1" fill="#1c2430" />
        <path d={mouth} fill="none" stroke="#1c2430" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <span>
        {copy.satisfaction}: {label}
      </span>
    </p>
  );
}

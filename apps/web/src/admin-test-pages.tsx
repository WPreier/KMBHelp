import {
  mailboxListSchema,
  mailboxMessageSchema,
  mailTestActiveResultSchema,
  mailTestModelResultSchema,
  mailTestPromptSchema,
  mailTestResultSchema,
  type MailboxRow,
  type MailTestResult,
} from '@kmbhelp/shared';
import { useEffect, useState, type DragEvent, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getJson, postJson, RequestFailed } from './api.js';
import { useLocale } from './locale.js';
import { ServiceChecks } from './operations-pages.js';

const kindLabel = {
  classify: 'mailTestKindClassify',
  retry: 'mailTestKindRetry',
  importance: 'mailTestKindImportance',
} as const;

export function TestsPage() {
  const { copy } = useLocale();
  return (
    <section>
      <h2>{copy.testsTitle}</h2>
      <p>{copy.testsLead}</p>
      <p>
        <Link to="/verwaltung/ki-mailtest">{copy.mailTestTitle}</Link>
      </p>
      <p>
        <Link to="/verwaltung/mailbox">{copy.mailboxAdminTitle}</Link>
      </p>
      <ServiceChecks />
    </section>
  );
}

export function MailTestPage() {
  const { lang, copy } = useLocale();
  const [params] = useSearchParams();
  const mailId = params.get('id') ?? '';
  const [prompt, setPrompt] = useState('');
  const [email, setEmail] = useState('');
  const [model, setModel] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [provider, setProvider] = useState<'ollama' | 'openrouter'>('ollama');
  const [active, setActive] = useState(true);
  const [result, setResult] = useState<MailTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [pendingActive, setPendingActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    document.body.classList.add('wait');
    getJson('/api/v1/admin/mail-test', mailTestPromptSchema.parse)
      .then((loaded) => {
        if (cancelled) return;
        setPrompt(loaded.prompt);
        setModel(loaded.model);
        setModels(loaded.models);
        setProvider(loaded.provider);
        setActive(loaded.active);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(failure(caught, lang, copy.loadFailed));
      })
      .finally(() => {
        document.body.classList.remove('wait');
      });
    return () => {
      cancelled = true;
      document.body.classList.remove('wait');
    };
  }, [copy.loadFailed, lang]);

  useEffect(() => {
    if (mailId === '') return;
    let cancelled = false;
    const stored = sessionStorage.getItem(`kmbhelp-mail-test:${mailId}`);
    if (stored) {
      setEmail(stored);
      return;
    }
    document.body.classList.add('wait');
    getJson(
      `/api/v1/admin/mailbox/message?id=${encodeURIComponent(mailId)}`,
      mailboxMessageSchema.parse,
    )
      .then((loaded) => {
        if (!cancelled) setEmail(loaded.source);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(failure(caught, lang, copy.loadFailed));
      })
      .finally(() => {
        document.body.classList.remove('wait');
      });
    return () => {
      cancelled = true;
      document.body.classList.remove('wait');
    };
  }, [copy.loadFailed, lang, mailId]);

  async function onTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNote(null);
    setResult(null);
    document.body.classList.add('wait');
    try {
      const loaded = await postJson(
        '/api/v1/admin/mail-test',
        { prompt, email, model },
        mailTestResultSchema.parse,
      );
      setResult(loaded);
    } catch (caught) {
      setError(failure(caught, lang, copy.loadFailed));
    } finally {
      document.body.classList.remove('wait');
      setPending(false);
    }
  }

  async function onActiveChange(next: boolean) {
    if (next === active || pendingActive) return;
    setPendingActive(true);
    setError(null);
    setNote(null);
    try {
      const saved = await postJson(
        '/api/v1/admin/mail-test/active',
        { active: next },
        mailTestActiveResultSchema.parse,
      );
      setActive(saved.active);
      setNote(lang === 'de' ? saved.textDe : saved.textEn);
    } catch (caught) {
      setError(failure(caught, lang, copy.loadFailed));
    } finally {
      setPendingActive(false);
    }
  }

  async function onModelChange(next: string) {
    if (next === '' || next === model) return;
    setPending(true);
    setError(null);
    setNote(null);
    document.body.classList.add('wait');
    try {
      const saved = await postJson(
        '/api/v1/admin/mail-test/model',
        { model: next },
        mailTestModelResultSchema.parse,
      );
      setModel(saved.model);
      setModels((current) =>
        current.includes(saved.model) ? current : [saved.model, ...current],
      );
      setNote(lang === 'de' ? saved.textDe : saved.textEn);
    } catch (caught) {
      setError(failure(caught, lang, copy.mailTestModelDown));
    } finally {
      document.body.classList.remove('wait');
      setPending(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setEmail(await readMailFile(file));
    } catch {
      setError(copy.mailTestDropMsg);
    }
  }

  async function onDrop(event: DragEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    setError(null);
    try {
      setEmail(await readDroppedMail(event));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.mailTestDropMsg);
    }
  }

  return (
    <section>
      <h2>{copy.mailTestTitle}</h2>
      <label>
        <input
          type="checkbox"
          checked={active}
          disabled={pendingActive}
          onChange={(event) => void onActiveChange(event.target.checked)}
        />{' '}
        {copy.mailTestAutoActive}
      </label>
      <p>{copy.mailTestAutoHint}</p>
      <p>
        {provider === 'openrouter' ? copy.mailTestProviderOpenRouter : copy.mailTestProviderOllama}
      </p>
      <form onSubmit={(event) => void onTest(event)}>
        <label>
          {copy.mailTestModel}
          {provider === 'openrouter' ? (
            <input
              value={model}
              disabled={pending}
              onChange={(event) => setModel(event.target.value)}
              onBlur={(event) => void onModelChange(event.target.value.trim())}
            />
          ) : (
            <select
              value={model}
              disabled={pending || models.length === 0}
              onChange={(event) => void onModelChange(event.target.value)}
            >
              {models.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          )}
        </label>
        <label>
          {copy.mailTestPrompt}
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        </label>
        <label>
          {copy.mailTestUpload}
          <input
            type="file"
            accept=".eml,.txt,text/plain,message/rfc822"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
        </label>
        <label>
          {copy.mailTestEmail}
          <textarea
            className="mail-test-mail"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => void onDrop(event)}
            title={copy.mailTestDropHint}
          />
        </label>
        <p>{copy.mailTestDropHint}</p>
        <button type="submit" disabled={pending}>
          {copy.mailTestRun}
        </button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {note ? <p>{note}</p> : null}
      {result ? (
        <>
          {result.exchanges.map((exchange, index) => (
            <article key={`${exchange.kind}-${index}`}>
              <h3>{copy[kindLabel[exchange.kind]]}</h3>
              <h4>{copy.mailTestSent}</h4>
              <pre className="exchange">{exchange.prompt}</pre>
              <h4>{copy.mailTestAnswer}</h4>
              <pre className="exchange">{exchange.answer}</pre>
            </article>
          ))}
          <p>{lang === 'de' ? result.textDe : result.textEn}</p>
          <p>{copy.mailTestSeconds.replace('{seconds}', String(result.seconds))}</p>
        </>
      ) : null}
    </section>
  );
}

export function MailboxAdminPage() {
  const { copy, lang } = useLocale();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<MailboxRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadMailbox() {
    setLoading(true);
    setError(null);
    document.body.classList.add('wait');
    try {
      const loaded = await getJson('/api/v1/admin/mailbox', mailboxListSchema.parse);
      setMessages(loaded.messages);
      setTruncated(loaded.truncated);
    } catch (caught) {
      setMessages(null);
      setTruncated(false);
      setError(failure(caught, lang, copy.loadFailed));
    } finally {
      document.body.classList.remove('wait');
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    document.body.classList.add('wait');
    getJson('/api/v1/admin/mailbox', mailboxListSchema.parse)
      .then((loaded) => {
        if (cancelled) return;
        setMessages(loaded.messages);
        setTruncated(loaded.truncated);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setMessages(null);
        setTruncated(false);
        setError(failure(caught, lang, copy.loadFailed));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
        document.body.classList.remove('wait');
      });
    return () => {
      cancelled = true;
      document.body.classList.remove('wait');
    };
  }, [lang, copy.loadFailed]);

  async function openTest(mail: MailboxRow) {
    setBusy(mail.graphId);
    setError(null);
    document.body.classList.add('wait');
    try {
      const full = await getJson(
        `/api/v1/admin/mailbox/message?id=${encodeURIComponent(mail.graphId)}`,
        mailboxMessageSchema.parse,
      );
      sessionStorage.setItem(`kmbhelp-mail-test:${mail.graphId}`, full.source);
      navigate(`/verwaltung/ki-mailtest?id=${encodeURIComponent(mail.graphId)}`);
    } catch (caught) {
      setError(failure(caught, lang, copy.loadFailed));
    } finally {
      document.body.classList.remove('wait');
      setBusy(null);
    }
  }

  async function toggle(mail: MailboxRow) {
    const unread = !mail.unread;
    setBusy(mail.graphId);
    setError(null);
    document.body.classList.add('wait');
    try {
      await postJson(
        '/api/v1/admin/mailbox/read',
        { graphId: mail.graphId, unread },
        (value) => value,
      );
      setMessages(
        (current) =>
          current?.map((item) => (item.graphId === mail.graphId ? { ...item, unread } : item)) ??
          null,
      );
    } catch (caught) {
      setError(failure(caught, lang, copy.loadFailed));
    } finally {
      document.body.classList.remove('wait');
      setBusy(null);
    }
  }

  return (
    <section>
      <h2>{copy.mailboxAdminTitle}</h2>
      <p>{copy.mailboxAdminLead}</p>
      <p>
        <button type="button" disabled={loading || busy !== null} onClick={() => void loadMailbox()}>
          {copy.mailboxReload}
        </button>
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {truncated && messages ? (
        <p>{copy.mailboxTruncated.replace('{count}', String(messages.length))}</p>
      ) : null}
      {messages && messages.length === 0 ? <p>{copy.mailboxNone}</p> : null}
      {messages && messages.length > 0 ? (
        <div className="mail-box">
          <table>
            <thead>
              <tr>
                <th>{copy.mailTestRun}</th>
                <th>{copy.mailboxFrom}</th>
                <th>{copy.mailboxDate}</th>
                <th>{copy.mailboxSubject}</th>
                <th>{copy.mailboxBody}</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((mail) => (
                <tr key={mail.graphId} className={mail.unread ? 'mailbox-unread' : undefined}>
                  <td className="mailbox-actions">
                    <button
                      type="button"
                      className="service-test"
                      title={copy.mailboxTestMail}
                      aria-label={copy.mailboxTestMail}
                      disabled={busy === mail.graphId || loading}
                      onClick={() => void openTest(mail)}
                    >
                      T
                    </button>
                    <button
                      type="button"
                      className={
                        mail.unread
                          ? 'service-test read-toggle is-unread'
                          : 'service-test read-toggle is-read'
                      }
                      title={mail.unread ? copy.mailboxMarkRead : copy.mailboxMarkUnread}
                      aria-label={mail.unread ? copy.mailboxMarkRead : copy.mailboxMarkUnread}
                      disabled={busy === mail.graphId || loading}
                      onClick={() => void toggle(mail)}
                    >
                      {mail.unread ? 'G' : 'U'}
                    </button>
                  </td>
                  <td className="mailbox-from">
                    <div className="mailbox-cell-scroll">
                      {mail.fromName ? `${mail.fromName} <${mail.fromEmail}>` : mail.fromEmail}
                    </div>
                  </td>
                  <td className="mailbox-date">{formatMailboxDate(mail.sentAt)}</td>
                  <td className="mailbox-subject">
                    <div className="mailbox-cell-scroll">{mail.subject}</div>
                  </td>
                  <td className="mailbox-body">
                    <div className="mailbox-cell-scroll">{mail.body}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function formatMailboxDate(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return trimmed;
  const parts = new Intl.DateTimeFormat('de-AT', {
    timeZone: 'Europe/Vienna',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('day')}.${pick('month')} ${pick('hour')}:${pick('minute')}`;
}

function failure(caught: unknown, lang: 'de' | 'en', fallback: string): string {
  return caught instanceof RequestFailed ? (caught.text?.[lang] ?? fallback) : fallback;
}

async function readDroppedMail(event: DragEvent<HTMLTextAreaElement>): Promise<string> {
  const transfer = event.dataTransfer;
  if (!transfer) return '';
  const html = transfer.getData('text/html');
  const plain = transfer.getData('text/plain');
  const file = transfer.files?.[0];
  if (file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.msg') || file.type === 'application/vnd.ms-outlook') {
      const fromTransfer = combineOutlookTransfer(html, plain);
      if (fromTransfer.trim() !== '') return fromTransfer;
      throw new Error(
        'Outlook hat die Mail als .msg übergeben. Speichere sie in Outlook als .eml und lege diese Datei hier ab, oder kopiere den Mailtext.',
      );
    }
    return readMailFile(file);
  }
  const combined = combineOutlookTransfer(html, plain);
  if (combined.trim() === '') {
    throw new Error(
      'Die abgelegte Mail enthielt keinen lesbaren Text. Speichere sie in Outlook als .eml und lege die Datei hier ab.',
    );
  }
  return combined;
}

async function readMailFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.msg') || file.type === 'application/vnd.ms-outlook') {
    throw new Error(
      'Outlook hat die Mail als .msg übergeben. Speichere sie in Outlook als .eml und lege diese Datei hier ab, oder kopiere den Mailtext.',
    );
  }
  const text = await file.text();
  if (looksLikeHeadersOnly(text)) {
    return text;
  }
  return text;
}

function combineOutlookTransfer(html: string, plain: string): string {
  const bodyFromHtml = htmlToPlain(html);
  const plainTrim = plain.trim();
  if (plainTrim !== '' && !looksLikeHeadersOnly(plainTrim)) return plainTrim;
  if (looksLikeHeadersOnly(plainTrim) && bodyFromHtml !== '') {
    return `${plainTrim}\n\n${bodyFromHtml}`;
  }
  if (bodyFromHtml !== '') return bodyFromHtml;
  return plainTrim;
}

function looksLikeHeadersOnly(text: string): boolean {
  const normalized = text.replace(/\r\n/gu, '\n');
  if (!/\n\n/u.test(normalized)) {
    return /^(from|to|cc|date|subject|message-id|in-reply-to|references)\s*:/imu.test(normalized);
  }
  const body = normalized.slice(normalized.indexOf('\n\n') + 2).trim();
  return body === '';
}

function htmlToPlain(html: string): string {
  if (html.trim() === '') return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style').forEach((node) => node.remove());
  const text = doc.body?.textContent ?? '';
  return text.replace(/\u00a0/gu, ' ').replace(/[ \t]+\n/gu, '\n').replace(/\n{3,}/gu, '\n\n').trim();
}

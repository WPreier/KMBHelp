import {
  mailboxListSchema,
  mailboxMessageSchema,
  mailTestPromptSchema,
  mailTestResultSchema,
  type MailboxRow,
  type MailTestResult,
} from '@kmbhelp/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
  const [result, setResult] = useState<MailTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJson('/api/v1/admin/mail-test', mailTestPromptSchema.parse)
      .then((loaded) => {
        if (!cancelled) setPrompt(loaded.prompt);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(failure(caught, lang, copy.loadFailed));
      });
    return () => {
      cancelled = true;
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
    getJson(
      `/api/v1/admin/mailbox/message?id=${encodeURIComponent(mailId)}`,
      mailboxMessageSchema.parse,
    )
      .then((loaded) => {
        if (!cancelled) setEmail(loaded.source);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(failure(caught, lang, copy.loadFailed));
      });
    return () => {
      cancelled = true;
    };
  }, [copy.loadFailed, lang, mailId]);

  async function onTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setResult(null);
    document.body.classList.add('wait');
    try {
      const loaded = await postJson(
        '/api/v1/admin/mail-test',
        { prompt, email },
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

  async function onFile(file: File | undefined) {
    if (!file) return;
    setEmail(await file.text());
  }

  return (
    <section>
      <h2>{copy.mailTestTitle}</h2>
      <form onSubmit={(event) => void onTest(event)}>
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
          />
        </label>
        <button type="submit" disabled={pending}>
          {copy.mailTestRun}
        </button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
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
  const [messages, setMessages] = useState<MailboxRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJson('/api/v1/admin/mailbox', mailboxListSchema.parse)
      .then((loaded) => {
        if (!cancelled) {
          setMessages(loaded.messages);
          setTruncated(loaded.truncated);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(failure(caught, lang, copy.loadFailed));
      });
    return () => {
      cancelled = true;
    };
  }, [copy.loadFailed, lang]);

  async function openTest(mail: MailboxRow) {
    setBusy(mail.graphId);
    setError(null);
    try {
      const full = await getJson(
        `/api/v1/admin/mailbox/message?id=${encodeURIComponent(mail.graphId)}`,
        mailboxMessageSchema.parse,
      );
      sessionStorage.setItem(`kmbhelp-mail-test:${mail.graphId}`, full.source);
      window.open(
        `/verwaltung/ki-mailtest?id=${encodeURIComponent(mail.graphId)}`,
        '_blank',
        'noopener',
      );
    } catch (caught) {
      setError(failure(caught, lang, copy.loadFailed));
    } finally {
      setBusy(null);
    }
  }

  async function toggle(mail: MailboxRow) {
    const unread = !mail.unread;
    setBusy(mail.graphId);
    setError(null);
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
      setBusy(null);
    }
  }

  return (
    <section>
      <h2>{copy.mailboxAdminTitle}</h2>
      <p>{copy.mailboxAdminLead}</p>
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
                <th>{copy.mailboxTo}</th>
                <th>{copy.mailboxCc}</th>
                <th>{copy.mailboxDate}</th>
                <th>{copy.mailboxSubject}</th>
                <th>{copy.mailboxMessageId}</th>
                <th>{copy.mailboxReply}</th>
                <th>{copy.mailboxReferences}</th>
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
                      disabled={busy === mail.graphId}
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
                      disabled={busy === mail.graphId}
                      onClick={() => void toggle(mail)}
                    >
                      {mail.unread ? 'G' : 'U'}
                    </button>
                  </td>
                  <td>{mail.fromName ? `${mail.fromName} <${mail.fromEmail}>` : mail.fromEmail}</td>
                  <td>{mail.to}</td>
                  <td>{mail.cc}</td>
                  <td>{mail.sentAt}</td>
                  <td>{mail.subject}</td>
                  <td>{mail.internetMessageId}</td>
                  <td>{mail.inReplyTo}</td>
                  <td>{mail.references}</td>
                  <td>{mail.body}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function failure(caught: unknown, lang: 'de' | 'en', fallback: string): string {
  return caught instanceof RequestFailed ? (caught.text?.[lang] ?? fallback) : fallback;
}

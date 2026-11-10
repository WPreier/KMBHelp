import {
  archiveIndexSchema,
  closedTicketListSchema,
  closedTicketPageSchema,
  helpdeskAssigneeEmail,
  helpdeskRosterSchema,
  ticketAssigneeResultSchema,
  defaultTicketFileBytes,
  defaultTicketFileTypes,
  isoDateToDisplay,
  renderMarkdownHtml,
  publicTicketStateSchema,
  sessionViewSchema,
  ticketFileViewSchema,
  ticketPageSchema,
  ticketSavedSchema,
  ticketWorkSchema,
  type TicketPage,
} from '@kmbhelp/shared';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';
import { Link, useParams } from 'react-router-dom';
import { deleteJson, getJson, postJson, RequestFailed } from './api.js';
import { impactLabel, priorityLabel } from './format.js';
import { Hint } from './hint.js';
import { useLocale } from './locale.js';
import { htmlToMarkdown } from './wiki-text.js';

type StoredFile = { id: string; name: string; bytes: number; createdAt: string };

export function ClosedTicketsPage() {
  const { copy } = useLocale();
  const [rows, setRows] = useState<
    Array<{ code: string; subject: string; assigneeEmail: string; verdict: string }>
  >([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJson('/api/v1/tickets/closed', (value) => closedTicketListSchema.parse(value))
      .then((body) => {
        if (!cancelled) setRows(body.tickets);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <h1>{copy.guides}</h1>
      <p>{copy.closedLead}</p>
      {failed ? <p role="alert">{copy.loadFailed}</p> : null}
      <div className="ticket-scroll">
        <table className="ticket-table">
          <thead>
            <tr>
              <th scope="col">{copy.ticketId}</th>
              <th scope="col">{copy.assignedStaff}</th>
              <th scope="col">{copy.subject}</th>
              <th scope="col">{copy.verdictTitle}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.code}>
                <td>
                  <a href={`/abgeschlossen/${row.code}`} target="_blank" rel="noopener noreferrer">
                    {row.code}
                  </a>
                </td>
                <td>{row.assigneeEmail}</td>
                <td>{row.subject}</td>
                <td>
                  <a href={`/abgeschlossen/${row.code}`} target="_blank" rel="noopener noreferrer">
                    {row.verdict}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function ClosedSummaryPage() {
  const { copy } = useLocale();
  const { code = '' } = useParams();
  const [page, setPage] = useState<{ subject: string; summary: string; verdict: string } | null>(
    null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJson(`/api/v1/tickets/closed/${code}`, (value) => closedTicketPageSchema.parse(value))
      .then((body) => {
        if (!cancelled) setPage(body);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <>
      <h1>{code}</h1>
      {failed ? <p role="alert">{copy.loadFailed}</p> : null}
      {page ? (
        <>
          <p>{page.subject}</p>
          <h2>{copy.verdictTitle}</h2>
          <p>{page.verdict}</p>
          <h2>{copy.summaryTitle}</h2>
          <p>{page.summary}</p>
          <p>
            <Link to={`/archiv/${code}`}>{copy.archiveIndex}</Link>
          </p>
        </>
      ) : null}
    </>
  );
}

export function ArchiveIndexPage() {
  const { copy } = useLocale();
  const { code = '' } = useParams();
  const [markdown, setMarkdown] = useState('');
  const [archived, setArchived] = useState(false);
  const [files, setFiles] = useState<Array<{ name: string; bytes: number; modifiedAt: string }>>(
    [],
  );
  const [allowed, setAllowed] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJson('/api/v1/auth/session', (value) => sessionViewSchema.parse(value))
      .then(async (session) => {
        if (!(session.signedIn || session.internalAdmin) || cancelled) return;
        setAllowed(true);
        const body = await getJson(`/api/v1/staff/tickets/archive/${code}`, (value) =>
          archiveIndexSchema.parse(value),
        );
        if (cancelled) return;
        setMarkdown(body.markdown);
        setArchived(body.archived);
        setFiles(body.files);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <>
      <h1>
        {copy.ticketHeading} {code}
      </h1>
      {failed ? <p role="alert">{copy.loadFailed}</p> : null}
      {allowed ? (
        <>
          {archived ? (
            <p className="archive-links">
              <a href={`/api/v1/staff/tickets/archive/${code}/summary.md`}>{copy.summaryTitle}</a>
              <a href={`/api/v1/staff/tickets/archive/${code}/fazit.md`}>{copy.verdictTitle}</a>
              <a href={`/api/v1/staff/tickets/archive/${code}/ticket.pdf`}>ticket.pdf</a>
            </p>
          ) : null}
          <article
            className="md"
            dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(markdown) }}
          />
          <h2>{copy.fileName}</h2>
          <FileTable
            rows={files.map((file) => ({
              key: file.name,
              name: file.name,
              bytes: file.bytes,
              at: file.modifiedAt,
              href: `/api/v1/staff/tickets/archive/${code}/dateien/${encodeURIComponent(file.name)}`,
            }))}
          />
        </>
      ) : null}
    </>
  );
}

export function TicketWikiPage() {
  const { lang, copy } = useLocale();
  const { code = '' } = useParams();
  const [header, setHeader] = useState<TicketPage | null>(null);
  const [assigneeEmail, setAssigneeEmail] = useState(helpdeskAssigneeEmail);
  const [roster, setRoster] = useState<Array<{ displayName: string; email: string }>>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const [staff, setStaff] = useState(false);
  const [mayClose, setMayClose] = useState(true);
  const [markdown, setMarkdown] = useState('');
  const [first, setFirst] = useState('');
  const [requester, setRequester] = useState('');
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [lastEditor, setLastEditor] = useState<string | null>(null);
  const [history, setHistory] = useState('');
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);
  const [fileError, setFileError] = useState('');
  const [fileTypes, setFileTypes] = useState(() => defaultTicketFileTypes.split(', '));
  const [maxFileBytes, setMaxFileBytes] = useState(defaultTicketFileBytes);
  const [confirming, setConfirming] = useState<'text' | 'file' | 'delete' | 'ask' | 'close' | null>(
    null,
  );
  const [loaded, setLoaded] = useState(false);
  const draft = useRef('');
  const pendingFile = useRef<File | null>(null);
  const pendingDelete = useRef<string>('');
  const surface = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    getJson(`/api/v1/tickets/page/${code}`, (value) => ticketPageSchema.parse(value))
      .then((body) => {
        if (!cancelled) {
          setHeader(body);
          setAssigneeEmail(body.assigneeEmail);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    getJson('/api/v1/tickets/assignees', (value) => helpdeskRosterSchema.parse(value))
      .then((body) => {
        if (!cancelled) setRoster(body.staff);
      })
      .catch(() => undefined);
    getJson('/api/v1/auth/session', (value) => sessionViewSchema.parse(value))
      .then(async (session) => {
        const allowed = session.signedIn || session.internalAdmin;
        if (!cancelled) setMayClose(session.audience !== 'user');
        if (!allowed || cancelled) return;
        setStaff(true);
        const work = await getJson(`/api/v1/staff/tickets/work/${code}`, (value) =>
          ticketWorkSchema.parse(value),
        );
        if (cancelled) return;
        setFirst(work.body);
        setRequester(work.requesterName ?? '');
        draft.current = work.workingMarkdown;
        setMarkdown(work.workingMarkdown);
        setUpdatedAt(work.updatedAt);
        setLastEditor(work.lastEditor);
        setHistory(work.history);
        setFiles(work.files);
        setFileTypes(work.fileTypes);
        setMaxFileBytes(work.maxFileBytes);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setStaff(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code, reloadToken]);

  useEffect(() => {
    if (!loaded || !surface.current) return;
    surface.current.innerHTML = renderMarkdownHtml(draft.current);
  }, [loaded, code, reloadToken]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const drop = dropRef.current;
    if (!dialog || !confirming || !drop) return;
    const place = () => {
      const viewHeight = document.documentElement.clientHeight;
      let rect = drop.getBoundingClientRect();
      if (rect.bottom > viewHeight - 8 || rect.top < 0) {
        drop.scrollIntoView({ block: 'center' });
        rect = drop.getBoundingClientRect();
      }
      dialog.style.bottom = `${Math.max(0, viewHeight - rect.bottom)}px`;
    };
    place();
    const frame = window.requestAnimationFrame(() => {
      place();
    });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [confirming]);

  async function saveText(): Promise<boolean> {
    try {
      const next = htmlToMarkdown(surface.current?.innerHTML ?? '');
      const result = await postJson(
        `/api/v1/staff/tickets/work/${code}`,
        { markdown: next },
        (value) => ticketSavedSchema.parse(value),
      );
      setMarkdown(next);
      setUpdatedAt(result.updatedAt);
      setLastEditor(result.lastEditor);
      setHistory(result.history);
      setNotice(copy.saved);
      setFileError('');
      return true;
    } catch (error) {
      setNotice('');
      const text = error instanceof RequestFailed ? error.text : null;
      setFileError(text ? text[lang] : copy.saveFailed);
      return false;
    }
  }

  async function toggleOpen() {
    if (!header || header.frozen) return;
    try {
      const next = await postJson(
        `/api/v1/tickets/public/${header.number}`,
        { action: 'toggle' },
        (value) => publicTicketStateSchema.parse(value),
      );
      setHeader({ ...header, status: next.status });
      setFileError('');
    } catch (error) {
      const text = error instanceof RequestFailed ? error.text : null;
      setFileError(text ? text[lang] : copy.saveFailed);
    }
  }

  async function finishTicket() {
    if (!header) return;
    const saved = await saveText();
    if (!saved) return;
    try {
      await postJson(`/api/v1/tickets/public/${header.number}`, { action: 'close' }, (value) =>
        publicTicketStateSchema.parse(value),
      );
      setNotice(copy.closeQueued);
      setReloadToken((value) => value + 1);
    } catch (error) {
      setNotice('');
      const text = error instanceof RequestFailed ? error.text : null;
      setFileError(text ? text[lang] : copy.sendFailed);
    }
  }

  async function changeAssignee(email: string) {
    const previous = assigneeEmail;
    setAssigneeEmail(email);
    try {
      const result = await postJson(
        `/api/v1/staff/tickets/work/${code}/assignee`,
        { assigneeEmail: email },
        (value) => ticketAssigneeResultSchema.parse(value),
      );
      setAssigneeEmail(result.assigneeEmail);
      setHeader((current) =>
        current ? { ...current, assigneeEmail: result.assigneeEmail } : current,
      );
      setNotice(result.mailed ? copy.assigneeSaved : copy.assigneeMailFailed);
      setFileError('');
    } catch (error) {
      setAssigneeEmail(previous);
      setNotice('');
      const text = error instanceof RequestFailed ? error.text : null;
      setFileError(text ? text[lang] : copy.saveFailed);
    }
  }

  async function askAssignee() {
    if (!header) return;
    try {
      await postJson(`/api/v1/tickets/public/${header.number}/ask`, {}, (value) => value);
      setNotice(copy.mailSent);
      setFileError('');
    } catch (error) {
      setNotice('');
      const text = error instanceof RequestFailed ? error.text : null;
      setFileError(text ? text[lang] : copy.sendFailed);
    }
  }

  function chooseFile(file: File | undefined) {
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const named = file.name.includes('.') && extension !== '';
    if (!named || !fileTypes.includes(extension)) {
      setFileError(copy.fileTypeRejected);
      return;
    }
    if (file.size < 1 || file.size > maxFileBytes) {
      setFileError(copy.fileTooBig);
      return;
    }
    setFileError('');
    pendingFile.current = file;
    setConfirming('file');
  }

  async function storeFile() {
    const file = pendingFile.current;
    if (!file) return;
    try {
      const contentBase64 = await readBase64(file);
      const stored = await postJson(
        `/api/v1/staff/tickets/work/${code}/files`,
        { name: file.name, mediaType: file.type || 'application/octet-stream', contentBase64 },
        (value) => ticketFileViewSchema.parse(value),
      );
      setFiles((current) => [...current, stored]);
      setFileError('');
      pendingFile.current = null;
    } catch (error) {
      const text = error instanceof RequestFailed ? error.text : null;
      setFileError(text ? text[lang] : copy.fileContentRejected);
    }
  }

  async function removeFile() {
    const id = pendingDelete.current;
    if (!id) return;
    await deleteJson(`/api/v1/staff/tickets/work/${code}/files/${id}`, (value) => value);
    setFiles((current) => current.filter((file) => file.id !== id));
  }

  function keepSelection(event: { preventDefault: () => void }) {
    event.preventDefault();
  }

  function format(command: string, value?: string) {
    surface.current?.focus();
    document.execCommand(command, false, value);
  }

  function addLink() {
    const href = window.prompt(copy.linkAsk);
    if (!href) return;
    format('createLink', href);
  }

  function addCode() {
    const selected = document.getSelection()?.toString() || 'Code';
    const safe = selected.replace(/[&<>]/gu, (char) =>
      char === '&' ? '&amp;' : char === '<' ? '&lt;' : '&gt;',
    );
    format('insertHTML', `<code>${safe}</code>`);
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    chooseFile(event.dataTransfer.files[0]);
  }

  const frozen = header?.frozen ?? false;
  const category = header ? (lang === 'de' ? header.categoryLabelDe : header.categoryLabelEn) : '';

  return (
    <>
      <h1>{code}</h1>
      {failed ? <p role="alert">{copy.loadFailed}</p> : null}
      {header ? (
        <dl className="ticket-facts">
          <div>
            <dt>{copy.ticketId}</dt>
            <dd>{header.code}</dd>
          </div>
          <div>
            <dt>{copy.category}</dt>
            <dd>{category}</dd>
          </div>
          <div>
            <dt>{copy.impact}</dt>
            <dd>{impactLabel(header.impact, copy)}</dd>
          </div>
          <div>
            <dt>{copy.subject}</dt>
            <dd>{header.subject}</dd>
          </div>
          <div>
            <dt>{copy.assignedStaff}</dt>
            <dd>
              {staff && !frozen ? (
                <span className="assignee-line">
                  <select
                    aria-label={copy.assignedStaff}
                    value={assigneeEmail}
                    onChange={(event) => void changeAssignee(event.target.value)}
                  >
                    {assigneeChoices(roster, assigneeEmail).map((person) => (
                      <option key={person.email} value={person.email}>
                        {person.displayName} ({person.email})
                      </option>
                    ))}
                  </select>
                  <Hint text={copy.askStaffTitle}>
                    <button
                      type="button"
                      aria-label={copy.askStaffTitle}
                      disabled={header.status !== 'open'}
                      onClick={() => setConfirming('ask')}
                    >
                      {copy.askStaff}
                    </button>
                  </Hint>
                </span>
              ) : (
                header.assigneeEmail
              )}
            </dd>
          </div>
          {staff ? (
            <div>
              <dt>{copy.firstDescription}</dt>
              <dd>
                <textarea className="ticket-description" rows={3} readOnly value={first} />
                {history ? <pre className="ticket-history">{history}</pre> : null}
              </dd>
            </div>
          ) : null}
          <div>
            <dt>{copy.dueOn}</dt>
            <dd>{header.dueOn ? isoDateToDisplay(header.dueOn) : copy.noDue}</dd>
          </div>
          {staff ? (
            <div>
              <dt>{copy.submittedBy}</dt>
              <dd>{requester || copy.noDue}</dd>
            </div>
          ) : null}
          <div>
            <dt>{copy.priority}</dt>
            <dd>{priorityLabel(header.priority, copy)}</dd>
          </div>
          {staff ? (
            <div>
              <dt>{copy.changedAt}</dt>
              <dd>{updatedAt ? formatWhen(updatedAt) : copy.notYet}</dd>
            </div>
          ) : null}
          {staff ? (
            <div>
              <dt>{copy.lastEditor}</dt>
              <dd>{lastEditor || copy.notYet}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {staff ? (
        <>
          {frozen ? <p>{copy.frozenNote}</p> : null}
          <div className="wiki-head">
            <strong>{copy.ticketHeading}</strong>
            <span className="wiki-actions">
              {header ? (
                <Hint text={header.status === 'open' ? copy.setInactiveTitle : copy.setActiveTitle}>
                  <input
                    className="wiki-open"
                    type="checkbox"
                    checked={header.status === 'open'}
                    disabled={frozen || header.status === 'expired' || header.status === 'closed'}
                    aria-label={
                      header.status === 'open' ? copy.setInactiveTitle : copy.setActiveTitle
                    }
                    onChange={() => void toggleOpen()}
                  />
                </Hint>
              ) : null}
              <Hint text={copy.createPdfTitle}>
                <a className="text-button" href={`/api/v1/staff/tickets/work/${code}/pdf`}>
                  {copy.createPdf}
                </a>
              </Hint>
              <Hint text={copy.createCsvTitle}>
                <a className="text-button" href={`/api/v1/staff/tickets/work/${code}/csv`}>
                  {copy.createCsv}
                </a>
              </Hint>
              {mayClose ? (
                <Hint text={copy.confirmFinish}>
                  <button type="button" disabled={frozen} onClick={() => setConfirming('close')}>
                    {copy.closeTicket}
                  </button>
                </Hint>
              ) : null}
              <Hint text={copy.saveTextTitle}>
                <button type="button" disabled={frozen} onClick={() => setConfirming('text')}>
                  {copy.saveText}
                </button>
              </Hint>
              <Hint text={copy.discardTitle}>
                <button
                  type="button"
                  onClick={() => {
                    setNotice(copy.discarded);
                    setFileError('');
                    setReloadToken((value) => value + 1);
                  }}
                >
                  {copy.discard}
                </button>
              </Hint>
            </span>
          </div>
          {notice ? <p>{notice}</p> : null}
          <div className="format-bar">
            <Hint text={copy.formatHeadingTitle}>
              <button
                type="button"
                disabled={frozen}
                onMouseDown={keepSelection}
                onClick={() => format('formatBlock', 'h2')}
              >
                {copy.formatHeading}
              </button>
            </Hint>
            <Hint text={copy.formatBoldTitle}>
              <button
                type="button"
                disabled={frozen}
                onMouseDown={keepSelection}
                onClick={() => format('bold')}
              >
                {copy.formatBold}
              </button>
            </Hint>
            <Hint text={copy.formatItalicTitle}>
              <button
                type="button"
                disabled={frozen}
                onMouseDown={keepSelection}
                onClick={() => format('italic')}
              >
                {copy.formatItalic}
              </button>
            </Hint>
            <Hint text={copy.formatListTitle}>
              <button
                type="button"
                disabled={frozen}
                onMouseDown={keepSelection}
                onClick={() => format('insertUnorderedList')}
              >
                {copy.formatList}
              </button>
            </Hint>
            <Hint text={copy.formatLinkTitle}>
              <button type="button" disabled={frozen} onMouseDown={keepSelection} onClick={addLink}>
                {copy.formatLink}
              </button>
            </Hint>
            <Hint text={copy.formatCodeTitle}>
              <button type="button" disabled={frozen} onMouseDown={keepSelection} onClick={addCode}>
                {copy.formatCode}
              </button>
            </Hint>
          </div>
          <div
            ref={surface}
            className="wiki wysiwyg"
            contentEditable={frozen ? 'false' : 'true'}
            role="textbox"
            aria-multiline="true"
            aria-label={copy.ticketHeading}
            suppressContentEditableWarning
          />
          <p>{copy.fileHint}</p>
          <button
            ref={dropRef}
            type="button"
            className="drop"
            disabled={frozen}
            onClick={() => picker.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
          >
            {copy.dropHint}
          </button>
          <input
            ref={picker}
            className="file-input"
            type="file"
            accept={fileTypes.map((extension) => `.${extension}`).join(',')}
            disabled={frozen}
            onChange={(event) => {
              chooseFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          {fileError ? <p role="alert">{fileError}</p> : null}
          <FileTable
            rows={files.map((file) => ({
              key: file.id,
              name: file.name,
              bytes: file.bytes,
              at: file.createdAt,
              href: `/api/v1/staff/tickets/work/${code}/files/${file.id}`,
              action: frozen ? null : (
                <Hint text={copy.deleteFile}>
                  <button
                    type="button"
                    aria-label={copy.deleteFile}
                    onClick={() => {
                      pendingDelete.current = file.id;
                      setConfirming('delete');
                    }}
                  >
                    D
                  </button>
                </Hint>
              ),
            }))}
          />
        </>
      ) : null}
      {confirming ? (
        <div ref={dialogRef} className="confirm" role="dialog">
          <p>
            {confirming === 'delete'
              ? copy.confirmDelete
              : confirming === 'ask'
                ? copy.confirmAsk
                : confirming === 'close'
                  ? copy.confirmFinish
                  : `${confirming === 'text' ? copy.saveText : copy.addFile}?`}
          </p>
          <button
            type="button"
            onClick={() => {
              const kind = confirming;
              setConfirming(null);
              if (kind === 'text') void saveText();
              if (kind === 'file') void storeFile();
              if (kind === 'delete') void removeFile();
              if (kind === 'ask') void askAssignee();
              if (kind === 'close') void finishTicket();
            }}
          >
            {copy.confirmYes}
          </button>
          <button type="button" onClick={() => setConfirming(null)}>
            {copy.confirmNo}
          </button>
        </div>
      ) : null}
    </>
  );
}

function FileTable({
  rows,
}: {
  rows: Array<{
    key: string;
    name: string;
    bytes: number;
    at: string;
    href: string;
    action?: ReactNode;
  }>;
}) {
  const { copy } = useLocale();
  const removable = rows.some((row) => row.action != null);
  return (
    <div className="ticket-scroll">
      <table className="ticket-table">
        <thead>
          <tr>
            <th scope="col">{copy.fileName}</th>
            <th scope="col">{copy.fileBytes}</th>
            <th scope="col">{copy.fileDate}</th>
            <th scope="col">{copy.fileDownload}</th>
            {removable ? <th scope="col">{copy.deleteFile}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.name}</td>
              <td>{formatBytes(row.bytes)}</td>
              <td>{formatWhen(row.at)}</td>
              <td>
                <a href={row.href}>{copy.fileDownload}</a>
              </td>
              {removable ? <td>{row.action ?? null}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('de-AT')} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('de-AT', { maximumFractionDigits: 1 })} MB`;
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('de-AT', { timeZone: 'Europe/Vienna' });
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? '');
      resolve(value.includes(',') ? value.slice(value.indexOf(',') + 1) : value);
    };
    reader.onerror = () => reject(new Error('file'));
    reader.readAsDataURL(file);
  });
}

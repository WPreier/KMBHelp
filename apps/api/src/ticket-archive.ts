import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { asc, eq, isNull, and, or, isNotNull } from 'drizzle-orm';
import {
  appSetting,
  category,
  ticket,
  ticketFile,
  ticketHistory,
  type Database,
} from '@kmbhelp/db';
import { renderMarkdownHtml } from '@kmbhelp/shared';
import { renderTextPdf } from './text-pdf.js';

const archiveKey = 'ticket.archive_day';

export function archiveDirectory(env: NodeJS.ProcessEnv): string {
  const chosen = env.TICKET_ARCHIVE_DIR?.trim();
  if (chosen) return chosen;
  if (env.NODE_ENV === 'production') return '/var/lib/kmbhelp/archiv';
  const root = env.LOCALAPPDATA?.trim() || env.HOME?.trim() || '';
  return root ? join(root, 'kmbhelp', 'archiv') : '';
}

export function viennaClock(now: Date): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Vienna',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    minutes: Number(value('hour')) * 60 + Number(value('minute')),
  };
}

export function archiveDue(now: Date, lastDay: string | null): boolean {
  const due = lastWorkdayEvening(now);
  if (!due) return false;
  return lastDay === null || lastDay < due;
}

export function lastWorkdayEvening(now: Date): string | null {
  const clock = viennaClock(now);
  let cursor = clock.date;
  if (weekday(cursor) <= 5 && clock.minutes >= 23 * 60) return cursor;
  for (let step = 0; step < 7; step += 1) {
    cursor = shiftDate(cursor, -1);
    if (weekday(cursor) <= 5) return cursor;
  }
  return null;
}

export function ticketTexts(input: {
  code: string;
  subject: string;
  category: string;
  impact: string;
  priority: string;
  dueOn: string | null;
  requesterName: string | null;
  body: string;
  workingMarkdown: string | null;
  files: string[];
  history?: string | undefined;
}): { summary: string; verdict: string; markdown: string } {
  const due = input.dueOn ?? 'kein Datum';
  const who = input.requesterName?.trim() || 'ohne Namen';
  const first = input.body.replace(/\s+/gu, ' ').trim();
  const verdict = (first || input.subject).slice(0, 180);
  const summary = [
    `Ticket ${input.code}: ${input.subject}.`,
    `Kategorie ${input.category}, Wirkung ${input.impact}, Priorität ${input.priority}, fällig ${due}.`,
    `Eingereicht von ${who}.`,
    first ? `Beschreibung: ${first.slice(0, 400)}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const markdown = [
    `# Ticket ${input.code}`,
    '',
    `- Kategorie: ${input.category}`,
    `- Wirkung: ${input.impact}`,
    `- Betreff: ${input.subject}`,
    `- Fällig am: ${due}`,
    `- Eingereicht von: ${who}`,
    `- Priorität: ${input.priority}`,
    '',
    '## Beschreibung',
    '',
    input.body,
    '',
    '## Historie',
    '',
    input.history?.trim() || 'keine',
    '',
    '## Bearbeitung',
    '',
    input.workingMarkdown?.trim() || input.body,
    '',
    '## Dateien',
    '',
    ...(input.files.length > 0 ? input.files.map((name) => `- ${name}`) : ['- keine']),
    '',
    '## Fazit',
    '',
    verdict,
    '',
    '## Summary',
    '',
    summary,
    '',
  ].join('\n');
  return { summary, verdict, markdown };
}

export function formatTicketHistory(input: {
  createdAt: Date;
  requester: string;
  description: string;
  changes: { at: Date; actor: string; text: string }[];
}): string {
  const rule = '-'.repeat(40);
  const who = input.requester.trim() || 'Anwender';
  const lines = [
    `Ticket am ${viennaStamp(input.createdAt)}, Von ${who}, Beschreibung`,
    input.description.trim(),
  ];
  for (const change of input.changes) {
    lines.push(
      rule,
      `${viennaStamp(change.at)}, ${change.actor}, Beschreibung`,
      change.text.trim(),
    );
  }
  return lines.join('\n');
}

function viennaStamp(date: Date): string {
  const parts = new Intl.DateTimeFormat('de-AT', {
    timeZone: 'Europe/Vienna',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('day')}.${part('month')}.${part('year')} ${part('hour')}:${part('minute')}`;
}

export function archiveIndexHtml(input: {
  code: string;
  markdown: string;
  files: Array<{ name: string; bytes: number; modifiedAt: string }>;
}): string {
  const rows =
    input.files.length === 0
      ? '<tr><td colspan="3">keine</td></tr>'
      : input.files
          .map((file) => {
            const name = safeTicketFileName(file.name);
            const when = new Date(file.modifiedAt).toLocaleString('de-AT', {
              timeZone: 'Europe/Vienna',
            });
            return `<tr><td><a href="dateien/${encodeURIComponent(name)}">${escapeHtml(name)}</a></td><td>${formatBytes(file.bytes)}</td><td>${escapeHtml(when)}</td></tr>`;
          })
          .join('');
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <title>Ticket ${escapeHtml(input.code)}</title>
  <style>
    body { margin: 2rem auto; max-width: 52rem; color: #1c2430; font-family: "Segoe UI", sans-serif; line-height: 1.5; }
    header { border-bottom: 2px solid #1f4e79; margin-bottom: 1.5rem; padding-bottom: 0.8rem; }
    nav a { margin-right: 1rem; }
    article h1 { font-size: 1.5rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 0.4rem 0.2rem; border-bottom: 1px solid #d5dbe3; text-align: left; }
    pre { overflow: auto; background: #f4f7fb; padding: 0.8rem; }
  </style>
</head>
<body>
  <header>
    <p>KMBHelp Archiv</p>
    <h1>Ticket ${escapeHtml(input.code)}</h1>
    <nav>
      <a href="summary.md">Summary</a>
      <a href="fazit.md">Fazit</a>
      <a href="ticket.pdf">ticket.pdf</a>
      <a href="ticket.md">ticket.md</a>
    </nav>
  </header>
  <article>${renderMarkdownHtml(input.markdown)}</article>
  <h2>Dateien</h2>
  <table>
    <thead><tr><th>Name</th><th>Größe</th><th>Datum</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>
`;
}

export async function readArchiveTicket(
  env: NodeJS.ProcessEnv,
  code: string,
): Promise<{
  markdown: string;
  files: Array<{ name: string; bytes: number; modifiedAt: string }>;
} | null> {
  if (!/^\d{2}-\d{4}$/u.test(code)) return null;
  const root = archiveDirectory(env);
  if (!root) return null;
  const folder = join(root, code);
  try {
    const markdown = await readFile(join(folder, 'ticket.md'), 'utf8');
    const names = await readdir(join(folder, 'dateien')).catch(() => [] as string[]);
    const files = [];
    for (const name of names) {
      const info = await stat(join(folder, 'dateien', safeTicketFileName(name)));
      if (!info.isFile()) continue;
      files.push({ name, bytes: info.size, modifiedAt: info.mtime.toISOString() });
    }
    return { markdown, files };
  } catch {
    return null;
  }
}

const archiveDocuments: Record<string, string> = {
  'summary.md': 'text/markdown; charset=utf-8',
  'fazit.md': 'text/markdown; charset=utf-8',
  'ticket.md': 'text/markdown; charset=utf-8',
  'ticket.pdf': 'application/pdf',
  'index.html': 'text/html; charset=utf-8',
};

export async function readArchiveDocument(
  env: NodeJS.ProcessEnv,
  code: string,
  name: string,
): Promise<{ bytes: Buffer; mediaType: string } | null> {
  const mediaType = archiveDocuments[name];
  if (!mediaType || !/^\d{2}-\d{4}$/u.test(code)) return null;
  const root = archiveDirectory(env);
  if (!root) return null;
  try {
    return { bytes: await readFile(join(root, code, name)), mediaType };
  } catch {
    return null;
  }
}

export async function readArchiveFile(
  env: NodeJS.ProcessEnv,
  code: string,
  name: string,
): Promise<Buffer | null> {
  if (!/^\d{2}-\d{4}$/u.test(code)) return null;
  const root = archiveDirectory(env);
  if (!root) return null;
  const safe = safeTicketFileName(name);
  if (safe !== name) return null;
  try {
    return await readFile(join(root, code, 'dateien', safe));
  } catch {
    return null;
  }
}

export function safeTicketFileName(name: string): string {
  const base = name.split(/[/\\]/u).pop() ?? 'datei';
  const cleaned = base
    .replace(/[^\w.\- ]+/gu, '_')
    .replace(/^\.+/u, '')
    .slice(0, 180);
  return cleaned || 'datei';
}

export async function runTicketArchive(options: {
  database: Database | undefined;
  env: NodeJS.ProcessEnv;
  now?: Date;
}): Promise<number> {
  const database = options.database;
  if (!database) return 0;
  const now = options.now ?? new Date();
  const stored = await database.db
    .select({ value: appSetting.value })
    .from(appSetting)
    .where(eq(appSetting.key, archiveKey));
  const lastDay = stored[0]?.value ?? null;
  if (!archiveDue(now, lastDay)) return 0;
  const due = lastWorkdayEvening(now);
  const rows = await database.db
    .select({
      id: ticket.id,
      code: ticket.code,
      createdAt: ticket.createdAt,
      subject: ticket.subject,
      impact: ticket.impact,
      priority: ticket.priority,
      dueOn: ticket.dueOn,
      requesterName: ticket.requesterName,
      body: ticket.body,
      workingMarkdown: ticket.workingMarkdown,
      category: category.labelDe,
    })
    .from(ticket)
    .innerJoin(category, eq(ticket.categoryCode, category.code))
    .where(
      and(
        isNull(ticket.archivedAt),
        or(isNotNull(ticket.closeRequestedAt), eq(ticket.status, 'closed')),
      ),
    );
  const root = archiveDirectory(options.env);
  if (rows.length > 0 && !root) throw new Error('ticket archive directory missing');
  for (const row of rows) {
    const files = await database.db
      .select({
        name: ticketFile.name,
        contentBase64: ticketFile.contentBase64,
        createdAt: ticketFile.createdAt,
      })
      .from(ticketFile)
      .where(eq(ticketFile.ticketId, row.id));
    const changes = await database.db
      .select({
        at: ticketHistory.at,
        actor: ticketHistory.actor,
        text: ticketHistory.body,
      })
      .from(ticketHistory)
      .where(eq(ticketHistory.ticketId, row.id))
      .orderBy(asc(ticketHistory.at));
    const history = formatTicketHistory({
      createdAt: row.createdAt,
      requester: row.requesterName ?? '',
      description: row.body,
      changes,
    });
    const text = ticketTexts({
      code: row.code,
      subject: row.subject,
      category: row.category,
      impact: row.impact,
      priority: row.priority,
      dueOn: row.dueOn,
      requesterName: row.requesterName,
      body: row.body,
      workingMarkdown: row.workingMarkdown,
      files: files.map((file) => file.name),
      history,
    });
    const folder = join(root, safeCode(row.code));
    await mkdir(join(folder, 'dateien'), { recursive: true });
    await writeFile(join(folder, 'ticket.md'), text.markdown, 'utf8');
    await writeFile(join(folder, 'summary.md'), text.summary, 'utf8');
    await writeFile(join(folder, 'fazit.md'), text.verdict, 'utf8');
    await writeFile(
      join(folder, 'ticket.pdf'),
      renderTextPdf(`Ticket ${row.code}`, text.markdown.split('\n')),
    );
    const stored = [];
    for (const file of files) {
      const name = safeTicketFileName(file.name);
      const bytes = Buffer.from(file.contentBase64, 'base64');
      await writeFile(join(folder, 'dateien', name), bytes);
      stored.push({ name, bytes: bytes.length, modifiedAt: file.createdAt.toISOString() });
    }
    await writeFile(
      join(folder, 'index.html'),
      archiveIndexHtml({ code: row.code, markdown: text.markdown, files: stored }),
      'utf8',
    );
    await database.db.transaction(async (tx) => {
      await tx
        .update(ticket)
        .set({
          summary: text.summary,
          verdict: text.verdict,
          body: '',
          workingMarkdown: null,
          requesterName: null,
          requesterEmail: null,
          status: 'closed',
          closedAt: now,
          archivedAt: now,
          updatedAt: now,
        })
        .where(eq(ticket.id, row.id));
      await tx.delete(ticketFile).where(eq(ticketFile.ticketId, row.id));
    });
  }
  if (due) {
    await database.db
      .insert(appSetting)
      .values({ key: archiveKey, value: due })
      .onConflictDoUpdate({ target: appSetting.key, set: { value: due } });
  }
  return rows.length;
}

function safeCode(code: string): string {
  return /^\d{2}-\d{4}$/u.test(code) ? code : 'ticket';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('de-AT')} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('de-AT', { maximumFractionDigits: 1 })} MB`;
}

function weekday(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, day ?? 1));
  const value = utc.getUTCDay();
  return value === 0 ? 7 : value;
}

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, (day ?? 1) + days));
  return utc.toISOString().slice(0, 10);
}

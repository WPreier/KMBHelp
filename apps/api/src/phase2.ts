import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  category,
  faqArticle,
  knowledgeArticle,
  staffSearch,
  ticket,
  ticketEvent,
  type Database,
} from '@kmbhelp/db';
import {
  calendarDate,
  categoryOptionSchema,
  createTicketSchema,
  createdTicketSchema,
  departmentLabel,
  faqArticleSchema,
  faqSummarySchema,
  impacts,
  knowledgeArticleSchema,
  priorities,
  publicErrors,
  publicTicketActionSchema,
  publicTicketSchema,
  publicTicketStateSchema,
  resolvePriority,
  searchHitSchema,
  searchQuerySchema,
  staffTicketSchema,
  ticketStatuses,
  type PublicTicket,
  type SearchHit,
  type StaffTicket,
} from '@kmbhelp/shared';
import { optionalStaff, readRequestCookie, requireStaff, SESSION_COOKIE } from './auth.js';
import { categoryTitleExplainer, type SearchExplainer } from './explain.js';
import {
  createRateLimiter,
  databaseDown,
  PublicError,
  queryHash,
  rateLimited,
  writeAccessLog,
} from './http.js';

const openStatuses = ['open', 'inactive', 'expired', 'waiting_approval', 'manual'] as const;
const recentStatuses = ['in_progress', 'closed'] as const;

export type Phase2Options = {
  database: Database | undefined;
  testAuthEnabled: boolean;
  now?: (() => Date) | undefined;
  explainer?: SearchExplainer | undefined;
  ticketCreateLimit?: number | undefined;
  searchLimit?: number | undefined;
};

export function registerPhase2(app: FastifyInstance, options: Phase2Options): void {
  const now = options.now ?? (() => new Date());
  const explainer = options.explainer ?? categoryTitleExplainer;
  const ticketLimiter = createRateLimiter(options.ticketCreateLimit ?? 10, 60_000);
  const searchLimiter = createRateLimiter(options.searchLimit ?? 30, 60_000);
  const changeLimiter = createRateLimiter(30, 60_000);

  function db(): Database {
    if (!options.database) throw databaseDown();
    return options.database;
  }

  app.post('/api/v1/tickets', async (request) => {
    const parsed = createTicketSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    if (!ticketLimiter.allow(request.ip || 'unknown')) throw rateLimited();
    const input = parsed.data;
    const database = db();
    const today = calendarDate(now());
    const decision = resolvePriority({
      impact: input.impact,
      dueOn: input.dueOn ?? null,
      today,
      clientPriority: input.clientPriority ?? null,
    });
    const created = await database.db.transaction(async (tx) => {
      const known = await tx
        .select({ code: category.code })
        .from(category)
        .where(eq(category.code, input.categoryCode));
      if (!known[0]) throw new PublicError(400, 'unknown_category', publicErrors.unknownCategory);
      const rows = await tx
        .insert(ticket)
        .values({
          type: 'incident',
          categoryCode: input.categoryCode,
          status: 'open',
          impact: input.impact,
          priority: decision.priority,
          priorityReason: decision.reason,
          source: input.source,
          subject: input.subject,
          body: input.body,
          requesterName: input.requesterName ?? null,
          dueOn: input.dueOn ?? null,
        })
        .returning({ id: ticket.id, number: ticket.number });
      const row = rows[0];
      if (!row) throw new Error('ticket insert returned no row');
      await tx.insert(ticketEvent).values({
        ticketId: row.id,
        kind: 'created',
        payload: { source: input.source, priority: decision.priority, reason: decision.reason },
      });
      return row;
    });
    await writeAccessLog(database, request, created.id);
    return createdTicketSchema.parse({
      number: created.number,
      priority: decision.priority,
      priorityReason: decision.reason,
    });
  });

  app.get('/api/v1/tickets/public', async (request) => {
    const database = db();
    const current = now();
    await expireDueTickets(database, calendarDate(current));
    const rows = await database.db
      .select({
        number: ticket.number,
        groupCode: category.groupCode,
        categoryCode: category.code,
        categoryLabelDe: category.labelDe,
        categoryLabelEn: category.labelEn,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        dueOn: ticket.dueOn,
        createdAt: ticket.createdAt,
      })
      .from(ticket)
      .innerJoin(category, eq(ticket.categoryCode, category.code))
      .where(ne(ticket.status, 'closed'))
      .orderBy(asc(category.groupCode), asc(ticket.priority), asc(ticket.createdAt));
    await writeAccessLog(database, request);
    return {
      tickets: rows.map((row) => publicFields(row, current)),
    };
  });

  app.post<{ Params: { number: string } }>('/api/v1/tickets/public/:number', async (request) => {
    const number = Number(request.params.number);
    if (!Number.isInteger(number) || number < 1) {
      throw new PublicError(404, 'not_found', publicErrors.notFound);
    }
    const parsed = publicTicketActionSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    if (!changeLimiter.allow(request.ip || 'unknown')) throw rateLimited();
    const database = db();
    const current = now();
    await expireDueTickets(database, calendarDate(current));
    const rows = await database.db
      .select({
        id: ticket.id,
        status: ticket.status,
        priority: ticket.priority,
      })
      .from(ticket)
      .where(eq(ticket.number, number));
    const row = rows[0];
    if (!row) throw new PublicError(404, 'not_found', publicErrors.notFound);
    const next = await applyPublicAction(database, row, parsed.data, current);
    await writeAccessLog(database, request, row.id);
    return publicTicketStateSchema.parse({ number, ...next });
  });

  app.get('/api/v1/staff/tickets', async (request) => {
    if (!options.testAuthEnabled && !readRequestCookie(request, SESSION_COOKIE)) {
      throw new PublicError(401, 'unauthorized', publicErrors.unauthorized);
    }
    const database = db();
    await requireStaff(database, request, options.testAuthEnabled, now());
    const current = now();
    const openRows = await database.db
      .select(staffColumns())
      .from(ticket)
      .innerJoin(category, eq(ticket.categoryCode, category.code))
      .where(inArray(ticket.status, [...openStatuses]))
      .orderBy(asc(ticket.priority), asc(ticket.createdAt));
    const recentRows = await database.db
      .select(staffColumns())
      .from(ticket)
      .innerJoin(category, eq(ticket.categoryCode, category.code))
      .where(inArray(ticket.status, [...recentStatuses]))
      .orderBy(desc(ticket.updatedAt))
      .limit(10);
    return {
      open: openRows.map((row) => toStaffTicket(row, current, false)),
      recent: recentRows.map((row) => toStaffTicket(row, current, true)),
    };
  });

  app.get('/api/v1/categories', async () => {
    const database = db();
    const rows = await database.db
      .select({
        code: category.code,
        groupCode: category.groupCode,
        labelDe: category.labelDe,
        labelEn: category.labelEn,
      })
      .from(category)
      .orderBy(asc(category.groupCode), asc(category.labelDe));
    return {
      categories: rows.map((row) => {
        const group = departmentLabel(row.groupCode);
        return categoryOptionSchema.parse({
          code: row.code,
          groupCode: row.groupCode,
          groupLabelDe: group.de,
          groupLabelEn: group.en,
          labelDe: row.labelDe,
          labelEn: row.labelEn,
        });
      }),
    };
  });

  app.get('/api/v1/faq', async (request) => {
    const database = db();
    const rows = await database.db
      .select({
        slug: faqArticle.slug,
        titleDe: faqArticle.titleDe,
        titleEn: faqArticle.titleEn,
      })
      .from(faqArticle)
      .where(eq(faqArticle.published, true))
      .orderBy(asc(faqArticle.titleDe));
    await writeAccessLog(database, request);
    return { articles: rows.map((row) => faqSummarySchema.parse(row)) };
  });

  app.get<{ Params: { slug: string } }>('/api/v1/faq/:slug', async (request) => {
    if (!/^[a-z0-9_]{1,64}$/.test(request.params.slug)) {
      throw new PublicError(404, 'not_found', publicErrors.notFound);
    }
    const database = db();
    const rows = await database.db
      .select({
        slug: faqArticle.slug,
        titleDe: faqArticle.titleDe,
        titleEn: faqArticle.titleEn,
        bodyDe: faqArticle.bodyDe,
        bodyEn: faqArticle.bodyEn,
      })
      .from(faqArticle)
      .where(and(eq(faqArticle.slug, request.params.slug), eq(faqArticle.published, true)));
    await writeAccessLog(database, request);
    const row = rows[0];
    if (!row) throw new PublicError(404, 'not_found', publicErrors.notFound);
    return faqArticleSchema.parse(row);
  });

  app.get<{ Params: { id: string } }>('/api/v1/knowledge/:id', async (request) => {
    if (!z.string().uuid().safeParse(request.params.id).success) {
      throw new PublicError(404, 'not_found', publicErrors.notFound);
    }
    const database = db();
    const rows = await database.db
      .select({
        id: knowledgeArticle.id,
        title: knowledgeArticle.title,
        body: knowledgeArticle.body,
      })
      .from(knowledgeArticle)
      .where(
        and(
          eq(knowledgeArticle.id, request.params.id),
          eq(knowledgeArticle.status, 'published'),
          eq(knowledgeArticle.redacted, true),
        ),
      );
    await writeAccessLog(database, request);
    const row = rows[0];
    if (!row) throw new PublicError(404, 'not_found', publicErrors.notFound);
    return knowledgeArticleSchema.parse(row);
  });

  app.get('/api/v1/search', async (request) => {
    const parsed = searchQuerySchema.safeParse(request.query);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    if (!searchLimiter.allow(request.ip || 'unknown')) throw rateLimited();
    const database = db();
    const actor = await optionalStaff(database, request, options.testAuthEnabled, now());
    const query = parsed.data.q.trim();
    const hits =
      query.length < 2 ? [] : await searchContent(database, query, actor !== null, explainer);
    if (actor && hits.length > 0) {
      const sentence = explainer.explain({ kind: hits[0]?.kind ?? 'faq', title: '' });
      await database.db.insert(staffSearch).values({
        staffId: actor.id,
        queryHash: queryHash(query),
        sentenceDe: sentence.de,
        sentenceEn: sentence.en,
        hitIds: hits.map((hit) => ({ kind: hit.kind, id: hit.id })),
      });
    }
    await writeAccessLog(database, request);
    return { hits };
  });
}

function publicFields(
  row: {
    number: number;
    groupCode: string;
    categoryCode: string;
    categoryLabelDe: string;
    categoryLabelEn: string;
    subject: string;
    status: string;
    priority: string;
    dueOn: string | null;
    createdAt: Date;
  },
  current: Date,
): PublicTicket {
  const group = departmentLabel(row.groupCode);
  return publicTicketSchema.parse({
    number: row.number,
    groupCode: row.groupCode,
    groupLabelDe: group.de,
    groupLabelEn: group.en,
    categoryCode: row.categoryCode,
    categoryLabelDe: row.categoryLabelDe,
    categoryLabelEn: row.categoryLabelEn,
    subject: row.subject,
    status: enumValue(ticketStatuses, row.status),
    priority: enumValue(priorities, row.priority),
    ageSeconds: elapsedSeconds(row.createdAt, current),
    dueOn: row.dueOn,
  });
}

async function expireDueTickets(database: Database, today: string): Promise<void> {
  const due = await database.db
    .update(ticket)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(
      and(
        eq(ticket.status, 'open'),
        sql`${ticket.dueOn} is not null and ${ticket.dueOn} < ${today}`,
      ),
    )
    .returning({ id: ticket.id });
  if (due.length === 0) return;
  await database.db.insert(ticketEvent).values(
    due.map((row) => ({
      ticketId: row.id,
      kind: 'expired',
      payload: { reason: 'due_date' },
    })),
  );
}

async function applyPublicAction(
  database: Database,
  row: { id: string; status: string; priority: string },
  action: { action: 'toggle' | 'close' | 'priority'; priority?: 'p1' | 'p2' | 'p3' },
  current: Date,
): Promise<{ status: string; priority: string }> {
  if (row.status === 'closed') {
    throw new PublicError(409, 'cannot_reopen', publicErrors.cannotReopen);
  }
  if (action.action === 'close') {
    await database.db.transaction(async (tx) => {
      await tx
        .update(ticket)
        .set({ status: 'closed', closedAt: current, updatedAt: current })
        .where(eq(ticket.id, row.id));
      await tx.insert(ticketEvent).values({
        ticketId: row.id,
        kind: 'closed',
        payload: { source: 'web' },
      });
    });
    return { status: 'closed', priority: row.priority };
  }
  if (action.action === 'priority') {
    const priority = action.priority ?? row.priority;
    await database.db.transaction(async (tx) => {
      await tx
        .update(ticket)
        .set({ priority, priorityReason: 'manual', updatedAt: current })
        .where(eq(ticket.id, row.id));
      await tx.insert(ticketEvent).values({
        ticketId: row.id,
        kind: 'priority_changed',
        payload: { priority },
      });
    });
    return { status: row.status, priority };
  }
  if (row.status === 'open') {
    await database.db.transaction(async (tx) => {
      await tx
        .update(ticket)
        .set({ status: 'inactive', updatedAt: current })
        .where(eq(ticket.id, row.id));
      await tx.insert(ticketEvent).values({
        ticketId: row.id,
        kind: 'deactivated',
        payload: {},
      });
    });
    return { status: 'inactive', priority: row.priority };
  }
  if (row.status === 'inactive') {
    await database.db.transaction(async (tx) => {
      await tx
        .update(ticket)
        .set({ status: 'open', updatedAt: current })
        .where(eq(ticket.id, row.id));
      await tx.insert(ticketEvent).values([
        { ticketId: row.id, kind: 'reopened', payload: {} },
        { ticketId: row.id, kind: 'notification', payload: { audience: 'all' } },
      ]);
    });
    return { status: 'open', priority: row.priority };
  }
  throw new PublicError(409, 'not_toggleable', publicErrors.notToggleable);
}

function staffColumns() {
  return {
    id: ticket.id,
    number: ticket.number,
    categoryCode: category.code,
    categoryLabelDe: category.labelDe,
    categoryLabelEn: category.labelEn,
    status: ticket.status,
    impact: ticket.impact,
    priority: ticket.priority,
    priorityReason: ticket.priorityReason,
    subject: ticket.subject,
    body: ticket.body,
    requesterEmail: ticket.requesterEmail,
    requesterName: ticket.requesterName,
    dueOn: ticket.dueOn,
    source: ticket.source,
    createdAt: ticket.createdAt,
    closedAt: ticket.closedAt,
  };
}

type StaffRow = {
  id: string;
  number: number;
  categoryCode: string;
  categoryLabelDe: string;
  categoryLabelEn: string;
  status: string;
  impact: string;
  priority: string;
  priorityReason: string;
  subject: string;
  body: string;
  requesterEmail: string | null;
  requesterName: string | null;
  dueOn: string | null;
  source: string;
  createdAt: Date;
  closedAt: Date | null;
};

function toStaffTicket(row: StaffRow, current: Date, withDuration: boolean): StaffTicket {
  const end = row.closedAt ?? current;
  return staffTicketSchema.parse({
    id: row.id,
    number: row.number,
    categoryCode: row.categoryCode,
    categoryLabelDe: row.categoryLabelDe,
    categoryLabelEn: row.categoryLabelEn,
    status: enumValue(ticketStatuses, row.status),
    impact: enumValue(impacts, row.impact),
    priority: enumValue(priorities, row.priority),
    priorityReason: row.priorityReason,
    subject: row.subject,
    body: row.body,
    requesterEmail: row.requesterEmail,
    requesterName: row.requesterName,
    dueOn: row.dueOn,
    source: row.source,
    ageSeconds: elapsedSeconds(row.createdAt, current),
    durationSeconds: withDuration ? elapsedSeconds(row.createdAt, end) : null,
  });
}

async function searchContent(
  database: Database,
  query: string,
  includeTickets: boolean,
  explainer: SearchExplainer,
): Promise<SearchHit[]> {
  const pattern = likePattern(query);
  const faq = await database.pool.query<{ slug: string; title_de: string; title_en: string }>(
    `select slug, title_de, title_en
     from faq_article
     where published = true
       and (
         to_tsvector('german', title_de || ' ' || title_en || ' ' || body_de || ' ' || body_en)
           @@ plainto_tsquery('german', $1)
         or title_de ilike $2 escape '\\'
         or title_en ilike $2 escape '\\'
       )
     order by title_de
     limit 20`,
    [query, pattern],
  );
  const articles = await database.pool.query<{ id: string; title: string }>(
    `select id, title
     from knowledge_article
     where status = 'published' and redacted = true
       and (
         to_tsvector('german', title || ' ' || body) @@ plainto_tsquery('german', $1)
         or title ilike $2 escape '\\'
       )
     order by title
     limit 20`,
    [query, pattern],
  );
  const hits: SearchHit[] = [
    ...faq.rows.map((row) =>
      toHit(explainer, {
        kind: 'faq',
        id: row.slug,
        titleDe: row.title_de,
        titleEn: row.title_en,
        href: `/faq/${row.slug}`,
      }),
    ),
    ...articles.rows.map((row) =>
      toHit(explainer, {
        kind: 'article',
        id: row.id,
        titleDe: row.title,
        titleEn: row.title,
        href: `/wissen/${row.id}`,
      }),
    ),
  ];
  if (includeTickets) {
    const tickets = await database.pool.query<{ id: string; subject: string }>(
      `select ticket.id, ticket.subject
       from ticket
       join category on category.code = ticket.category_code
       where to_tsvector(
           'german',
           ticket.subject || ' ' || ticket.body || ' ' || category.label_de || ' ' || category.label_en
         ) @@ plainto_tsquery('german', $1)
         or ticket.subject ilike $2 escape '\\'
         or category.label_de ilike $2 escape '\\'
         or category.label_en ilike $2 escape '\\'
       order by ticket.created_at desc
       limit 20`,
      [query, pattern],
    );
    hits.push(
      ...tickets.rows.map((row) =>
        toHit(explainer, {
          kind: 'ticket',
          id: row.id,
          titleDe: row.subject,
          titleEn: row.subject,
          href: null,
        }),
      ),
    );
  }
  return hits.slice(0, 20);
}

function toHit(
  explainer: SearchExplainer,
  hit: {
    kind: SearchHit['kind'];
    id: string;
    titleDe: string;
    titleEn: string;
    href: string | null;
  },
): SearchHit {
  const sentence = explainer.explain({ kind: hit.kind, title: hit.titleDe });
  return searchHitSchema.parse({ ...hit, sentenceDe: sentence.de, sentenceEn: sentence.en });
}

function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

function elapsedSeconds(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

function enumValue<T extends string>(values: readonly T[], value: string): T {
  const found = values.find((entry) => entry === value);
  if (!found) throw new PublicError(500, 'internal_error', publicErrors.internal);
  return found;
}

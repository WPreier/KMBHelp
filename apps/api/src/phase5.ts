import { createHash, timingSafeEqual } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  accessLog,
  appSetting,
  backupTestDetail,
  certificate,
  changeDetail,
  changeFreeze,
  portal,
  procurement,
  procurementPolicy,
  remoteSupportDetail,
  retentionLocation,
  securityIncidentDetail,
  supplier,
  ticket,
  ticketEvent,
  type Database,
} from '@kmbhelp/db';
import {
  backupCloseSchema,
  backupTestInputSchema,
  calendarDate,
  certificateInputSchema,
  changeInputSchema,
  changeOutcomeSchema,
  checklistUpdateSchema,
  freezeInputSchema,
  offboardingInputSchema,
  portalInputSchema,
  processCreatedSchema,
  procurementDecisionSchema,
  procurementInputSchema,
  procurementPolicySchema,
  publicErrors,
  remoteSupportInputSchema,
  resolvePriority,
  retentionInputSchema,
  securityDowngradeSchema,
  securityIncidentInputSchema,
  supplierInputSchema,
} from '@kmbhelp/shared';
import { assertCsrf, localhostAdmin, requireStaff, staffFromSession } from './auth.js';
import {
  createSecretToken,
  databaseDown,
  PublicError,
  rateLimited,
  createRateLimiter,
} from './http.js';
import { mailerFromEnv, type Mailer } from './graph.js';
import {
  accessReviewDays,
  addCalendarDays,
  backupFollowUpDays,
  certificateBands,
  dateInFreeze,
  daysUntil,
  deadline72h,
  defaultAccessLogDays,
  offboardingSteps,
  procurementRoute,
  retentionReviewDays,
  reviewDue,
  supplierCanSupport,
  supervisorTokenDays,
} from './process-rules.js';

export type Phase5Options = {
  database: Database | undefined;
  testAuthEnabled: boolean;
  adminAllowlist?: string | undefined;
  now?: (() => Date) | undefined;
  mailer?: Mailer | undefined;
  env?: NodeJS.ProcessEnv | undefined;
};

export function registerPhase5(app: FastifyInstance, options: Phase5Options): void {
  const now = options.now ?? (() => new Date());
  const env = options.env ?? process.env;
  const mailer = options.mailer ?? mailerFromEnv(env);
  const decisionLimiter = createRateLimiter(20, 60_000);

  function db(): Database {
    if (!options.database) throw databaseDown();
    return options.database;
  }

  async function actor(request: FastifyRequest): Promise<{ id: string | null }> {
    const local = localhostAdmin(request, env);
    if (local) return { id: null };
    const database = db();
    const session = await staffFromSession(database, request, now());
    if (session && !session.mfaPending) {
      assertCsrf(session, request);
      return { id: session.staffId };
    }
    const staff = await requireStaff(database, request, options.testAuthEnabled, now());
    return { id: staff.id };
  }

  async function admin(request: FastifyRequest): Promise<void> {
    const local = localhostAdmin(request, env);
    if (local) return;
    const database = db();
    const session = await staffFromSession(database, request, now());
    if (!session || session.mfaPending || !session.isLocalAdmin) {
      throw new PublicError(401, 'unauthorized', publicErrors.unauthorized);
    }
    assertCsrf(session, request);
  }

  app.get('/api/v1/staff/processes', async (request) => {
    await actor(request);
    const database = db();
    const [freezes, policyRows, suppliers, certificates] = await Promise.all([
      database.db.select().from(changeFreeze).where(eq(changeFreeze.active, true)),
      database.db.select().from(procurementPolicy).where(eq(procurementPolicy.id, 'default')),
      database.db
        .select({
          id: supplier.id,
          name: supplier.name,
          status: supplier.status,
        })
        .from(supplier),
      database.db
        .select({
          id: certificate.id,
          systemName: certificate.systemName,
          expiresOn: certificate.expiresOn,
        })
        .from(certificate),
    ]);
    const policy = policyRows[0];
    return {
      freezes: freezes.map((window) => ({
        code: window.code,
        label: window.label,
        onDate: window.onDate,
        dayOfMonthFrom: window.dayOfMonthFrom,
        dayOfMonthTo: window.dayOfMonthTo,
      })),
      policy: {
        directBelow: Number(policy?.directBelow ?? 100),
        tokenUntil: Number(policy?.tokenUntil ?? 500),
      },
      suppliers,
      certificates,
    };
  });

  app.post('/api/v1/staff/changes', async (request) => {
    const who = await actor(request);
    const parsed = changeInputSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const input = parsed.data;
    const database = db();
    const windows = await database.db.select().from(changeFreeze);
    if (dateInFreeze(input.scheduledFor, windows) && !input.exceptionReason) {
      throw new PublicError(422, 'freeze_exception', publicErrors.freezeException);
    }
    const decision = resolvePriority({
      impact: 'workplace',
      dueOn: input.scheduledFor,
      today: calendarDate(now()),
      clientPriority: null,
    });
    const created = await insertTicket(database, {
      type: 'change',
      categoryCode: 'bmd',
      catalogCode: 'plan_change',
      status: 'open',
      impact: 'workplace',
      priority: decision.priority,
      priorityReason: decision.reason,
      subject: input.summary,
      body: input.fallbackText ?? input.summary,
      dueOn: input.scheduledFor,
      actorId: who.id,
    });
    await database.db.insert(changeDetail).values({
      ticketId: created.id,
      summary: input.summary,
      scheduledFor: new Date(`${input.scheduledFor}T00:00:00.000Z`),
      fallbackText: input.fallbackText ?? null,
      systems: input.systems ?? null,
      touchesFreeze: dateInFreeze(input.scheduledFor, windows),
      exceptionReason: input.exceptionReason ?? null,
    });
    return processCreatedSchema.parse({ number: created.number, status: 'open' });
  });

  app.post('/api/v1/staff/changes/:number/approve', async (request) => {
    const who = await actor(request);
    const database = db();
    const row = await ticketByNumber(database, numberOf(request), 'change');
    const detail = await database.db
      .select({ fallbackText: changeDetail.fallbackText })
      .from(changeDetail)
      .where(eq(changeDetail.ticketId, row.id));
    if (!detail[0]?.fallbackText?.trim()) {
      throw new PublicError(422, 'fallback_required', publicErrors.fallbackRequired);
    }
    await database.db.insert(ticketEvent).values({
      ticketId: row.id,
      kind: 'approved',
      actorStaffId: who.id,
      payload: {},
    });
    return { ok: true };
  });

  app.post('/api/v1/staff/changes/:number/outcome', async (request) => {
    const who = await actor(request);
    const parsed = changeOutcomeSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const database = db();
    const row = await ticketByNumber(database, numberOf(request), 'change');
    const approved = await database.db
      .select({ id: ticketEvent.id })
      .from(ticketEvent)
      .where(and(eq(ticketEvent.ticketId, row.id), eq(ticketEvent.kind, 'approved')))
      .limit(1);
    if (!approved[0])
      throw new PublicError(422, 'fallback_required', publicErrors.fallbackRequired);
    await database.db
      .update(changeDetail)
      .set({ outcome: parsed.data.outcome })
      .where(eq(changeDetail.ticketId, row.id));
    await database.db
      .update(ticket)
      .set({ status: 'closed', closedAt: now(), updatedAt: now() })
      .where(eq(ticket.id, row.id));
    await database.db.insert(ticketEvent).values({
      ticketId: row.id,
      kind: 'outcome',
      actorStaffId: who.id,
      payload: { outcome: parsed.data.outcome },
    });
    return { ok: true };
  });

  app.post('/api/v1/admin/procurement-policy', async (request) => {
    await admin(request);
    const parsed = procurementPolicySchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const database = db();
    await database.db
      .insert(procurementPolicy)
      .values({
        id: 'default',
        directBelow: parsed.data.directBelow.toFixed(2),
        tokenUntil: parsed.data.tokenUntil.toFixed(2),
      })
      .onConflictDoUpdate({
        target: procurementPolicy.id,
        set: {
          directBelow: parsed.data.directBelow.toFixed(2),
          tokenUntil: parsed.data.tokenUntil.toFixed(2),
        },
      });
    return { ok: true };
  });

  app.post('/api/v1/staff/procurement', async (request) => {
    const who = await actor(request);
    const parsed = procurementInputSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const input = parsed.data;
    const database = db();
    const policyRows = await database.db
      .select()
      .from(procurementPolicy)
      .where(eq(procurementPolicy.id, 'default'));
    const directBelow = Number(policyRows[0]?.directBelow ?? 100);
    const tokenUntil = Number(policyRows[0]?.tokenUntil ?? 500);
    const route = procurementRoute(input.amountNet, directBelow, tokenUntil);
    if (route === 'token' && !input.supervisorEmail) {
      throw new PublicError(422, 'supervisor_required', publicErrors.supervisorRequired);
    }
    const status = route === 'token' ? 'waiting_approval' : route === 'manual' ? 'manual' : 'open';
    const token = route === 'token' ? createSecretToken() : null;
    const created = await insertTicket(database, {
      type: 'procurement',
      categoryCode: 'hardware',
      catalogCode: 'order_hardware',
      status,
      impact: 'cosmetic',
      priority: 'p3',
      priorityReason: 'no_deadline',
      subject: input.article,
      body: input.reason,
      dueOn: input.wantedOn ?? null,
      actorId: who.id,
    });
    await database.db.insert(procurement).values({
      ticketId: created.id,
      article: input.article,
      reason: input.reason,
      amountNet: input.amountNet.toFixed(2),
      supplierId: input.supplierId ?? null,
      wantedOn: input.wantedOn ?? null,
      supervisorEmail: input.supervisorEmail ?? null,
      supervisorTokenHash: token ? tokenHash(token) : null,
      supervisorTokenExpiresAt: token
        ? new Date(now().getTime() + supervisorTokenDays * 86_400_000)
        : null,
      route,
    });
    await database.db.insert(ticketEvent).values({
      ticketId: created.id,
      kind: 'procurement_routed',
      actorStaffId: who.id,
      payload: { route, amountNet: input.amountNet.toFixed(2), directBelow, tokenUntil },
    });
    if (token && input.supervisorEmail && mailer.configured) {
      const origin = publicOrigin(env);
      await mailer
        .send({
          to: input.supervisorEmail,
          subject: `Beschaffung ${created.number}`,
          text: `${input.article}\n${input.amountNet.toFixed(2)} EUR\n${origin}/beschaffung/${token}\n`,
        })
        .catch(() => undefined);
    }
    return processCreatedSchema.parse({
      number: created.number,
      status,
      route,
      ...(token ? { decisionPath: `/beschaffung/${token}` } : {}),
    });
  });

  app.post('/api/v1/procurement/decision', async (request) => {
    if (!decisionLimiter.allow(request.ip || 'unknown')) throw rateLimited();
    const parsed = procurementDecisionSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const database = db();
    const rows = await database.db
      .select({
        ticketId: procurement.ticketId,
        article: procurement.article,
        amountNet: procurement.amountNet,
        currency: procurement.currency,
        hash: procurement.supervisorTokenHash,
        expiresAt: procurement.supervisorTokenExpiresAt,
        decidedAt: procurement.decidedAt,
      })
      .from(procurement)
      .where(eq(procurement.route, 'token'));
    const hash = tokenHash(parsed.data.token);
    const row = rows.find((item) => item.hash !== null && safeEqual(item.hash, hash));
    if (!row) throw new PublicError(404, 'not_found', publicErrors.notFound);
    if (row.decidedAt || !row.expiresAt || row.expiresAt.getTime() <= now().getTime()) {
      throw new PublicError(422, 'decision_closed', publicErrors.decisionClosed);
    }
    if (!parsed.data.decision) {
      return {
        article: row.article,
        amountNet: row.amountNet,
        currency: row.currency,
        state: 'open' as const,
      };
    }
    await database.db
      .update(procurement)
      .set({
        decidedAt: now(),
        decidedByEmail: null,
        supervisorTokenHash: null,
      })
      .where(eq(procurement.ticketId, row.ticketId));
    await database.db
      .update(ticket)
      .set({
        status: parsed.data.decision === 'approved' ? 'open' : 'closed',
        closedAt: parsed.data.decision === 'rejected' ? now() : null,
        updatedAt: now(),
      })
      .where(eq(ticket.id, row.ticketId));
    await database.db.insert(ticketEvent).values({
      ticketId: row.ticketId,
      kind: 'supervisor_decision',
      payload: { decision: parsed.data.decision },
    });
    return {
      article: row.article,
      amountNet: row.amountNet,
      currency: row.currency,
      state: 'closed' as const,
    };
  });

  app.post('/api/v1/staff/suppliers', async (request) => {
    const who = await actor(request);
    const parsed = supplierInputSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const input = parsed.data;
    const database = db();
    const rows = await database.db
      .insert(supplier)
      .values({
        name: input.name,
        purpose: input.purpose,
        countryCode: input.countryCode.toUpperCase(),
        avvOn: input.avvOn ?? null,
        confidentialityOn: input.confidentialityOn ?? null,
        subprocessorsKnown: input.subprocessorsKnown,
        subprocessorsText: input.subprocessorsText,
        status: 'draft',
        recordRef: input.recordRef ?? null,
      })
      .returning({ id: supplier.id });
    const created = rows[0];
    if (!created) throw new PublicError(500, 'internal_error', publicErrors.internal);
    await database.db.insert(ticketEvent).values({
      ticketId: await supplierTicket(database, created.id, input.name, who.id),
      kind: 'supplier_draft',
      actorStaffId: who.id,
      payload: { supplierId: created.id },
    });
    return { id: created.id, status: 'draft' };
  });

  app.post('/api/v1/staff/suppliers/:id/approve', async (request) => {
    const who = await actor(request);
    const database = db();
    const id = (request.params as { id?: string }).id ?? '';
    const rows = await database.db.select().from(supplier).where(eq(supplier.id, id));
    const row = rows[0];
    if (!row) throw new PublicError(404, 'not_found', publicErrors.notFound);
    if (!supplierCanSupport({ ...row, status: 'approved' })) {
      throw new PublicError(422, 'supplier_not_approved', publicErrors.supplierNotApproved);
    }
    await database.db
      .update(supplier)
      .set({ status: 'approved', approvedByStaffId: who.id, approvedAt: now() })
      .where(eq(supplier.id, id));
    return { ok: true };
  });

  app.post('/api/v1/staff/remote-support', async (request) => {
    const who = await actor(request);
    const parsed = remoteSupportInputSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const input = parsed.data;
    const start = new Date(input.windowStart);
    const end = new Date(input.windowEnd);
    if (end.getTime() <= start.getTime()) {
      throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    }
    const database = db();
    const rows = await database.db.select().from(supplier).where(eq(supplier.id, input.supplierId));
    const row = rows[0];
    if (!row || !supplierCanSupport(row)) {
      throw new PublicError(422, 'supplier_not_approved', publicErrors.supplierNotApproved);
    }
    const created = await insertTicket(database, {
      type: 'remote_support',
      categoryCode: 'external_adviser',
      catalogCode: null,
      status: 'open',
      impact: 'workplace',
      priority: 'p2',
      priorityReason: 'single_workplace',
      subject: `Fernwartung ${row.name}`,
      body: input.accountName,
      dueOn: null,
      actorId: who.id,
    });
    await database.db.insert(remoteSupportDetail).values({
      ticketId: created.id,
      supplierId: row.id,
      windowStart: start,
      windowEnd: end,
      accountName: input.accountName,
    });
    await database.db.insert(ticketEvent).values({
      ticketId: created.id,
      kind: 'released',
      actorStaffId: who.id,
      payload: { accountName: input.accountName },
    });
    return processCreatedSchema.parse({ number: created.number, status: 'open' });
  });

  app.post('/api/v1/staff/backup-tests', async (request) => {
    const who = await actor(request);
    const parsed = backupTestInputSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const input = parsed.data;
    const database = db();
    const created = await insertTicket(database, {
      type: 'backup_test',
      categoryCode: 'payroll_run',
      catalogCode: 'restore_backup',
      status: 'open',
      impact: 'workplace',
      priority: 'p2',
      priorityReason: 'deadline_later',
      subject: `Sicherungstest ${input.systemName}`,
      body: input.systemName,
      dueOn: input.backupTakenOn,
      actorId: who.id,
    });
    await database.db.insert(backupTestDetail).values({
      ticketId: created.id,
      systemName: input.systemName,
      backupTakenOn: input.backupTakenOn,
    });
    return processCreatedSchema.parse({ number: created.number, status: 'open' });
  });

  app.post('/api/v1/staff/backup-tests/:number/close', async (request) => {
    const who = await actor(request);
    const parsed = backupCloseSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    if (typeof parsed.data.restored !== 'boolean') {
      throw new PublicError(422, 'backup_restore_required', publicErrors.backupRestoreRequired);
    }
    const database = db();
    const row = await ticketByNumber(database, numberOf(request), 'backup_test');
    const detail = await database.db
      .select({ systemName: backupTestDetail.systemName })
      .from(backupTestDetail)
      .where(eq(backupTestDetail.ticketId, row.id));
    const systemName = detail[0]?.systemName ?? 'System';
    const today = calendarDate(now());
    await database.db
      .update(backupTestDetail)
      .set({
        restored: parsed.data.restored,
        restoredTo: parsed.data.restoredTo,
        resultText: parsed.data.resultText,
        durationMinutes: parsed.data.durationMinutes,
      })
      .where(eq(backupTestDetail.ticketId, row.id));
    await database.db
      .update(ticket)
      .set({ status: 'closed', closedAt: now(), updatedAt: now() })
      .where(eq(ticket.id, row.id));
    const followUp = await insertTicket(database, {
      type: 'backup_test',
      categoryCode: 'payroll_run',
      catalogCode: 'restore_backup',
      status: 'open',
      impact: 'workplace',
      priority: 'p3',
      priorityReason: 'deadline_later',
      subject: `Nächster Sicherungstest ${systemName}`.slice(0, 200),
      body: systemName,
      dueOn: addCalendarDays(today, backupFollowUpDays),
      actorId: who.id,
    });
    await database.db.insert(backupTestDetail).values({
      ticketId: followUp.id,
      systemName,
    });
    await database.db.insert(ticketEvent).values({
      ticketId: row.id,
      kind: 'backup_closed',
      actorStaffId: who.id,
      payload: { restored: parsed.data.restored, followUp: followUp.number },
    });
    return { number: followUp.number, dueOn: addCalendarDays(today, backupFollowUpDays) };
  });

  app.post('/api/v1/staff/security-incidents', async (request) => {
    const who = await actor(request);
    const parsed = securityIncidentInputSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const detectedAt = new Date(parsed.data.detectedAt);
    const deadline = deadline72h(detectedAt);
    const database = db();
    const created = await insertTicket(database, {
      type: 'security_incident',
      categoryCode: 'phishing',
      catalogCode: null,
      status: 'open',
      impact: 'filing',
      priority: 'p1',
      priorityReason: 'security_incident',
      subject: 'Sicherheitsvorfall',
      body: parsed.data.affected,
      dueOn: deadline.toISOString().slice(0, 10),
      actorId: who.id,
    });
    await database.db.insert(securityIncidentDetail).values({
      ticketId: created.id,
      detectedAt,
      deadlineAt: deadline,
      isolated: parsed.data.isolated ?? null,
      clientNotice: parsed.data.clientNotice ?? 'open',
    });
    return {
      number: created.number,
      priority: 'p1' as const,
      deadlineAt: deadline.toISOString(),
    };
  });

  app.post('/api/v1/staff/security-incidents/:number/priority', async (request) => {
    const who = await actor(request);
    const parsed = securityDowngradeSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    if (parsed.data.priority !== 'p1' && !parsed.data.reason) {
      throw new PublicError(422, 'security_downgrade', publicErrors.securityDowngrade);
    }
    const database = db();
    const row = await ticketByNumber(database, numberOf(request), 'security_incident');
    await database.db
      .update(ticket)
      .set({
        priority: parsed.data.priority,
        priorityReason: parsed.data.reason ?? 'security_incident',
        updatedAt: now(),
      })
      .where(eq(ticket.id, row.id));
    await database.db.insert(ticketEvent).values({
      ticketId: row.id,
      kind: 'priority_changed',
      actorStaffId: who.id,
      payload: { priority: parsed.data.priority, reason: parsed.data.reason ?? '' },
    });
    return { ok: true };
  });

  app.post('/api/v1/staff/offboarding', async (request) => {
    const who = await actor(request);
    const parsed = offboardingInputSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    if (!parsed.data.dueOn) {
      throw new PublicError(422, 'offboarding_due', publicErrors.offboardingDueRequired);
    }
    const decision = resolvePriority({
      impact: 'workplace',
      dueOn: parsed.data.dueOn,
      today: calendarDate(now()),
      clientPriority: null,
    });
    const database = db();
    const created = await insertTicket(database, {
      type: 'access',
      categoryCode: 'leaver',
      catalogCode: 'offboarding',
      status: 'open',
      impact: 'workplace',
      priority: decision.priority,
      priorityReason: decision.reason,
      subject: parsed.data.subject,
      body: parsed.data.body,
      dueOn: parsed.data.dueOn,
      actorId: who.id,
    });
    await database.db.insert(ticketEvent).values(
      offboardingSteps.map((code) => ({
        ticketId: created.id,
        kind: 'checklist',
        actorStaffId: who.id,
        payload: { code, state: 'open' },
      })),
    );
    return { number: created.number, checklist: [...offboardingSteps] };
  });

  app.post('/api/v1/staff/offboarding/:number/checklist', async (request) => {
    const who = await actor(request);
    const parsed = checklistUpdateSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    if (!offboardingSteps.includes(parsed.data.code as (typeof offboardingSteps)[number])) {
      throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    }
    const database = db();
    const row = await ticketByNumber(database, numberOf(request), 'access');
    await database.db.insert(ticketEvent).values({
      ticketId: row.id,
      kind: 'checklist',
      actorStaffId: who.id,
      payload: parsed.data,
    });
    return { ok: true };
  });

  app.post('/api/v1/staff/certificates', async (request) => {
    await actor(request);
    const parsed = certificateInputSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const database = db();
    const rows = await database.db
      .insert(certificate)
      .values({
        systemName: parsed.data.systemName,
        expiresOn: parsed.data.expiresOn,
        ownerStaffId: parsed.data.ownerStaffId ?? null,
      })
      .returning({ id: certificate.id });
    return { id: rows[0]?.id };
  });

  app.post('/api/v1/staff/certificates/remind', async (request) => {
    const who = await actor(request);
    const database = db();
    const today = calendarDate(now());
    const rows = await database.db.select().from(certificate);
    const created: number[] = [];
    for (const row of rows) {
      const left = daysUntil(row.expiresOn, today);
      if (left === null) continue;
      for (const band of certificateBands(left)) {
        const marker = `certificate:${row.id}:${band}`;
        const existing = await database.db
          .select({ id: ticket.id })
          .from(ticket)
          .where(eq(ticket.internetMessageId, marker))
          .limit(1);
        if (existing[0]) continue;
        const reminder = await insertTicket(database, {
          type: 'request',
          categoryCode: 'certificate_expired',
          catalogCode: 'renew_certificate',
          status: 'open',
          impact: 'workplace',
          priority: band === 7 ? 'p1' : 'p2',
          priorityReason: 'deadline_later',
          subject: `Zertifikat ${row.systemName}`.slice(0, 200),
          body: `${row.systemName} läuft in ${left} Tagen ab.`,
          dueOn: row.expiresOn,
          actorId: who.id,
          internetMessageId: marker,
          assignedStaffId: row.ownerStaffId,
        });
        created.push(reminder.number);
      }
    }
    return { numbers: created };
  });

  app.post('/api/v1/staff/portals', async (request) => {
    await actor(request);
    const parsed = portalInputSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const database = db();
    const rows = await database.db
      .insert(portal)
      .values({
        name: parsed.data.name,
        accountName: parsed.data.accountName,
        mfa: parsed.data.mfa,
        ownerName: parsed.data.ownerName,
        ownerStaffId: parsed.data.ownerStaffId ?? null,
      })
      .returning({ id: portal.id });
    return { id: rows[0]?.id };
  });

  app.post('/api/v1/staff/retention-locations', async (request) => {
    await actor(request);
    const parsed = retentionInputSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const database = db();
    const rows = await database.db
      .insert(retentionLocation)
      .values({
        name: parsed.data.name,
        dataKind: parsed.data.dataKind,
        retentionLabel: parsed.data.retentionLabel,
        backupsFollowSamePeriod: parsed.data.backupsFollowSamePeriod,
        ownerStaffId: parsed.data.ownerStaffId ?? null,
      })
      .returning({ id: retentionLocation.id });
    return { id: rows[0]?.id };
  });

  app.post('/api/v1/admin/freezes', async (request) => {
    await admin(request);
    const parsed = freezeInputSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const input = parsed.data;
    if (!input.onDate && (input.dayOfMonthFrom === undefined || input.dayOfMonthTo === undefined)) {
      throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    }
    const database = db();
    await database.db
      .insert(changeFreeze)
      .values({
        code: input.code,
        label: input.label,
        onDate: input.onDate ?? null,
        dayOfMonthFrom: input.dayOfMonthFrom ?? null,
        dayOfMonthTo: input.dayOfMonthTo ?? null,
        weekdaysOnly: input.weekdaysOnly,
        active: true,
      })
      .onConflictDoUpdate({
        target: changeFreeze.code,
        set: {
          label: input.label,
          onDate: input.onDate ?? null,
          dayOfMonthFrom: input.dayOfMonthFrom ?? null,
          dayOfMonthTo: input.dayOfMonthTo ?? null,
          weekdaysOnly: input.weekdaysOnly,
          active: true,
        },
      });
    return { ok: true };
  });

  app.post('/api/v1/staff/reviews/run', async (request) => {
    const who = await actor(request);
    const database = db();
    const today = calendarDate(now());
    const numbers: number[] = [];
    const portals = await database.db.select().from(portal);
    for (const row of portals) {
      if (!reviewDue(row.lastReviewOn, accessReviewDays, today)) continue;
      const marker = `access-review:${row.id}:${row.lastReviewOn ?? 'none'}`;
      const existing = await database.db
        .select({ id: ticket.id })
        .from(ticket)
        .where(eq(ticket.internetMessageId, marker))
        .limit(1);
      if (existing[0]) continue;
      const created = await insertTicket(database, {
        type: 'access',
        categoryCode: 'leaver',
        catalogCode: null,
        status: 'open',
        impact: 'workplace',
        priority: 'p3',
        priorityReason: 'no_deadline',
        subject: `Berechtigungen bestätigen: ${row.name}`.slice(0, 200),
        body: row.ownerName,
        dueOn: addCalendarDays(today, accessReviewDays),
        actorId: who.id,
        internetMessageId: marker,
        assignedStaffId: row.ownerStaffId,
      });
      numbers.push(created.number);
    }
    const locations = await database.db.select().from(retentionLocation);
    for (const row of locations) {
      if (!reviewDue(row.lastReviewOn, retentionReviewDays, today)) continue;
      const marker = `retention-review:${row.id}:${row.lastReviewOn ?? 'none'}`;
      const existing = await database.db
        .select({ id: ticket.id })
        .from(ticket)
        .where(eq(ticket.internetMessageId, marker))
        .limit(1);
      if (existing[0]) continue;
      const created = await insertTicket(database, {
        type: 'retention',
        categoryCode: 'audit_export',
        catalogCode: null,
        status: 'open',
        impact: 'cosmetic',
        priority: 'p3',
        priorityReason: 'no_deadline',
        subject: `Aufbewahrung prüfen: ${row.name}`.slice(0, 200),
        body: `${row.dataKind}. ${row.retentionLabel}`,
        dueOn: addCalendarDays(today, retentionReviewDays),
        actorId: who.id,
        internetMessageId: marker,
        assignedStaffId: row.ownerStaffId,
      });
      numbers.push(created.number);
    }
    const days = await accessLogDays(database, env);
    const cutoff = new Date(now().getTime() - days * 86_400_000);
    const removed = await database.db
      .delete(accessLog)
      .where(lt(accessLog.at, cutoff))
      .returning({ id: accessLog.id });
    return { numbers, deletedAccessLogs: removed.length };
  });
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function numberOf(request: FastifyRequest): number {
  const raw = (request.params as { number?: string }).number ?? '';
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new PublicError(404, 'not_found', publicErrors.notFound);
  }
  return parsed;
}

function publicOrigin(env: NodeJS.ProcessEnv): string {
  const configured = env.PUBLIC_ORIGIN?.trim() ?? '';
  if (/^https?:\/\/[A-Za-z0-9.:-]+$/u.test(configured)) return configured.replace(/\/$/u, '');
  return 'http://127.0.0.1:5173';
}

async function accessLogDays(database: Database, env: NodeJS.ProcessEnv): Promise<number> {
  const rows = await database.db
    .select({ value: appSetting.value })
    .from(appSetting)
    .where(eq(appSetting.key, 'config.ACCESS_LOG_RETENTION_DAYS'));
  const text =
    rows[0]?.value?.trim() || env.ACCESS_LOG_RETENTION_DAYS?.trim() || String(defaultAccessLogDays);
  if (!/^\d+$/u.test(text)) return defaultAccessLogDays;
  const parsed = Number(text);
  if (parsed < 1 || parsed > 3650) return defaultAccessLogDays;
  return parsed;
}

async function ticketByNumber(database: Database, number: number, type: string) {
  const rows = await database.db
    .select({ id: ticket.id, type: ticket.type })
    .from(ticket)
    .where(eq(ticket.number, number));
  const row = rows[0];
  if (!row || row.type !== type) throw new PublicError(404, 'not_found', publicErrors.notFound);
  return row;
}

async function supplierTicket(
  database: Database,
  supplierId: string,
  name: string,
  actorId: string | null,
): Promise<string> {
  const created = await insertTicket(database, {
    type: 'supplier',
    categoryCode: 'finanzonline',
    catalogCode: 'approve_supplier',
    status: 'open',
    impact: 'cosmetic',
    priority: 'p3',
    priorityReason: 'no_deadline',
    subject: `Lieferant ${name}`.slice(0, 200),
    body: name,
    dueOn: null,
    actorId,
    internetMessageId: `supplier:${supplierId}`,
  });
  return created.id;
}

async function insertTicket(
  database: Database,
  values: {
    type: string;
    categoryCode: string;
    catalogCode: string | null;
    status: string;
    impact: 'filing' | 'payroll' | 'workplace' | 'cosmetic';
    priority: string;
    priorityReason: string;
    subject: string;
    body: string;
    dueOn: string | null;
    actorId: string | null;
    internetMessageId?: string;
    assignedStaffId?: string | null;
  },
): Promise<{ id: string; number: number }> {
  const rows = await database.db
    .insert(ticket)
    .values({
      type: values.type,
      categoryCode: values.categoryCode,
      catalogCode: values.catalogCode,
      status: values.status,
      impact: values.impact,
      priority: values.priority,
      priorityReason: values.priorityReason,
      source: 'api',
      subject: values.subject,
      body: values.body,
      dueOn: values.dueOn,
      assignedStaffId: values.assignedStaffId ?? null,
      internetMessageId: values.internetMessageId,
    })
    .returning({ id: ticket.id, number: ticket.number });
  const created = rows[0];
  if (!created) throw new PublicError(500, 'internal_error', publicErrors.internal);
  await database.db.insert(ticketEvent).values({
    ticketId: created.id,
    kind: 'created',
    actorStaffId: values.actorId,
    payload: { source: 'api', type: values.type },
  });
  return created;
}

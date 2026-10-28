import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { ChecklistItem } from '@kmbhelp/shared';

function createdAtColumn() {
  return timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
}

export const skill = pgTable('skill', {
  code: text('code').primaryKey(),
  labelDe: text('label_de').notNull(),
  labelEn: text('label_en').notNull(),
});

export const category = pgTable('category', {
  code: text('code').primaryKey(),
  groupCode: text('group_code').notNull(),
  labelDe: text('label_de').notNull(),
  labelEn: text('label_en').notNull(),
  defaultSkillCode: text('default_skill_code')
    .notNull()
    .references(() => skill.code),
});

export const staff = pgTable(
  'staff',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    username: text('username').unique(),
    displayName: text('display_name').notNull(),
    role: text('role').notNull().default('agent'),
    active: boolean('active').notNull().default(true),
    isLocalAdmin: boolean('is_local_admin').notNull().default(false),
    // Argon2id hash of the break-glass admin only. Active Directory passwords are never stored.
    passwordHash: text('password_hash'),
    adObjectId: text('ad_object_id'),
    totpCipher: text('totp_cipher'),
    mfaEnrolledAt: timestamp('mfa_enrolled_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAtColumn(),
  },
  (table) => [check('staff_role', sql`${table.role} in ('agent', 'lead', 'admin')`)],
);

export const staffSkill = pgTable(
  'staff_skill',
  {
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staff.id),
    skillCode: text('skill_code')
      .notNull()
      .references(() => skill.code),
  },
  (table) => [primaryKey({ columns: [table.staffId, table.skillCode] })],
);

export const staffCategory = pgTable(
  'staff_category',
  {
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staff.id),
    categoryCode: text('category_code')
      .notNull()
      .references(() => category.code),
  },
  (table) => [primaryKey({ columns: [table.staffId, table.categoryCode] })],
);

export const catalogItem = pgTable('catalog_item', {
  code: text('code').primaryKey(),
  type: text('type').notNull(),
  categoryCode: text('category_code')
    .notNull()
    .references(() => category.code),
  skillCode: text('skill_code')
    .notNull()
    .references(() => skill.code),
  labelDe: text('label_de').notNull(),
  labelEn: text('label_en').notNull(),
  targetMinutes: integer('target_minutes').notNull(),
  checklist: jsonb('checklist').$type<ChecklistItem[]>().notNull(),
  active: boolean('active').notNull().default(true),
});

export const ticket = pgTable(
  'ticket',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: integer('number').generatedAlwaysAsIdentity().notNull().unique(),
    type: text('type').notNull(),
    categoryCode: text('category_code')
      .notNull()
      .references(() => category.code),
    catalogCode: text('catalog_code').references(() => catalogItem.code),
    status: text('status').notNull().default('open'),
    impact: text('impact').notNull(),
    priority: text('priority').notNull(),
    priorityReason: text('priority_reason').notNull(),
    source: text('source').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    explanation: text('explanation').notNull().default(''),
    satisfaction: text('satisfaction'),
    requesterEmail: text('requester_email'),
    requesterName: text('requester_name'),
    dueOn: date('due_on', { mode: 'string' }),
    assignedStaffId: uuid('assigned_staff_id').references(() => staff.id),
    internetMessageId: text('internet_message_id').unique(),
    secretToken: text('secret_token').unique(),
    effortMinutes: integer('effort_minutes'),
    resolution: text('resolution'),
    knowledgeNeeded: boolean('knowledge_needed').notNull().default(false),
    accessKind: text('access_kind'),
    createdAt: createdAtColumn(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('ticket_status_idx').on(table.status),
    index('ticket_priority_idx').on(table.priority),
    index('ticket_due_on_idx').on(table.dueOn),
    check(
      'ticket_type',
      sql`${table.type} in ('incident', 'request', 'access', 'remote_support', 'change', 'backup_test', 'security_incident', 'asset', 'data_exchange', 'retention', 'supplier', 'knowledge', 'procurement')`,
    ),
    check('ticket_impact', sql`${table.impact} in ('filing', 'payroll', 'workplace', 'cosmetic')`),
    check('ticket_priority', sql`${table.priority} in ('p1', 'p2', 'p3')`),
    check(
      'ticket_satisfaction',
      sql`${table.satisfaction} is null or ${table.satisfaction} in ('satisfied', 'neutral', 'dissatisfied')`,
    ),
    check(
      'ticket_status',
      sql`${table.status} in ('open', 'inactive', 'expired', 'in_progress', 'waiting_approval', 'manual', 'closed')`,
    ),
    check(
      'ticket_source',
      sql`${table.source} in ('mail', 'web', 'app', 'phone', 'walkin', 'api')`,
    ),
  ],
);

export const ticketEvent = pgTable(
  'ticket_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => ticket.id),
    kind: text('kind').notNull(),
    actorStaffId: uuid('actor_staff_id').references(() => staff.id),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [index('ticket_event_ticket_idx').on(table.ticketId)],
);

export const changeFreeze = pgTable('change_freeze', {
  code: text('code').primaryKey(),
  dayOfMonthFrom: integer('day_of_month_from'),
  dayOfMonthTo: integer('day_of_month_to'),
  weekdaysOnly: boolean('weekdays_only').notNull().default(true),
  onDate: date('on_date', { mode: 'string' }),
  label: text('label').notNull(),
  active: boolean('active').notNull().default(true),
});

export const supplier = pgTable(
  'supplier',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    purpose: text('purpose').notNull(),
    countryCode: text('country_code').notNull(),
    avvOn: date('avv_on', { mode: 'string' }),
    confidentialityOn: date('confidentiality_on', { mode: 'string' }),
    subprocessorsKnown: boolean('subprocessors_known').notNull(),
    subprocessorsText: text('subprocessors_text').notNull().default(''),
    status: text('status').notNull().default('draft'),
    approvedByStaffId: uuid('approved_by_staff_id').references(() => staff.id),
    approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
    recordRef: text('record_ref'),
  },
  (table) => [check('supplier_status', sql`${table.status} in ('draft', 'approved')`)],
);

export const asset = pgTable(
  'asset',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    serialNumber: text('serial_number'),
    ownerName: text('owner_name').notNull(),
    location: text('location'),
    encryption: text('encryption').notNull().default('unknown'),
    issuedOn: date('issued_on', { mode: 'string' }),
    returnedOn: date('returned_on', { mode: 'string' }),
  },
  (table) => [check('asset_encryption', sql`${table.encryption} in ('yes', 'no', 'unknown')`)],
);

export const license = pgTable('license', {
  id: uuid('id').primaryKey().defaultRandom(),
  product: text('product').notNull(),
  seats: integer('seats').notNull(),
  expiresOn: date('expires_on', { mode: 'string' }),
  // Path or vault entry. The license key itself is never stored.
  evidenceRef: text('evidence_ref').notNull(),
});

export const certificate = pgTable('certificate', {
  id: uuid('id').primaryKey().defaultRandom(),
  systemName: text('system_name').notNull(),
  expiresOn: date('expires_on', { mode: 'string' }).notNull(),
  ownerStaffId: uuid('owner_staff_id').references(() => staff.id),
});

export const portal = pgTable('portal', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  accountName: text('account_name').notNull(),
  mfa: boolean('mfa').notNull(),
  ownerName: text('owner_name').notNull(),
  ownerStaffId: uuid('owner_staff_id').references(() => staff.id),
  lastReviewOn: date('last_review_on', { mode: 'string' }),
});

export const procurementPolicy = pgTable('procurement_policy', {
  id: text('id').primaryKey().default('default'),
  directBelow: numeric('direct_below', { precision: 12, scale: 2 }).notNull().default('100.00'),
  tokenUntil: numeric('token_until', { precision: 12, scale: 2 }).notNull().default('500.00'),
});

export const procurement = pgTable(
  'procurement',
  {
    ticketId: uuid('ticket_id')
      .primaryKey()
      .references(() => ticket.id),
    article: text('article').notNull(),
    reason: text('reason').notNull(),
    amountNet: numeric('amount_net', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('EUR'),
    supplierId: uuid('supplier_id').references(() => supplier.id),
    wantedOn: date('wanted_on', { mode: 'string' }),
    supervisorEmail: text('supervisor_email'),
    supervisorTokenHash: text('supervisor_token_hash'),
    supervisorTokenExpiresAt: timestamp('supervisor_token_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
    route: text('route').notNull(),
    decidedByEmail: text('decided_by_email'),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [check('procurement_route', sql`${table.route} in ('direct', 'token', 'manual')`)],
);

export const knowledgeArticle = pgTable(
  'knowledge_article',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    status: text('status').notNull().default('draft'),
    redacted: boolean('redacted').notNull().default(false),
    sourceTicketId: uuid('source_ticket_id').references(() => ticket.id),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [check('knowledge_status', sql`${table.status} in ('draft', 'published')`)],
);

export const faqArticle = pgTable('faq_article', {
  slug: text('slug').primaryKey(),
  titleDe: text('title_de').notNull(),
  titleEn: text('title_en').notNull(),
  bodyDe: text('body_de').notNull().default(''),
  bodyEn: text('body_en').notNull().default(''),
  published: boolean('published').notNull().default(false),
});

export const staffSearch = pgTable('staff_search', {
  id: uuid('id').primaryKey().defaultRandom(),
  at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  staffId: uuid('staff_id')
    .notNull()
    .references(() => staff.id),
  queryHash: text('query_hash').notNull(),
  sentenceDe: text('sentence_de').notNull(),
  sentenceEn: text('sentence_en').notNull(),
  hitIds: jsonb('hit_ids').$type<{ kind: string; id: string }[]>().notNull(),
});

export const activityLog = pgTable(
  'activity_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    actor: text('actor').notNull(),
    kind: text('kind').notNull(),
    target: text('target').notNull(),
    detail: text('detail').notNull(),
    ip: text('ip').notNull(),
  },
  (table) => [index('activity_log_at_idx').on(table.at)],
);

export const accessLog = pgTable(
  'access_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    ip: text('ip').notNull(),
    method: text('method').notNull(),
    path: text('path').notNull(),
    ticketId: uuid('ticket_id').references(() => ticket.id),
    userAgent: text('user_agent').notNull(),
  },
  (table) => [index('access_log_at_idx').on(table.at)],
);

export const session = pgTable('session', {
  id: uuid('id').primaryKey().defaultRandom(),
  staffId: uuid('staff_id')
    .notNull()
    .references(() => staff.id),
  mfaPending: boolean('mfa_pending').notNull().default(false),
  csrfToken: text('csrf_token').notNull().default(''),
  createdAt: createdAtColumn(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
});

export const webauthnCredential = pgTable('webauthn_credential', {
  id: uuid('id').primaryKey().defaultRandom(),
  staffId: uuid('staff_id')
    .notNull()
    .references(() => staff.id),
  credentialId: text('credential_id').notNull().unique(),
  publicKey: text('public_key').notNull(),
  counter: integer('counter').notNull().default(0),
  createdAt: createdAtColumn(),
});

export const loginAudit = pgTable(
  'login_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    staffId: uuid('staff_id').references(() => staff.id, { onDelete: 'set null' }),
    email: text('email').notNull(),
    method: text('method').notNull(),
    outcome: text('outcome').notNull(),
    ip: text('ip').notNull(),
  },
  (table) => [
    check(
      'login_audit_method',
      sql`${table.method} in ('ad_password', 'local_password', 'totp', 'webauthn', 'admin')`,
    ),
    check(
      'login_audit_outcome',
      sql`${table.outcome} in ('ok', 'denied', 'not_member', 'mfa_reset')`,
    ),
  ],
);

export const noticeSetting = pgTable(
  'notice_setting',
  {
    code: text('code').primaryKey(),
    category: text('category').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'notice_setting_category',
      sql`${table.category} in ('informational', 'warning', 'error')`,
    ),
  ],
);

export const webauthnChallenge = pgTable(
  'webauthn_challenge',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    staffId: uuid('staff_id').references(() => staff.id),
    challenge: text('challenge').notNull(),
    kind: text('kind').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [check('webauthn_kind', sql`${table.kind} in ('registration', 'authentication')`)],
);

export const changeDetail = pgTable(
  'change_detail',
  {
    ticketId: uuid('ticket_id')
      .primaryKey()
      .references(() => ticket.id),
    summary: text('summary').notNull(),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true, mode: 'date' }),
    fallbackText: text('fallback_text'),
    systems: text('systems'),
    touchesFreeze: boolean('touches_freeze').notNull().default(false),
    exceptionReason: text('exception_reason'),
    outcome: text('outcome'),
  },
  (table) => [
    check(
      'change_outcome',
      sql`${table.outcome} is null or ${table.outcome} in ('done', 'rolled_back')`,
    ),
  ],
);

export const backupTestDetail = pgTable('backup_test_detail', {
  ticketId: uuid('ticket_id')
    .primaryKey()
    .references(() => ticket.id),
  systemName: text('system_name').notNull(),
  backupTakenOn: date('backup_taken_on', { mode: 'string' }),
  restored: boolean('restored'),
  restoredTo: text('restored_to'),
  resultText: text('result_text'),
  durationMinutes: integer('duration_minutes'),
});

export const securityIncidentDetail = pgTable(
  'security_incident_detail',
  {
    ticketId: uuid('ticket_id')
      .primaryKey()
      .references(() => ticket.id),
    detectedAt: timestamp('detected_at', { withTimezone: true, mode: 'date' }).notNull(),
    deadlineAt: timestamp('deadline_at', { withTimezone: true, mode: 'date' }).notNull(),
    isolated: boolean('isolated'),
    managementInformedName: text('management_informed_name'),
    managementInformedAt: timestamp('management_informed_at', { withTimezone: true, mode: 'date' }),
    privacyInformedName: text('privacy_informed_name'),
    privacyInformedAt: timestamp('privacy_informed_at', { withTimezone: true, mode: 'date' }),
    clientNotice: text('client_notice'),
  },
  (table) => [
    check(
      'security_client_notice',
      sql`${table.clientNotice} is null or ${table.clientNotice} in ('yes', 'no', 'open')`,
    ),
  ],
);

export const remoteSupportDetail = pgTable('remote_support_detail', {
  ticketId: uuid('ticket_id')
    .primaryKey()
    .references(() => ticket.id),
  supplierId: uuid('supplier_id')
    .notNull()
    .references(() => supplier.id),
  windowStart: timestamp('window_start', { withTimezone: true, mode: 'date' }),
  windowEnd: timestamp('window_end', { withTimezone: true, mode: 'date' }),
  accountName: text('account_name'),
  endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
});

export const retentionLocation = pgTable('retention_location', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  dataKind: text('data_kind').notNull(),
  retentionLabel: text('retention_label').notNull(),
  backupsFollowSamePeriod: boolean('backups_follow_same_period').notNull(),
  lastReviewOn: date('last_review_on', { mode: 'string' }),
  ownerStaffId: uuid('owner_staff_id').references(() => staff.id),
});

export const mailLesson = pgTable('mail_lesson', {
  id: uuid('id').primaryKey().defaultRandom(),
  internetMessageId: text('internet_message_id').notNull().unique(),
  outcome: text('outcome').notNull(),
  reason: text('reason').notNull(),
  createdAt: createdAtColumn(),
});

export const appSetting = pgTable('app_setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { grantIsStale, grantSeconds, publicErrors } from '@kmbhelp/shared';
import { session, staff, type Database } from '@kmbhelp/db';
import { clientAddress, PublicError } from './http.js';
import { ipAllowed } from './network.js';

export const TEST_STAFF_HEADER = 'x-kmbhelp-test-staff';
export const SESSION_COOKIE = 'kmbhelp_session';
export const CSRF_COOKIE = 'kmbhelp_csrf';
export const CSRF_HEADER = 'x-kmbhelp-csrf';

export type StaffSession = {
  id: string;
  staffId: string;
  email: string;
  displayName: string;
  isLocalAdmin: boolean;
  helpdesk: boolean;
  mfaPending: boolean;
  csrfToken: string;
};

export type TicketViewer = {
  audience: 'administrator' | 'user' | 'anonymous';
  email: string | null;
  name: string | null;
};

export function readRuntimeAuth(env: NodeJS.ProcessEnv): { testAuthEnabled: boolean } {
  const flag = env.ALLOW_TEST_AUTH?.trim() ?? '';
  if (env.NODE_ENV === 'production' && flag !== '') {
    throw new Error('ALLOW_TEST_AUTH must not be set in production');
  }
  return { testAuthEnabled: env.NODE_ENV !== 'production' && flag === '1' };
}

export function readRequestCookie(request: FastifyRequest, name: string): string | null {
  const header = request.headers.cookie;
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

export async function staffFromTestHeader(
  database: Database,
  request: FastifyRequest,
  testAuthEnabled: boolean,
): Promise<{ id: string }> {
  if (!testAuthEnabled) {
    throw new PublicError(401, 'unauthorized', publicErrors.unauthorized);
  }
  const header = request.headers[TEST_STAFF_HEADER];
  if (typeof header !== 'string' || !header.includes('@')) {
    throw new PublicError(401, 'unauthorized', publicErrors.unauthorized);
  }
  const email = header.trim().toLowerCase();
  const rows = await database.db
    .select({ id: staff.id })
    .from(staff)
    .where(and(sql`lower(${staff.email}) = ${email}`, eq(staff.active, true)));
  const found = rows[0];
  if (!found) throw new PublicError(401, 'unauthorized', publicErrors.unauthorized);
  return found;
}

export async function staffFromSession(
  database: Database,
  request: FastifyRequest,
  now: Date,
): Promise<StaffSession | null> {
  const sessionId = readRequestCookie(request, SESSION_COOKIE);
  if (!sessionId) return null;
  const rows = await database.db
    .select({
      id: session.id,
      staffId: staff.id,
      email: staff.email,
      displayName: staff.displayName,
      isLocalAdmin: staff.isLocalAdmin,
      helpdesk: staff.helpdesk,
      mfaPending: session.mfaPending,
      csrfToken: session.csrfToken,
    })
    .from(session)
    .innerJoin(staff, eq(session.staffId, staff.id))
    .where(
      and(
        eq(session.id, sessionId),
        isNull(session.revokedAt),
        gt(session.expiresAt, now),
        eq(staff.active, true),
      ),
    );
  return rows[0] ?? null;
}

const localhostAdminId = '00000000-0000-0000-0000-000000000000';

export function serviceTokenMatches(
  request: FastifyRequest,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const expected = env.MCP_SERVICE_TOKEN?.trim() ?? '';
  const header = request.headers.authorization;
  if (expected.length < 16 || typeof header !== 'string') return false;
  const match = /^Bearer (\S+)$/u.exec(header.trim());
  const presented = match?.[1] ?? '';
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
}

export function localhostSkipsSignIn(
  ip: string,
  _forwardedFor: string,
  env: NodeJS.ProcessEnv,
): boolean {
  if (env.NODE_ENV === 'test') return false;
  const normalized = ip.trim().replace(/^::ffff:/u, '');
  return normalized === '::1' || ipAllowed(normalized, '127.0.0.0/8');
}

export function localhostAdmin(request: FastifyRequest, env = process.env): StaffSession | null {
  const forwarded = request.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? (forwarded[0] ?? '') : (forwarded ?? '');
  if (!localhostSkipsSignIn(clientAddress(request), raw, env)) return null;
  return {
    id: localhostAdminId,
    staffId: localhostAdminId,
    email: 'localhost',
    displayName: 'Administrator',
    isLocalAdmin: true,
    helpdesk: true,
    mfaPending: false,
    csrfToken: 'localhost',
  };
}

export async function ticketViewer(
  database: Database,
  request: FastifyRequest,
  now: Date,
  testAuthEnabled: boolean,
): Promise<TicketViewer> {
  if (localhostAdmin(request)) return { audience: 'administrator', email: null, name: null };
  const current = await staffFromSession(database, request, now);
  if (current && !current.mfaPending) {
    return {
      audience: current.isLocalAdmin || current.helpdesk ? 'administrator' : 'user',
      email: current.email,
      name: current.displayName || current.email,
    };
  }
  if (testAuthEnabled) {
    const header = request.headers[TEST_STAFF_HEADER];
    if (typeof header === 'string' && header.includes('@')) {
      return { audience: 'administrator', email: header.trim().toLowerCase(), name: null };
    }
  }
  if (process.env.NODE_ENV === 'test') {
    return { audience: 'administrator', email: null, name: null };
  }
  return { audience: 'anonymous', email: null, name: null };
}

export async function renewGrant(
  database: Database,
  request: FastifyRequest,
  now: Date,
): Promise<{ id: string; csrf: string } | null> {
  const sessionId = readRequestCookie(request, SESSION_COOKIE);
  if (!sessionId) return null;
  const rows = await database.db
    .select({
      id: session.id,
      csrf: session.csrfToken,
      renewedAt: session.renewedAt,
      mfaPending: session.mfaPending,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
    })
    .from(session)
    .where(eq(session.id, sessionId));
  const row = rows[0];
  if (!row || row.revokedAt || row.mfaPending || row.expiresAt <= now) return null;
  if (!grantIsStale(row.renewedAt, now)) return null;
  await database.db
    .update(session)
    .set({
      renewedAt: now,
      expiresAt: new Date(now.getTime() + grantSeconds * 1000),
    })
    .where(eq(session.id, row.id));
  return { id: row.id, csrf: row.csrf };
}

export function assertCsrf(current: StaffSession, request: FastifyRequest): void {
  if (current.csrfToken === 'localhost') return;
  const header = request.headers[CSRF_HEADER];
  if (typeof header !== 'string' || header === '' || header !== current.csrfToken) {
    throw new PublicError(403, 'csrf_invalid', publicErrors.csrfInvalid);
  }
}

export async function requireStaff(
  database: Database,
  request: FastifyRequest,
  testAuthEnabled: boolean,
  now: Date,
): Promise<{ id: string }> {
  const current = await staffFromSession(database, request, now);
  if (current && !current.mfaPending) return { id: current.staffId };
  if (!testAuthEnabled) throw new PublicError(401, 'unauthorized', publicErrors.unauthorized);
  const header = request.headers[TEST_STAFF_HEADER];
  if (typeof header !== 'string' || header.trim() === '') {
    throw new PublicError(401, 'unauthorized', publicErrors.unauthorized);
  }
  return staffFromTestHeader(database, request, testAuthEnabled);
}

export async function optionalStaff(
  database: Database,
  request: FastifyRequest,
  testAuthEnabled: boolean,
  now: Date,
): Promise<{ id: string } | null> {
  const current = await staffFromSession(database, request, now);
  if (current && !current.mfaPending) return { id: current.staffId };
  if (!testAuthEnabled) return null;
  const header = request.headers[TEST_STAFF_HEADER];
  if (typeof header !== 'string' || header.trim() === '') return null;
  return staffFromTestHeader(database, request, testAuthEnabled);
}

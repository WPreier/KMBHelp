import type { FastifyRequest } from 'fastify';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { publicErrors } from '@kmbhelp/shared';
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
  isLocalAdmin: boolean;
  mfaPending: boolean;
  csrfToken: string;
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
      isLocalAdmin: staff.isLocalAdmin,
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
    isLocalAdmin: true,
    mfaPending: false,
    csrfToken: 'localhost',
  };
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

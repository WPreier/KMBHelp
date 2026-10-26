import { randomBytes } from 'node:crypto';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import {
  category,
  loginAudit,
  session,
  skill,
  staff,
  staffCategory,
  staffSkill,
  webauthnChallenge,
  webauthnCredential,
  type Database,
} from '@kmbhelp/db';
import {
  adminAccessSchema,
  adminPasswordSchema,
  adminStaffSchema,
  loginRequestSchema,
  loginResultSchema,
  publicErrors,
  sessionViewSchema,
  totpConfirmSchema,
  totpSetupSchema,
} from '@kmbhelp/shared';
import {
  assertCsrf,
  CSRF_COOKIE,
  SESSION_COOKIE,
  staffFromSession,
  type StaffSession,
} from './auth.js';
import { DirectoryUnavailable, type Directory, type DirectoryAccount } from './directory.js';
import {
  clientAddress,
  createRateLimiter,
  databaseDown,
  PublicError,
  rateLimited,
} from './http.js';
import { ipAllowed } from './network.js';
import { hashLocalPassword, verifyLocalPassword } from './passwords.js';
import { encodeBase32, openSecret, randomTotpSecret, sealSecret, totpMatches } from './totp.js';

const pendingSeconds = 15 * 60;
const sessionSeconds = 12 * 60 * 60;

export type Phase3Options = {
  database: Database | undefined;
  directory: Directory;
  sessionSecret: string;
  adminAllowlist: string;
  rpId: string;
  origin: string;
  now?: (() => Date) | undefined;
};

export function registerPhase3(app: FastifyInstance, options: Phase3Options): void {
  const now = options.now ?? (() => new Date());
  const limiter = createRateLimiter(10, 60_000);

  function db(): Database {
    if (!options.database) throw databaseDown();
    return options.database;
  }

  app.get('/api/v1/auth/session', async (request) => {
    if (!options.database) return sessionViewSchema.parse({ signedIn: false, isLocalAdmin: false });
    const current = await staffFromSession(options.database, request, now());
    if (!current || current.mfaPending)
      return sessionViewSchema.parse({ signedIn: false, isLocalAdmin: false });
    return sessionViewSchema.parse({ signedIn: true, isLocalAdmin: current.isLocalAdmin });
  });

  app.post('/api/v1/auth/login', async (request, reply) => {
    if (!limiter.allow(request.ip || 'unknown')) throw rateLimited();
    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const database = db();
    const email = parsed.data.email.trim().toLowerCase();
    const password = parsed.data.password ?? '';
    const code = parsed.data.code?.replace(/\s/gu, '') ?? '';
    const local = await findLocalAdmin(database, email);
    const person = local ?? (await findByEmail(database, email));
    if (person?.mfaEnrolledAt) {
      if (!code) {
        return loginResultSchema.parse({
          step: 'mfa',
          methods: await enrolledMethods(database, person.id),
          passwordRequired: false,
        });
      }
      if (!totpCodeMatches(options.sessionSecret, person.totpCipher, code, now())) {
        await writeAudit(database, request, person.id, email, 'totp', 'denied');
        throw denied();
      }
      if (!local)
        await requireMember(options.directory, database, request, person.id, person.email, 'totp');
      const opened = await replaceSession(database, person.id, false, now());
      setSessionCookies(reply, request, opened.id, opened.csrf, sessionSeconds);
      await writeAudit(database, request, person.id, email, 'totp', 'ok');
      return loginResultSchema.parse({ step: 'staff', isLocalAdmin: person.isLocalAdmin });
    }
    if (!password) throw denied();
    if (local) {
      if (!local.passwordHash || !(await verifyLocalPassword(local.passwordHash, password))) {
        await writeAudit(database, request, local.id, email, 'local_password', 'denied');
        throw denied();
      }
      const opened = await replaceSession(database, local.id, true, now());
      setSessionCookies(reply, request, opened.id, opened.csrf, pendingSeconds);
      await writeAudit(database, request, local.id, email, 'local_password', 'ok');
      return loginResultSchema.parse({ step: 'enroll' });
    }
    let account: DirectoryAccount | null;
    try {
      account = await options.directory.verifyPassword(email, password);
    } catch (error) {
      if (error instanceof DirectoryUnavailable) {
        throw new PublicError(503, 'directory_unavailable', publicErrors.directoryUnavailable);
      }
      throw error;
    }
    if (!account || !account.active || !account.inHelpdeskGroup) {
      await writeAudit(
        database,
        request,
        null,
        email,
        'ad_password',
        account ? 'not_member' : 'denied',
      );
      throw denied();
    }
    const saved = await saveDirectoryAccount(database, account);
    const opened = await replaceSession(database, saved.id, true, now());
    setSessionCookies(reply, request, opened.id, opened.csrf, pendingSeconds);
    await writeAudit(database, request, saved.id, email, 'ad_password', 'ok');
    return loginResultSchema.parse({ step: 'enroll' });
  });

  app.post('/api/v1/auth/totp/setup', async (request) => {
    const database = db();
    const current = await pending(database, request, now());
    assertCsrf(current, request);
    if (options.sessionSecret.trim().length < 16) {
      throw new PublicError(503, 'directory_unavailable', publicErrors.directoryUnavailable);
    }
    const secret = randomTotpSecret();
    await database.db
      .update(staff)
      .set({ totpCipher: sealSecret(options.sessionSecret, secret) })
      .where(eq(staff.id, current.staffId));
    const label = encodeURIComponent(current.email);
    const encoded = encodeBase32(secret);
    return totpSetupSchema.parse({
      secret: encoded,
      otpauth: `otpauth://totp/KMBHelp:${label}?secret=${encoded}&issuer=KMBHelp&algorithm=SHA1&digits=6&period=30`,
    });
  });

  app.post('/api/v1/auth/totp/confirm', async (request, reply) => {
    const parsed = totpConfirmSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const database = db();
    const current = await pending(database, request, now());
    assertCsrf(current, request);
    const rows = await database.db
      .select({ totpCipher: staff.totpCipher, isLocalAdmin: staff.isLocalAdmin })
      .from(staff)
      .where(eq(staff.id, current.staffId));
    const row = rows[0];
    if (!row || !totpCodeMatches(options.sessionSecret, row.totpCipher, parsed.data.code, now())) {
      throw denied();
    }
    await database.db
      .update(staff)
      .set({ mfaEnrolledAt: now() })
      .where(eq(staff.id, current.staffId));
    const csrf = await promoteSession(database, current.id, now());
    setSessionCookies(reply, request, current.id, csrf, sessionSeconds);
    await writeAudit(database, request, current.staffId, current.email, 'totp', 'ok');
    return loginResultSchema.parse({ step: 'staff', isLocalAdmin: row.isLocalAdmin });
  });

  app.post('/api/v1/auth/webauthn/register/options', async (request) => {
    const database = db();
    const current = await pending(database, request, now());
    assertCsrf(current, request);
    const existing = await credentialsFor(database, current.staffId);
    const registration = await generateRegistrationOptions({
      rpName: 'KMBHelp',
      rpID: options.rpId,
      userName: current.email,
      userID: new TextEncoder().encode(current.staffId),
      attestationType: 'none',
      excludeCredentials: existing.map((item) => ({
        id: item.credentialId,
        type: 'public-key' as const,
      })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });
    await storeChallenge(database, current.staffId, registration.challenge, 'registration', now());
    return registration;
  });

  app.post('/api/v1/auth/webauthn/register/verify', async (request, reply) => {
    const database = db();
    const current = await pending(database, request, now());
    assertCsrf(current, request);
    const response = request.body as RegistrationResponseJSON | null;
    if (!response || typeof response !== 'object') throw denied();
    const challenge = await consumeChallenge(
      database,
      current.staffId,
      response,
      'registration',
      now(),
    );
    let verified = false;
    try {
      const result = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: options.origin,
        expectedRPID: options.rpId,
        requireUserVerification: false,
      });
      verified = result.verified;
      if (result.verified) {
        await database.db.insert(webauthnCredential).values({
          staffId: current.staffId,
          credentialId: result.registrationInfo.credential.id,
          publicKey: Buffer.from(result.registrationInfo.credential.publicKey).toString(
            'base64url',
          ),
          counter: result.registrationInfo.credential.counter,
        });
      }
    } catch {
      verified = false;
    }
    if (!verified) throw denied();
    await database.db
      .update(staff)
      .set({ mfaEnrolledAt: now() })
      .where(eq(staff.id, current.staffId));
    const csrf = await promoteSession(database, current.id, now());
    setSessionCookies(reply, request, current.id, csrf, sessionSeconds);
    await writeAudit(database, request, current.staffId, current.email, 'webauthn', 'ok');
    return loginResultSchema.parse({ step: 'staff', isLocalAdmin: current.isLocalAdmin });
  });

  app.post('/api/v1/auth/webauthn/login/options', async (request) => {
    if (!limiter.allow(request.ip || 'unknown')) throw rateLimited();
    const parsed = loginRequestSchema.pick({ email: true }).safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const database = db();
    const email = parsed.data.email.trim().toLowerCase();
    const person = await findByEmail(database, email);
    const existing = person ? await credentialsFor(database, person.id) : [];
    if (!person?.mfaEnrolledAt || existing.length === 0) throw denied();
    const authentication = await generateAuthenticationOptions({
      rpID: options.rpId,
      allowCredentials: existing.map((item) => ({
        id: item.credentialId,
        type: 'public-key' as const,
      })),
      userVerification: 'preferred',
    });
    await storeChallenge(database, person.id, authentication.challenge, 'authentication', now());
    return authentication;
  });

  app.post('/api/v1/auth/webauthn/login/verify', async (request, reply) => {
    if (!limiter.allow(request.ip || 'unknown')) throw rateLimited();
    const database = db();
    const response = request.body as AuthenticationResponseJSON | null;
    if (!response || typeof response !== 'object') throw denied();
    const challengeValue = readChallenge(response);
    if (!challengeValue) throw denied();
    const stored = await database.db
      .select()
      .from(webauthnChallenge)
      .where(
        and(
          eq(webauthnChallenge.challenge, challengeValue),
          eq(webauthnChallenge.kind, 'authentication'),
          isNull(webauthnChallenge.consumedAt),
        ),
      );
    const row = stored[0];
    if (!row?.staffId || row.expiresAt <= now()) throw denied();
    await database.db
      .update(webauthnChallenge)
      .set({ consumedAt: now() })
      .where(eq(webauthnChallenge.id, row.id));
    const credential = await database.db
      .select()
      .from(webauthnCredential)
      .where(
        and(
          eq(webauthnCredential.staffId, row.staffId),
          eq(webauthnCredential.credentialId, response.id),
        ),
      );
    const found = credential[0];
    const person = await database.db.select().from(staff).where(eq(staff.id, row.staffId));
    const owner = person[0];
    if (!found || !owner?.mfaEnrolledAt || !owner.active) throw denied();
    let verified = false;
    let nextCounter = found.counter;
    try {
      const result = await verifyAuthenticationResponse({
        response,
        expectedChallenge: row.challenge,
        expectedOrigin: options.origin,
        expectedRPID: options.rpId,
        requireUserVerification: false,
        credential: {
          id: found.credentialId,
          publicKey: new Uint8Array(Buffer.from(found.publicKey, 'base64url')),
          counter: found.counter,
        },
      });
      verified = result.verified;
      if (result.verified) nextCounter = result.authenticationInfo.newCounter;
    } catch {
      verified = false;
    }
    if (!verified) {
      await writeAudit(database, request, owner.id, owner.email, 'webauthn', 'denied');
      throw denied();
    }
    if (!owner.isLocalAdmin) {
      await requireMember(options.directory, database, request, owner.id, owner.email, 'webauthn');
    }
    await database.db
      .update(webauthnCredential)
      .set({ counter: nextCounter })
      .where(eq(webauthnCredential.id, found.id));
    const opened = await replaceSession(database, owner.id, false, now());
    setSessionCookies(reply, request, opened.id, opened.csrf, sessionSeconds);
    await writeAudit(database, request, owner.id, owner.email, 'webauthn', 'ok');
    return loginResultSchema.parse({ step: 'staff', isLocalAdmin: owner.isLocalAdmin });
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const database = db();
    const current = await staffFromSession(database, request, now());
    if (current) {
      assertCsrf(current, request);
      await database.db.update(session).set({ revokedAt: now() }).where(eq(session.id, current.id));
    }
    clearSessionCookies(reply, request);
    return { ok: true };
  });

  app.get('/api/v1/admin/staff', async (request) => {
    const database = db();
    await requireLocalAdmin(database, request, options.adminAllowlist, now());
    return adminStaffSchema.parse(await adminSnapshot(database));
  });

  app.post('/api/v1/admin/password', async (request) => {
    const parsed = adminPasswordSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const database = db();
    const current = await requireLocalAdmin(database, request, options.adminAllowlist, now());
    assertCsrf(current, request);
    const rows = await database.db
      .select({ passwordHash: staff.passwordHash })
      .from(staff)
      .where(eq(staff.id, current.staffId));
    const hash = rows[0]?.passwordHash;
    if (!hash || !(await verifyLocalPassword(hash, parsed.data.currentPassword))) throw denied();
    await database.db
      .update(staff)
      .set({ passwordHash: await hashLocalPassword(parsed.data.newPassword) })
      .where(eq(staff.id, current.staffId));
    await writeAudit(database, request, current.staffId, current.email, 'admin', 'ok');
    return { ok: true };
  });

  app.post('/api/v1/admin/staff/:id/mfa/reset', async (request) => {
    const database = db();
    const current = await requireLocalAdmin(database, request, options.adminAllowlist, now());
    assertCsrf(current, request);
    const staffId = routeId(request);
    const target = await database.db
      .select({ id: staff.id, email: staff.email })
      .from(staff)
      .where(eq(staff.id, staffId));
    if (!target[0]) throw new PublicError(404, 'not_found', publicErrors.notFound);
    await database.db
      .update(staff)
      .set({ totpCipher: null, mfaEnrolledAt: null })
      .where(eq(staff.id, staffId));
    await database.db.delete(webauthnCredential).where(eq(webauthnCredential.staffId, staffId));
    await database.db
      .update(session)
      .set({ revokedAt: now() })
      .where(and(eq(session.staffId, staffId), isNull(session.revokedAt)));
    await writeAudit(database, request, staffId, target[0].email, 'admin', 'mfa_reset');
    return { ok: true };
  });

  app.post('/api/v1/admin/staff/:id/access', async (request) => {
    const parsed = adminAccessSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const database = db();
    const current = await requireLocalAdmin(database, request, options.adminAllowlist, now());
    assertCsrf(current, request);
    const staffId = routeId(request);
    const target = await database.db
      .select({ id: staff.id })
      .from(staff)
      .where(eq(staff.id, staffId));
    if (!target[0]) throw new PublicError(404, 'not_found', publicErrors.notFound);
    await assertCodes(database, skill, parsed.data.skillCodes);
    await assertCodes(database, category, parsed.data.categoryCodes);
    await database.db.delete(staffSkill).where(eq(staffSkill.staffId, staffId));
    await database.db.delete(staffCategory).where(eq(staffCategory.staffId, staffId));
    if (parsed.data.skillCodes.length > 0) {
      await database.db
        .insert(staffSkill)
        .values(parsed.data.skillCodes.map((skillCode) => ({ staffId, skillCode })));
    }
    if (parsed.data.categoryCodes.length > 0) {
      await database.db
        .insert(staffCategory)
        .values(parsed.data.categoryCodes.map((categoryCode) => ({ staffId, categoryCode })));
    }
    await writeAudit(database, request, current.staffId, current.email, 'admin', 'ok');
    return { ok: true };
  });
}

type Person = {
  id: string;
  email: string;
  isLocalAdmin: boolean;
  passwordHash: string | null;
  totpCipher: string | null;
  mfaEnrolledAt: Date | null;
};

async function findLocalAdmin(database: Database, email: string): Promise<Person | null> {
  const rows = await database.db
    .select({
      id: staff.id,
      email: staff.email,
      isLocalAdmin: staff.isLocalAdmin,
      passwordHash: staff.passwordHash,
      totpCipher: staff.totpCipher,
      mfaEnrolledAt: staff.mfaEnrolledAt,
    })
    .from(staff)
    .where(
      and(
        eq(staff.isLocalAdmin, true),
        eq(staff.active, true),
        sql`(lower(${staff.email}) = ${email} or lower(${staff.username}) = ${email})`,
      ),
    );
  return rows[0] ?? null;
}

async function findByEmail(database: Database, email: string): Promise<Person | null> {
  const rows = await database.db
    .select({
      id: staff.id,
      email: staff.email,
      isLocalAdmin: staff.isLocalAdmin,
      passwordHash: staff.passwordHash,
      totpCipher: staff.totpCipher,
      mfaEnrolledAt: staff.mfaEnrolledAt,
    })
    .from(staff)
    .where(and(sql`lower(${staff.email}) = ${email}`, eq(staff.active, true)));
  return rows[0] ?? null;
}

async function saveDirectoryAccount(
  database: Database,
  account: DirectoryAccount,
): Promise<{ id: string }> {
  const email = account.email.trim().toLowerCase();
  const existing = await findByEmail(database, email);
  if (existing) {
    await database.db
      .update(staff)
      .set({
        displayName: account.displayName,
        adObjectId: account.adObjectId || null,
        active: true,
      })
      .where(eq(staff.id, existing.id));
    return { id: existing.id };
  }
  const created = await database.db
    .insert(staff)
    .values({
      email,
      displayName: account.displayName,
      adObjectId: account.adObjectId || null,
      role: 'agent',
      active: true,
    })
    .returning({ id: staff.id });
  const row = created[0];
  if (!row) throw databaseDown();
  return row;
}

async function enrolledMethods(
  database: Database,
  staffId: string,
): Promise<Array<'totp' | 'webauthn'>> {
  const methods: Array<'totp' | 'webauthn'> = [];
  const rows = await database.db
    .select({ totpCipher: staff.totpCipher })
    .from(staff)
    .where(eq(staff.id, staffId));
  if (rows[0]?.totpCipher) methods.push('totp');
  if ((await credentialsFor(database, staffId)).length > 0) methods.push('webauthn');
  return methods.length > 0 ? methods : ['totp'];
}

function totpCodeMatches(secret: string, cipher: string | null, code: string, at: Date): boolean {
  if (!cipher || secret.trim().length < 16) return false;
  try {
    return totpMatches(openSecret(secret, cipher), code, at.getTime());
  } catch {
    return false;
  }
}

async function requireMember(
  directory: Directory,
  database: Database,
  request: FastifyRequest,
  staffId: string,
  email: string,
  method: 'totp' | 'webauthn',
): Promise<void> {
  let membership: 'member' | 'absent';
  try {
    membership = await directory.assertMembership(email);
  } catch (error) {
    if (error instanceof DirectoryUnavailable) {
      throw new PublicError(503, 'directory_unavailable', publicErrors.directoryUnavailable);
    }
    throw error;
  }
  if (membership !== 'member') {
    await writeAudit(database, request, staffId, email, method, 'not_member');
    throw denied();
  }
}

async function replaceSession(
  database: Database,
  staffId: string,
  mfaPending: boolean,
  at: Date,
): Promise<{ id: string; csrf: string }> {
  await database.db
    .update(session)
    .set({ revokedAt: at })
    .where(and(eq(session.staffId, staffId), isNull(session.revokedAt)));
  const csrfToken = randomBytes(32).toString('base64url');
  const created = await database.db
    .insert(session)
    .values({
      staffId,
      mfaPending,
      csrfToken,
      expiresAt: new Date(at.getTime() + (mfaPending ? pendingSeconds : sessionSeconds) * 1000),
    })
    .returning({ id: session.id });
  const row = created[0];
  if (!row) throw databaseDown();
  return { id: row.id, csrf: csrfToken };
}

async function promoteSession(database: Database, sessionId: string, at: Date): Promise<string> {
  const csrfToken = randomBytes(32).toString('base64url');
  await database.db
    .update(session)
    .set({
      mfaPending: false,
      csrfToken,
      expiresAt: new Date(at.getTime() + sessionSeconds * 1000),
    })
    .where(eq(session.id, sessionId));
  return csrfToken;
}

async function pending(
  database: Database,
  request: FastifyRequest,
  at: Date,
): Promise<StaffSession> {
  const current = await staffFromSession(database, request, at);
  if (!current?.mfaPending) throw new PublicError(401, 'unauthorized', publicErrors.unauthorized);
  return current;
}

async function requireLocalAdmin(
  database: Database,
  request: FastifyRequest,
  allowlist: string,
  at: Date,
): Promise<StaffSession> {
  if (!ipAllowed(clientAddress(request), allowlist)) {
    throw new PublicError(403, 'network_denied', publicErrors.networkDenied);
  }
  const current = await staffFromSession(database, request, at);
  if (!current || current.mfaPending || !current.isLocalAdmin) {
    throw new PublicError(401, 'unauthorized', publicErrors.unauthorized);
  }
  return current;
}

function routeId(request: FastifyRequest): string {
  const params = request.params as { id?: string };
  if (!params.id || !/^[0-9a-f-]{36}$/iu.test(params.id)) {
    throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
  }
  return params.id;
}

async function assertCodes(
  database: Database,
  table: typeof skill | typeof category,
  codes: string[],
): Promise<void> {
  const unique = [...new Set(codes)];
  if (unique.length === 0) return;
  const rows = await database.db
    .select({ code: table.code })
    .from(table)
    .where(inArray(table.code, unique));
  if (rows.length !== unique.length)
    throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
}

async function credentialsFor(database: Database, staffId: string) {
  return database.db
    .select({ credentialId: webauthnCredential.credentialId })
    .from(webauthnCredential)
    .where(eq(webauthnCredential.staffId, staffId));
}

async function storeChallenge(
  database: Database,
  staffId: string,
  challenge: string,
  kind: 'registration' | 'authentication',
  at: Date,
): Promise<void> {
  await database.db.insert(webauthnChallenge).values({
    staffId,
    challenge,
    kind,
    expiresAt: new Date(at.getTime() + 5 * 60 * 1000),
  });
}

async function consumeChallenge(
  database: Database,
  staffId: string,
  response: { response?: { clientDataJSON?: string } },
  kind: 'registration' | 'authentication',
  at: Date,
): Promise<string> {
  const challenge = readChallenge(response);
  if (!challenge) throw denied();
  const rows = await database.db
    .select()
    .from(webauthnChallenge)
    .where(
      and(
        eq(webauthnChallenge.staffId, staffId),
        eq(webauthnChallenge.challenge, challenge),
        eq(webauthnChallenge.kind, kind),
        isNull(webauthnChallenge.consumedAt),
      ),
    );
  const row = rows[0];
  if (!row || row.expiresAt <= at) throw denied();
  await database.db
    .update(webauthnChallenge)
    .set({ consumedAt: at })
    .where(eq(webauthnChallenge.id, row.id));
  return row.challenge;
}

function readChallenge(response: { response?: { clientDataJSON?: string } }): string | null {
  const encoded = response.response?.clientDataJSON;
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      challenge?: unknown;
    };
    return typeof parsed.challenge === 'string' ? parsed.challenge : null;
  } catch {
    return null;
  }
}

async function adminSnapshot(database: Database) {
  const people = await database.db
    .select({
      id: staff.id,
      email: staff.email,
      username: staff.username,
      displayName: staff.displayName,
      isLocalAdmin: staff.isLocalAdmin,
      mfaEnrolledAt: staff.mfaEnrolledAt,
    })
    .from(staff)
    .orderBy(staff.displayName);
  const skills = await database.db
    .select({ code: skill.code, labelDe: skill.labelDe, labelEn: skill.labelEn })
    .from(skill)
    .orderBy(skill.code);
  const categories = await database.db
    .select({ code: category.code, labelDe: category.labelDe, labelEn: category.labelEn })
    .from(category)
    .orderBy(category.code);
  const skillRows = await database.db.select().from(staffSkill);
  const categoryRows = await database.db.select().from(staffCategory);
  return {
    skills,
    categories,
    staff: people.map((person) => ({
      id: person.id,
      email: person.email,
      username: person.username,
      displayName: person.displayName,
      isLocalAdmin: person.isLocalAdmin,
      mfaEnrolled: person.mfaEnrolledAt !== null,
      skillCodes: skillRows.filter((row) => row.staffId === person.id).map((row) => row.skillCode),
      categoryCodes: categoryRows
        .filter((row) => row.staffId === person.id)
        .map((row) => row.categoryCode),
    })),
  };
}

async function writeAudit(
  database: Database,
  request: FastifyRequest,
  staffId: string | null,
  email: string,
  method: 'ad_password' | 'local_password' | 'totp' | 'webauthn' | 'admin',
  outcome: 'ok' | 'denied' | 'not_member' | 'mfa_reset',
): Promise<void> {
  await database.db.insert(loginAudit).values({
    staffId,
    email: email.slice(0, 200),
    method,
    outcome,
    ip: clientAddress(request),
  });
}

function denied(): PublicError {
  return new PublicError(401, 'sign_in_denied', publicErrors.signInDenied);
}

function setSessionCookies(
  reply: FastifyReply,
  request: FastifyRequest,
  sessionId: string,
  csrf: string,
  maxAge: number,
): void {
  reply.header('set-cookie', [
    cookie(request, SESSION_COOKIE, sessionId, maxAge, true),
    cookie(request, CSRF_COOKIE, csrf, maxAge, false),
  ]);
}

function clearSessionCookies(reply: FastifyReply, request: FastifyRequest): void {
  reply.header('set-cookie', [
    cookie(request, SESSION_COOKIE, '', 0, true),
    cookie(request, CSRF_COOKIE, '', 0, false),
  ]);
}

function cookie(
  request: FastifyRequest,
  name: string,
  value: string,
  maxAge: number,
  httpOnly: boolean,
): string {
  const secure = request.protocol === 'https' ? '; Secure' : '';
  const only = httpOnly ? '; HttpOnly' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${only}${secure}`;
}

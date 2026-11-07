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
import { unconfiguredModel, type ModelProvider } from '@kmbhelp/ai';
import {
  appSetting,
  category,
  loginAudit,
  qrLogin,
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
  adminStaffSchema,
  authDomains,
  emailDomainAllowed,
  grantSeconds,
  categoryTermPrompt,
  deactivateStaffSchema,
  loginRequestSchema,
  loginResultSchema,
  qrPollSchema,
  qrStartSchema,
  publicErrors,
  sessionViewSchema,
  skillTermPrompt,
  termTextSchema,
  totpCheckSchema,
  totpConfirmSchema,
  totpSetupSchema,
  vocabularySchema,
} from '@kmbhelp/shared';
import {
  assertCsrf,
  CSRF_COOKIE,
  localhostAdmin,
  renewGrant,
  SESSION_COOKIE,
  staffFromSession,
  type StaffSession,
} from './auth.js';
import { writeActivity } from './activity-log.js';
import { noteExternal } from './syslog.js';
import { DirectoryUnavailable, type Directory, type DirectoryAccount } from './directory.js';
import { deactivateMissing, reconcileHelpdesk } from './helpdesk-sync.js';
import {
  clientAddress,
  createRateLimiter,
  databaseDown,
  PublicError,
  rateLimited,
} from './http.js';
import { ipAllowed, viewerAddress } from './network.js';
import { verifyLocalPassword } from './passwords.js';
import { encodeBase32, openSecret, randomTotpSecret, sealSecret, totpMatches } from './totp.js';

const pendingSeconds = 15 * 60;
const sessionSeconds = grantSeconds;

export type Phase3Options = {
  database: Database | undefined;
  directory: Directory;
  sessionSecret: string;
  adminAllowlist: string;
  rpId: string;
  origin: string;
  apiHost?: string | undefined;
  mfaSkipAllowlist?: string | undefined;
  now?: (() => Date) | undefined;
  model?: ModelProvider | undefined;
};

export function registerPhase3(app: FastifyInstance, options: Phase3Options): void {
  const now = options.now ?? (() => new Date());
  const limiter = createRateLimiter(10, 60_000);

  function db(): Database {
    if (!options.database) throw databaseDown();
    return options.database;
  }

  function officeLocalAdmin(request: FastifyRequest): boolean {
    const peer = request.socket?.remoteAddress ?? request.ip;
    const forwarded = request.headers['x-real-ip'] ?? request.headers['x-forwarded-for'];
    const header = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ipAllowed(
      viewerAddress(peer, typeof header === 'string' ? header : undefined, options.apiHost ?? ''),
      options.mfaSkipAllowlist ?? '',
    );
  }

  const model = options.model ?? unconfiguredModel;

  app.addHook('onRequest', async (request, reply) => {
    if (!options.database) return;
    try {
      const renewed = await renewGrant(options.database, request, now());
      if (renewed) setSessionCookies(reply, request, renewed.id, renewed.csrf, sessionSeconds);
    } catch {
      return;
    }
  });

  app.get('/api/v1/auth/session', async (request) => {
    const anonymous = {
      signedIn: false,
      isLocalAdmin: false,
      displayName: null,
      internalAdmin: false,
      email: null,
      audience: null,
    };
    if (options.database) {
      const current = await staffFromSession(options.database, request, now());
      if (current && !current.mfaPending) {
        const names = await options.database.db
          .select({ displayName: staff.displayName, username: staff.username })
          .from(staff)
          .where(eq(staff.id, current.staffId));
        const row = names[0];
        const loginName = current.isLocalAdmin ? row?.username : row?.displayName;
        return sessionViewSchema.parse({
          signedIn: true,
          isLocalAdmin: current.isLocalAdmin,
          displayName: loginName || row?.displayName || current.email,
          internalAdmin: false,
          email: current.email,
          audience: current.isLocalAdmin || current.helpdesk ? 'administrator' : 'user',
        });
      }
    }
    if (localhostAdmin(request)) {
      return sessionViewSchema.parse({
        signedIn: true,
        isLocalAdmin: true,
        displayName: null,
        internalAdmin: true,
        email: null,
        audience: 'administrator',
      });
    }
    return sessionViewSchema.parse(anonymous);
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
    if (local && officeLocalAdmin(request)) {
      if (!password || !(await verifyLocalPassword(local.passwordHash ?? '', password))) {
        await writeAudit(database, request, local.id, email, 'local_password', 'denied');
        throw denied();
      }
      const opened = await replaceSession(database, local.id, false, now());
      setSessionCookies(reply, request, opened.id, opened.csrf, sessionSeconds);
      await writeAudit(
        database,
        request,
        local.id,
        email,
        'local_password',
        'ok',
        'Anmeldung des lokalen Admins aus dem freigegebenen Netz. Einmalcode und Passkey entfallen.',
      );
      return loginResultSchema.parse({ step: 'staff', isLocalAdmin: true });
    }
    if (password && !local) {
      if (!emailDomainAllowed(email, await readAuthDomains(database))) {
        await writeAudit(database, request, person?.id ?? null, email, 'ad_password', 'denied');
        throw denied();
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
      if (!account || !account.active) {
        await writeAudit(database, request, person?.id ?? null, email, 'ad_password', 'denied');
        throw denied();
      }
      const saved = await saveDirectoryAccount(database, account);
      const opened = await replaceSession(database, saved.id, false, now());
      setSessionCookies(reply, request, opened.id, opened.csrf, sessionSeconds);
      await writeAudit(database, request, saved.id, email, 'ad_password', 'ok');
      return loginResultSchema.parse({ step: 'staff', isLocalAdmin: false });
    }
    if (person?.mfaEnrolledAt) {
      if (!code) {
        return loginResultSchema.parse({
          step: 'mfa',
          methods: await enrolledMethods(database, person.id),
          passwordRequired: false,
        });
      }
      if (!/^\d{6}$/u.test(code)) {
        await writeAudit(
          database,
          request,
          person.id,
          email,
          'totp',
          'denied',
          'Passkey ist keine sechsstellige Zahl.',
        );
        throw new PublicError(401, 'sign_in_denied', {
          de: 'Der Passkey ist die aktuelle sechsstellige Zahl aus der App. Der lange Code unter dem QR-Code dient nur zum Einrichten.',
          en: 'The passkey is the current six-digit number from the app. The long code under the QR code is only for setup.',
        });
      }
      if (!totpCodeMatches(options.sessionSecret, person.totpCipher, code, now())) {
        await writeAudit(
          database,
          request,
          person.id,
          email,
          'totp',
          'denied',
          'Der Passkey stimmt nicht.',
        );
        throw new PublicError(401, 'sign_in_denied', {
          de: 'Der Passkey stimmt nicht. Die Zahl wechselt alle 30 Sekunden.',
          en: 'The passkey does not match. The number changes every 30 seconds.',
        });
      }
      if (!local) {
        await assertAccount(options.directory, database, request, person.id, person.email, 'totp');
      }
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
      return loginResultSchema.parse({ step: 'enroll', presentTotp: false });
    }
    throw denied();
  });

  app.post('/api/v1/auth/totp/setup', async (request) => {
    const database = db();
    const current = await signedSession(database, request, now());
    assertCsrf(current, request);
    if (options.sessionSecret.trim().length < 16) {
      throw new PublicError(503, 'directory_unavailable', publicErrors.directoryUnavailable);
    }
    const rows = await database.db
      .select({ totpCipher: staff.totpCipher, mfaEnrolledAt: staff.mfaEnrolledAt })
      .from(staff)
      .where(eq(staff.id, current.staffId));
    const row = rows[0];
    let secret = current.mfaPending
      ? null
      : openStoredSecret(options.sessionSecret, row?.totpCipher);
    if (!secret) {
      const fresh = randomTotpSecret();
      const stored = sealSecret(options.sessionSecret, fresh);
      if (current.mfaPending) {
        await database.db
          .update(staff)
          .set({ totpCipher: stored })
          .where(eq(staff.id, current.staffId));
        secret = fresh;
      } else {
        const written = await database.db
          .update(staff)
          .set({ totpCipher: stored, mfaEnrolledAt: row?.mfaEnrolledAt ?? now() })
          .where(and(eq(staff.id, current.staffId), isNull(staff.totpCipher)))
          .returning({ totpCipher: staff.totpCipher });
        secret =
          written.length > 0
            ? fresh
            : await readStoredTotp(database, current.staffId, options.sessionSecret);
      }
    }
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

  app.post('/api/v1/auth/totp/check', async (request) => {
    const parsed = totpConfirmSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    const database = db();
    const current = await signedSession(database, request, now());
    assertCsrf(current, request);
    const rows = await database.db
      .select({ totpCipher: staff.totpCipher })
      .from(staff)
      .where(eq(staff.id, current.staffId));
    const matches = totpCodeMatches(
      options.sessionSecret,
      rows[0]?.totpCipher ?? null,
      parsed.data.code,
      now(),
    );
    await writeAudit(
      database,
      request,
      current.staffId,
      current.email,
      'totp',
      matches ? 'ok' : 'denied',
      matches ? 'Passkey akzeptiert.' : 'Passkey falsch.',
      'POST /api/v1/auth/totp/check',
    );
    return totpCheckSchema.parse({ ok: matches });
  });

  app.post('/api/v1/auth/webauthn/register/options', async (request) => {
    const database = db();
    const current = await signedSession(database, request, now());
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
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    });
    await storeChallenge(database, current.staffId, registration.challenge, 'registration', now());
    return registration;
  });

  app.post('/api/v1/auth/webauthn/register/verify', async (request, reply) => {
    const database = db();
    const current = await signedSession(database, request, now());
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
    const csrf = current.mfaPending
      ? await promoteSession(database, current.id, now())
      : current.csrfToken;
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
      await assertAccount(options.directory, database, request, owner.id, owner.email, 'webauthn');
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
      await writeAudit(
        database,
        request,
        current.staffId,
        current.email,
        'admin',
        'ok',
        'Abmeldung. Die Sitzung wurde beendet.',
        'POST /api/v1/auth/logout',
      );
    }
    clearSessionCookies(reply, request);
    return { ok: true };
  });

  app.post('/api/v1/auth/qr/start', async () => {
    if (!limiter.allow('qr')) throw rateLimited();
    const database = db();
    const token = randomBytes(18).toString('base64url');
    await database.db.insert(qrLogin).values({
      token,
      expiresAt: new Date(now().getTime() + 2 * 60 * 1000),
    });
    return qrStartSchema.parse({ token });
  });

  app.get<{ Params: { token: string } }>('/api/v1/auth/qr/:token', async (request, reply) => {
    const database = db();
    const rows = await database.db
      .select({
        sessionId: qrLogin.sessionId,
        expiresAt: qrLogin.expiresAt,
      })
      .from(qrLogin)
      .where(eq(qrLogin.token, request.params.token));
    const row = rows[0];
    if (!row || row.expiresAt <= now() || !row.sessionId) {
      return qrPollSchema.parse({ step: 'wait' });
    }
    const opened = await database.db
      .select({ csrf: session.csrfToken, local: staff.isLocalAdmin })
      .from(session)
      .innerJoin(staff, eq(session.staffId, staff.id))
      .where(and(eq(session.id, row.sessionId), isNull(session.revokedAt)));
    const found = opened[0];
    if (!found) return qrPollSchema.parse({ step: 'wait' });
    setSessionCookies(reply, request, row.sessionId, found.csrf, sessionSeconds);
    return qrPollSchema.parse({ step: 'staff', isLocalAdmin: found.local });
  });

  app.post<{ Params: { token: string } }>('/api/v1/auth/qr/:token/options', async (request) => {
    const database = db();
    const tokenRow = await openQr(database, request.params.token, now());
    if (!tokenRow) throw denied();
    const authentication = await generateAuthenticationOptions({
      rpID: options.rpId,
      userVerification: 'preferred',
    });
    await storeChallenge(database, null, authentication.challenge, 'authentication', now());
    return authentication;
  });

  app.post<{ Params: { token: string } }>(
    '/api/v1/auth/qr/:token/verify',
    async (request, reply) => {
      const database = db();
      const tokenRow = await openQr(database, request.params.token, now());
      if (!tokenRow) throw denied();
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
      const challenge = stored[0];
      if (!challenge || challenge.expiresAt <= now()) throw denied();
      await database.db
        .update(webauthnChallenge)
        .set({ consumedAt: now() })
        .where(eq(webauthnChallenge.id, challenge.id));
      const credential = await database.db
        .select()
        .from(webauthnCredential)
        .where(eq(webauthnCredential.credentialId, response.id));
      const found = credential[0];
      const person = found
        ? await database.db.select().from(staff).where(eq(staff.id, found.staffId))
        : [];
      const owner = person[0];
      if (!found || !owner?.active) throw denied();
      let verified = false;
      let nextCounter = found.counter;
      try {
        const result = await verifyAuthenticationResponse({
          response,
          expectedChallenge: challenge.challenge,
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
      await assertAccount(options.directory, database, request, owner.id, owner.email, 'webauthn');
      await database.db
        .update(webauthnCredential)
        .set({ counter: nextCounter })
        .where(eq(webauthnCredential.id, found.id));
      const opened = await replaceSession(database, owner.id, false, now());
      await database.db
        .update(qrLogin)
        .set({ sessionId: opened.id })
        .where(eq(qrLogin.token, request.params.token));
      setSessionCookies(reply, request, opened.id, opened.csrf, sessionSeconds);
      await writeAudit(database, request, owner.id, owner.email, 'webauthn', 'ok');
      return loginResultSchema.parse({ step: 'staff', isLocalAdmin: owner.isLocalAdmin });
    },
  );

  async function databaseStaffView() {
    return adminStaffSchema.parse({
      directory: 'ok',
      added: [],
      missing: [],
      ...(await adminSnapshot(db())),
    });
  }

  async function staffView() {
    const database = db();
    const sync = await reconcileHelpdesk(database, options.directory);
    return adminStaffSchema.parse({ ...sync, ...(await adminSnapshot(database)) });
  }

  app.get('/api/v1/admin/staff', async (request) => {
    await requireDesk(db(), request, options.adminAllowlist, now());
    return databaseStaffView();
  });

  app.post('/api/v1/admin/directory/read', async (request) => {
    const current = await requireDesk(db(), request, options.adminAllowlist, now());
    assertCsrf(current, request);
    return staffView();
  });

  app.post('/api/v1/admin/directory/deactivate', async (request) => {
    const current = await requireDesk(db(), request, options.adminAllowlist, now());
    assertCsrf(current, request);
    const parsed = deactivateStaffSchema.safeParse(request.body);
    if (!parsed.success) throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
    try {
      await deactivateMissing(db(), options.directory, parsed.data.ids);
    } catch (error) {
      if (error instanceof DirectoryUnavailable) {
        throw new PublicError(503, 'directory_unavailable', publicErrors.directoryUnavailable);
      }
      throw error;
    }
    return staffView();
  });

  app.post('/api/v1/admin/password', async () => {
    throw new PublicError(403, 'password_fixed', publicErrors.passwordFixed);
  });

  app.post('/api/v1/admin/skills', async (request) => {
    const current = await requireDesk(db(), request, options.adminAllowlist, now());
    assertCsrf(current, request);
    await createVocabulary(db(), request, current, 'skill', model);
    return vocabularyView(db());
  });

  app.delete('/api/v1/admin/skills/:code', async (request) => {
    const current = await requireDesk(db(), request, options.adminAllowlist, now());
    assertCsrf(current, request);
    await deleteVocabulary(db(), request, current, 'skill');
    return vocabularyView(db());
  });

  app.post('/api/v1/admin/categories', async (request) => {
    const current = await requireDesk(db(), request, options.adminAllowlist, now());
    assertCsrf(current, request);
    await createVocabulary(db(), request, current, 'category', model);
    return vocabularyView(db());
  });

  app.delete('/api/v1/admin/categories/:code', async (request) => {
    const current = await requireDesk(db(), request, options.adminAllowlist, now());
    assertCsrf(current, request);
    await deleteVocabulary(db(), request, current, 'category');
    return vocabularyView(db());
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
        helpdesk: account.inHelpdeskGroup,
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
      helpdesk: account.inHelpdeskGroup,
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

async function readStoredTotp(
  database: Database,
  staffId: string,
  sessionSecret: string,
): Promise<Buffer> {
  const rows = await database.db
    .select({ totpCipher: staff.totpCipher })
    .from(staff)
    .where(eq(staff.id, staffId));
  const opened = openStoredSecret(sessionSecret, rows[0]?.totpCipher);
  if (!opened) throw denied();
  return opened;
}

function openStoredSecret(sessionSecret: string, cipher: string | null | undefined): Buffer | null {
  if (!cipher) return null;
  try {
    return openSecret(sessionSecret, cipher);
  } catch {
    return null;
  }
}

function totpCodeMatches(secret: string, cipher: string | null, code: string, at: Date): boolean {
  if (!cipher || secret.trim().length < 16) return false;
  try {
    return totpMatches(openSecret(secret, cipher), code, at.getTime());
  } catch {
    return false;
  }
}

async function readAuthDomains(database: Database): Promise<string[]> {
  const rows = await database.db
    .select({ value: appSetting.value })
    .from(appSetting)
    .where(eq(appSetting.key, 'config.EMAIL_AUTH_DOMAINS'));
  return authDomains(rows[0]?.value || process.env.EMAIL_AUTH_DOMAINS);
}

async function openQr(database: Database, token: string, at: Date) {
  const rows = await database.db.select().from(qrLogin).where(eq(qrLogin.token, token));
  const row = rows[0];
  if (!row || row.expiresAt <= at) return null;
  return row;
}

async function signedSession(
  database: Database,
  request: FastifyRequest,
  at: Date,
): Promise<StaffSession> {
  const current = await staffFromSession(database, request, at);
  if (!current) throw new PublicError(401, 'unauthorized', publicErrors.unauthorized);
  return current;
}

async function assertAccount(
  directory: Directory,
  database: Database,
  request: FastifyRequest,
  staffId: string,
  email: string,
  method: 'totp' | 'webauthn',
): Promise<void> {
  if (!emailDomainAllowed(email, await readAuthDomains(database))) {
    await writeAudit(database, request, staffId, email, method, 'denied');
    throw denied();
  }
  let account: DirectoryAccount | null;
  try {
    account = await directory.lookup(email);
  } catch (error) {
    if (error instanceof DirectoryUnavailable) {
      throw new PublicError(503, 'directory_unavailable', publicErrors.directoryUnavailable);
    }
    throw error;
  }
  if (!account || !account.active) {
    await writeAudit(database, request, staffId, email, method, 'denied');
    throw denied();
  }
  await database.db
    .update(staff)
    .set({ helpdesk: account.inHelpdeskGroup, displayName: account.displayName, active: true })
    .where(eq(staff.id, staffId));
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
      renewedAt: at,
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

async function requireDesk(
  database: Database,
  request: FastifyRequest,
  allowlist: string,
  at: Date,
): Promise<StaffSession> {
  const local = localhostAdmin(request);
  if (local) return local;
  if (!ipAllowed(clientAddress(request), allowlist)) {
    throw new PublicError(403, 'network_denied', publicErrors.networkDenied);
  }
  const current = await staffFromSession(database, request, at);
  if (!current || current.mfaPending) {
    throw new PublicError(401, 'unauthorized', publicErrors.unauthorized);
  }
  return current;
}

async function requireLocalAdmin(
  database: Database,
  request: FastifyRequest,
  allowlist: string,
  at: Date,
): Promise<StaffSession> {
  const local = localhostAdmin(request);
  if (local) return local;
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
  staffId: string | null,
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
      active: staff.active,
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
      active: person.active,
      mfaEnrolled: person.mfaEnrolledAt !== null,
      skillCodes: skillRows.filter((row) => row.staffId === person.id).map((row) => row.skillCode),
      categoryCodes: categoryRows
        .filter((row) => row.staffId === person.id)
        .map((row) => row.categoryCode),
    })),
  };
}

async function vocabularyView(database: Database) {
  const snap = await adminSnapshot(database);
  return vocabularySchema.parse({ skills: snap.skills, categories: snap.categories });
}

function termCode(text: string): string {
  const folded = text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  return folded
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80);
}

function sensibleTerm(text: string): boolean {
  return text.length > 0 && text.length <= 80 && /\p{L}/u.test(text) && !/[\r\n]/u.test(text);
}

function sameTerm(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function isForeignKey(error: unknown): boolean {
  const current = error as { code?: string; cause?: { code?: string } };
  return current.code === '23503' || current.cause?.code === '23503';
}

function routeCode(request: FastifyRequest): string {
  const params = request.params as { code?: string };
  const code = params.code?.trim() ?? '';
  if (!/^[a-z0-9-]{1,80}$/u.test(code)) {
    throw new PublicError(400, 'invalid_input', publicErrors.invalidInput);
  }
  return code;
}

async function createVocabulary(
  database: Database,
  request: FastifyRequest,
  current: StaffSession,
  kind: 'skill' | 'category',
  model: ModelProvider,
): Promise<void> {
  const parsed = termTextSchema.safeParse(request.body);
  const text = parsed.success ? parsed.data.text : '';
  const code = termCode(text);
  if (!parsed.success || !sensibleTerm(text) || code === '') {
    throw new PublicError(400, 'invalid_term', publicErrors.invalidTerm);
  }
  if (kind === 'skill') {
    const rows = await database.db.select().from(skill);
    if (
      rows.some(
        (row) =>
          sameTerm(row.code, code) || sameTerm(row.labelDe, text) || sameTerm(row.labelEn, text),
      )
    ) {
      throw new PublicError(400, 'duplicate_term', publicErrors.duplicateTerm);
    }
  } else {
    const rows = await database.db.select().from(category);
    if (
      rows.some(
        (row) =>
          sameTerm(row.code, code) || sameTerm(row.labelDe, text) || sameTerm(row.labelEn, text),
      )
    ) {
      throw new PublicError(400, 'duplicate_term', publicErrors.duplicateTerm);
    }
  }
  const prompt = kind === 'skill' ? skillTermPrompt : categoryTermPrompt;
  const accepted = await model.acceptTerm(`${prompt}${text}`, text);
  if (accepted === null) {
    throw new PublicError(503, 'term_check_failed', publicErrors.termCheckFailed);
  }
  if (!accepted) throw new PublicError(400, 'term_rejected', publicErrors.termRejected);
  if (kind === 'skill') {
    await database.db.insert(skill).values({ code, labelDe: text, labelEn: text });
  } else {
    const fallback = await database.db
      .select({ code: skill.code })
      .from(skill)
      .orderBy(skill.code)
      .limit(1);
    const defaultSkillCode = fallback[0]?.code;
    if (!defaultSkillCode) throw new PublicError(400, 'invalid_term', publicErrors.invalidTerm);
    await database.db.insert(category).values({
      code,
      groupCode: 'manual',
      labelDe: text,
      labelEn: text,
      defaultSkillCode,
    });
  }
  await writeAudit(
    database,
    request,
    current.csrfToken === 'localhost' ? null : current.staffId,
    current.email,
    'admin',
    'ok',
  );
}

async function deleteVocabulary(
  database: Database,
  request: FastifyRequest,
  current: StaffSession,
  kind: 'skill' | 'category',
): Promise<void> {
  const code = routeCode(request);
  try {
    const removed =
      kind === 'skill'
        ? await database.db
            .delete(skill)
            .where(eq(skill.code, code))
            .returning({ code: skill.code })
        : await database.db
            .delete(category)
            .where(eq(category.code, code))
            .returning({ code: category.code });
    if (removed.length === 0) throw new PublicError(404, 'not_found', publicErrors.notFound);
  } catch (error) {
    if (error instanceof PublicError) throw error;
    if (isForeignKey(error)) throw new PublicError(409, 'term_in_use', publicErrors.termInUse);
    throw error;
  }
  await writeAudit(
    database,
    request,
    current.csrfToken === 'localhost' ? null : current.staffId,
    current.email,
    'admin',
    'ok',
  );
}

const auditDescription: Record<string, string> = {
  'local_password:denied': 'Anmeldung abgelehnt. Das lokale Passwort stimmt nicht.',
  'local_password:ok': 'Lokale Anmeldung angenommen. Der zweite Faktor fehlt noch.',
  'ad_password:denied':
    'Anmeldung abgelehnt. Das Konto fehlt im Verzeichnis oder das Passwort stimmt nicht.',
  'ad_password:not_member': 'Anmeldung abgelehnt. Das Konto ist nicht in der Helpdesk-Gruppe.',
  'ad_password:ok': 'Verzeichnis-Anmeldung angenommen.',
  'totp:denied': 'Anmeldung abgelehnt. Der Einmalcode stimmt nicht.',
  'totp:ok': 'Anmeldung mit Einmalcode abgeschlossen.',
  'webauthn:denied': 'Anmeldung abgelehnt. Der Passkey wurde nicht bestätigt.',
  'webauthn:ok': 'Anmeldung mit Passkey abgeschlossen.',
  'admin:ok': 'Verwaltungsänderung gespeichert.',
  'admin:mfa_reset': 'Der zweite Faktor eines Mitarbeiters wurde zurückgesetzt.',
};

async function writeAudit(
  database: Database,
  request: FastifyRequest,
  staffId: string | null,
  email: string,
  method: 'ad_password' | 'local_password' | 'totp' | 'webauthn' | 'admin',
  outcome: 'ok' | 'denied' | 'not_member' | 'mfa_reset',
  detail?: string,
  target = 'POST /api/v1/auth/login',
): Promise<void> {
  await database.db.insert(loginAudit).values({
    staffId,
    email: email.slice(0, 200),
    method,
    outcome,
    ip: clientAddress(request),
  });
  const description =
    detail ?? auditDescription[`${method}:${outcome}`] ?? `Anmeldung: ${method} ${outcome}.`;
  const actor = email.slice(0, 200) || 'anonymous';
  await writeActivity(database, {
    actor,
    kind: 'page',
    target,
    detail: description,
    ip: clientAddress(request),
  }).catch(() => undefined);
  void noteExternal(
    process.env,
    outcome === 'ok' ? 'informational' : 'warning',
    `${description} Konto ${actor}.`,
  );
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

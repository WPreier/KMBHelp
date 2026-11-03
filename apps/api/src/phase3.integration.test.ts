import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { scriptedModel } from '@kmbhelp/ai';
import { createDatabase, seedCatalog } from '@kmbhelp/db';
import { applyMigrations, deleteDirectoryFixtures } from '@kmbhelp/db/testing';
import { buildApp } from './app.js';
import {
  memoryDirectory,
  unconfiguredDirectory,
  type MemoryDirectoryAccount,
} from './directory.js';
import { createLocalAdmin, replaceLocalAdmin } from './local-admin.js';
import { loadWorkstationEnv } from '@kmbhelp/shared/env';
import { decodeBase32, totpCode } from './totp.js';

loadWorkstationEnv();
const databaseUrl = process.env.DATABASE_URL?.trim();
const apps: FastifyInstance[] = [];
const secret = 'phase3-test-session-secret-value';

async function removeTestPeople(database: ReturnType<typeof createDatabase>): Promise<void> {
  await deleteDirectoryFixtures(database);
}

function csrfFrom(response: request.Response): string {
  const raw = response.headers['set-cookie'];
  const lines = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const line = lines.find((entry) => entry.startsWith('kmbhelp_csrf='));
  if (!line) throw new Error('missing csrf cookie');
  return decodeURIComponent((line.split(';')[0] ?? '').slice('kmbhelp_csrf='.length));
}

describe.skipIf(!databaseUrl)('phase 3 against postgres', () => {
  const database = createDatabase(databaseUrl ?? '');

  afterAll(async () => {
    await deleteDirectoryFixtures(database);
    await Promise.all(apps.splice(0).map((app) => app.close()));
    await database.pool.end();
  });

  it('checks the directory password once, then requires a code and a live group', async () => {
    await applyMigrations(database);
    await removeTestPeople(database);
    await seedCatalog(database);
    const email = `agent-${randomUUID()}@kmbcloud.at`;
    const password = `directory-${randomUUID()}`;
    const accounts: MemoryDirectoryAccount[] = [
      {
        email,
        password,
        displayName: 'Agent',
        adObjectId: 'object-1',
        active: true,
        inHelpdeskGroup: true,
      },
    ];
    const app = buildApp({
      database,
      testAuthEnabled: false,
      directory: memoryDirectory(accounts),
      sessionSecret: secret,
      adminAllowlist: '127.0.0.1/32',
    });
    apps.push(app);
    await app.ready();
    const agent = request.agent(app.server);

    const wrong = await agent
      .post('/api/v1/auth/login')
      .send({ email, password: 'wrong-password' });
    expect(wrong.status).toBe(401);
    const logged = await database.pool.query<{ method: string; outcome: string; email: string }>(
      `select method, outcome, email from login_audit where email = $1`,
      [email],
    );
    expect(logged.rows[0]?.outcome).toBe('denied');
    expect(JSON.stringify(logged.rows)).not.toContain(password);
    expect(JSON.stringify(wrong.body)).not.toContain(password);

    const first = await agent.post('/api/v1/auth/login').send({ email, password });
    expect(first.status).toBe(200);
    expect(first.body.step).toBe('enroll');
    expect(first.body.presentTotp).toBe(true);
    const stored = await database.pool.query<{ password_hash: string | null }>(
      `select password_hash from staff where lower(email) = $1`,
      [email],
    );
    expect(stored.rows[0]?.password_hash).toBeNull();
    const pendingList = await agent.get('/api/v1/staff/tickets');
    expect(pendingList.status).toBe(401);

    const setup = await agent
      .post('/api/v1/auth/totp/setup')
      .set('x-kmbhelp-csrf', csrfFrom(first))
      .send({});
    expect(setup.status).toBe(200);
    const code = totpCode(decodeBase32(setup.body.secret as string));
    const confirmed = await agent
      .post('/api/v1/auth/totp/confirm')
      .set('x-kmbhelp-csrf', csrfFrom(first))
      .send({ code });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.step).toBe('staff');
    const staffList = await agent.get('/api/v1/staff/tickets');
    expect(staffList.status).toBe(200);

    const again = await agent.post('/api/v1/auth/login').send({ email, password });
    expect(again.status).toBe(200);
    expect(again.body.step).toBe('mfa');
    accounts[0]!.inHelpdeskGroup = false;
    const removed = await request(app.server).post('/api/v1/auth/login').send({ email, code });
    expect(removed.status).toBe(401);
    const membership = await database.pool.query<{ outcome: string }>(
      `select outcome from login_audit where email = $1 and outcome = 'not_member'`,
      [email],
    );
    expect(membership.rows.length).toBeGreaterThan(0);
    await expect(
      database.pool.query(`update login_audit set outcome = 'ok' where email = $1`, [email]),
    ).rejects.toThrow(/append-only/);

    const staffId = await database.pool.query<{ id: string }>(
      `select id from staff where lower(email) = $1`,
      [email],
    );
    await removeTestPeople(database);
  });

  it('lets the local admin manage mfa and skills from the allowlist', async () => {
    await applyMigrations(database);
    await removeTestPeople(database);
    await seedCatalog(database);
    const username = `breakglass-${randomUUID()}`;
    const password = `local-admin-${randomUUID()}`;
    const nextPassword = `local-admin-next-${randomUUID()}`;
    await createLocalAdmin(database, username, password);
    const app = buildApp({
      database,
      directory: unconfiguredDirectory(),
      sessionSecret: secret,
      adminAllowlist: '127.0.0.1/32',
      model: scriptedModel({
        accept: (text) => text !== 'Quatsch',
      }),
    });
    const blocked = buildApp({
      database,
      directory: unconfiguredDirectory(),
      sessionSecret: secret,
      adminAllowlist: '10.0.0.0/8',
    });
    apps.push(app, blocked);
    await app.ready();
    await blocked.ready();
    const agent = request.agent(app.server);
    const enrolled = await agent
      .post('/api/v1/auth/login')
      .set('x-forwarded-for', '203.0.113.8')
      .send({ email: username, password });
    expect(enrolled.body.step).toBe('enroll');
    expect(enrolled.body.presentTotp).toBe(false);
    const setup = await agent
      .post('/api/v1/auth/totp/setup')
      .set('x-kmbhelp-csrf', csrfFrom(enrolled))
      .send({});
    const code = totpCode(decodeBase32(setup.body.secret as string));
    const confirmed = await agent
      .post('/api/v1/auth/totp/confirm')
      .set('x-kmbhelp-csrf', csrfFrom(enrolled))
      .send({ code });
    expect(confirmed.status).toBe(200);
    const token = csrfFrom(confirmed);
    const cookieHeader = confirmed.headers['set-cookie'];
    const cookie = (Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader ?? ''])
      .map((line) => line.split(';')[0] ?? '')
      .join('; ');
    const outside = await request(blocked.server).get('/api/v1/admin/staff').set('cookie', cookie);
    expect(outside.status).toBe(403);

    const changed = await agent
      .post('/api/v1/admin/password')
      .set('x-kmbhelp-csrf', token)
      .send({ currentPassword: password, newPassword: nextPassword });
    expect(changed.status).toBe(403);
    expect(JSON.stringify(changed.body)).not.toContain(nextPassword);

    const created = await agent
      .post('/api/v1/admin/skills')
      .set('x-kmbhelp-csrf', token)
      .send({ text: 'Netzwerkdrucker' });
    expect(created.status).toBe(200);
    const skillCode = (created.body.skills as Array<{ code: string; labelDe: string }>).find(
      (item) => item.labelDe === 'Netzwerkdrucker',
    )?.code;
    expect(skillCode).toBe('netzwerkdrucker');
    const duplicate = await agent
      .post('/api/v1/admin/skills')
      .set('x-kmbhelp-csrf', token)
      .send({ text: 'Netzwerkdrucker' });
    expect(duplicate.status).toBe(400);
    const rejected = await agent
      .post('/api/v1/admin/skills')
      .set('x-kmbhelp-csrf', token)
      .send({ text: 'Quatsch' });
    expect(rejected.status).toBe(400);
    const removed = await agent
      .delete(`/api/v1/admin/skills/${skillCode}`)
      .set('x-kmbhelp-csrf', token);
    expect(removed.status).toBe(200);

    const skills = await database.pool.query<{ code: string }>(`select code from skill limit 1`);
    const categories = await database.pool.query<{ code: string }>(
      `select code from category limit 1`,
    );
    const adminId = await database.pool.query<{ id: string }>(
      `select id from staff where username = $1`,
      [username],
    );
    const saved = await agent
      .post(`/api/v1/admin/staff/${adminId.rows[0]?.id}/access`)
      .set('x-kmbhelp-csrf', token)
      .send({ skillCodes: [skills.rows[0]?.code], categoryCodes: [categories.rows[0]?.code] });
    expect(saved.status).toBe(200);
    const reset = await agent
      .post(`/api/v1/admin/staff/${adminId.rows[0]?.id}/mfa/reset`)
      .set('x-kmbhelp-csrf', token)
      .send({});
    expect(reset.status).toBe(200);
    const after = await database.pool.query<{ mfa_enrolled_at: Date | null }>(
      `select mfa_enrolled_at from staff where id = $1`,
      [adminId.rows[0]?.id],
    );
    expect(after.rows[0]?.mfa_enrolled_at).toBeNull();

    await removeTestPeople(database);
  });

  it('accepts the local admin from the allowlist without a one-time code', async () => {
    await applyMigrations(database);
    await removeTestPeople(database);
    const username = `office-${randomUUID()}`;
    const password = `local-admin-${randomUUID()}`;
    await createLocalAdmin(database, username, password);
    const app = buildApp({
      database,
      directory: unconfiguredDirectory(),
      sessionSecret: secret,
      adminAllowlist: '127.0.0.1/32',
    });
    apps.push(app);
    await app.ready();
    const response = await request(app.server)
      .post('/api/v1/auth/login')
      .send({ email: username, password });
    expect(response.status).toBe(200);
    expect(response.body.step).toBe('staff');
    expect(JSON.stringify(response.body)).not.toContain(password);
    const raw = response.headers['set-cookie'];
    const lines = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const session = await request(app.server)
      .get('/api/v1/auth/session')
      .set('cookie', lines.map((line) => line.split(';')[0] ?? '').join('; '));
    expect(session.status).toBe(200);
    expect(session.body.signedIn).toBe(true);
    expect(session.body.displayName).toBe(username);
    await removeTestPeople(database);
  });

  it('replaces the local admin and leaves domain accounts in place', async () => {
    await applyMigrations(database);
    await removeTestPeople(database);
    const foreign = await database.pool.query<{ username: string | null }>(
      `select username from staff
        where is_local_admin = true
          and coalesce(username, '') not like 'breakglass-%'
          and coalesce(username, '') not like 'office-%'`,
    );
    expect(foreign.rowCount).toBe(0);
    const keptEmail = `agent-${randomUUID()}@kmbcloud.at`;
    await database.pool.query(
      `insert into staff (email, display_name, role, active) values ($1, 'Agent', 'agent', true)`,
      [keptEmail],
    );
    const first = `office-${randomUUID()}`;
    const second = `office-${randomUUID()}`;
    const firstPassword = `local-admin-${randomUUID()}`;
    const secondPassword = `local-admin-${randomUUID()}`;
    expect(await replaceLocalAdmin(database, first, firstPassword)).toBe('created');
    expect(await replaceLocalAdmin(database, second, secondPassword)).toBe('replaced');
    const admins = await database.pool.query<{ username: string }>(
      `select username from staff where is_local_admin = true`,
    );
    expect(admins.rows.map((row) => row.username)).toEqual([second]);
    const kept = await database.pool.query(`select id from staff where lower(email) = $1`, [
      keptEmail,
    ]);
    expect(kept.rowCount).toBe(1);
    const app = buildApp({
      database,
      directory: unconfiguredDirectory(),
      sessionSecret: secret,
      adminAllowlist: '127.0.0.1/32',
    });
    apps.push(app);
    await app.ready();
    const denied = await request(app.server)
      .post('/api/v1/auth/login')
      .send({ email: first, password: firstPassword });
    expect(denied.status).toBe(503);
    const accepted = await request(app.server)
      .post('/api/v1/auth/login')
      .send({ email: second, password: secondPassword });
    expect(accepted.status).toBe(200);
    expect(accepted.body.step).toBe('staff');
    expect(JSON.stringify(accepted.body)).not.toContain(secondPassword);
    await removeTestPeople(database);
  });

  it('does not invent a directory when the service account is missing', async () => {
    await applyMigrations(database);
    const app = buildApp({
      database,
      directory: unconfiguredDirectory(),
      sessionSecret: secret,
      adminAllowlist: '',
    });
    apps.push(app);
    await app.ready();
    const password = `missing-directory-${randomUUID()}`;
    const response = await request(app.server)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@kmbcloud.at', password });
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain(password);
  });
});

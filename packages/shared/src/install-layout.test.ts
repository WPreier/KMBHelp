import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function text(path: string): string {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8').replace(/\r\n/gu, '\n');
}

describe('linux install layout', () => {
  it('keeps the public proxy off the loopback address', () => {
    for (const path of ['infra/nginx/helpdesk.conf', 'infra/apache/helpdesk.conf']) {
      expect(text(path), path).not.toContain('127.0.0.1');
      expect(text(path), path).toContain('192.0.2.10');
      expect(text(path), path).toContain('/etc/kmbhelp/tls/fullchain.pem');
      expect(text(path), path).toContain('/etc/kmbhelp/tls/privkey.pem');
      expect(text(path), path).toContain('/.well-known/acme-challenge/');
      expect(text(path), path).toContain('/var/www/acme');
    }
  });

  it('runs API and worker from the environment file', () => {
    for (const path of [
      'infra/systemd/kmbhelp-api.service',
      'infra/systemd/kmbhelp-worker.service',
    ]) {
      const unit = text(path);
      expect(unit, path).toContain('EnvironmentFile=/etc/kmbhelp/kmbhelp.env');
      expect(unit, path).toContain('Environment=NODE_ENV=production');
      expect(unit, path).toContain('User=kmbhelp');
    }
  });

  it('limits the database role and keeps the backup password out of the script', () => {
    const role = text('infra/postgres/kmbhelp-role.sql');
    expect(role).toContain('NOSUPERUSER');
    expect(role).toContain('NOCREATEDB');
    expect(role).toContain('NOCREATEROLE');
    expect(role).toContain("PASSWORD 'replace-me'");
    const backup = text('scripts/backup-database.mjs');
    expect(backup).not.toContain('replace-me');
    expect(backup).toContain('DATABASE_URL');
    expect(backup).toContain('--format=custom');
    expect(backup).toContain('7 * 24 * 60 * 60 * 1000');
    expect(text('infra/cron/kmbhelp-backup')).toContain(
      'kmbhelp /usr/bin/node /opt/kmbhelp/scripts/backup-database.mjs',
    );
  });

  it('documents the migrate and restart upgrade', () => {
    const guide = text('docs/installation-linux.md');
    expect(guide).toContain(
      'sudo -u kmbhelp pnpm db:migrate && sudo systemctl restart kmbhelp-api kmbhelp-worker',
    );
    expect(guide).toContain('API_HOST');
    expect(guide).toContain('192.0.2.10');
    expect(guide).toContain('net-tools');
    expect(guide).toContain('certbot certonly --webroot');
    expect(guide).toContain('36.500');
    expect(guide).toContain('4 GB');
    expect(guide).toContain('2 vCPU');
  });
});

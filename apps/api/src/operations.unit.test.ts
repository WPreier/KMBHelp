import { describe, expect, it } from 'vitest';
import { inspectConfiguration } from './configuration.js';
import { emitNotice } from './notices.js';
import { formatSyslog, syslogPri } from './syslog.js';

describe('syslog and configuration', () => {
  it('formats the three categories as local0 syslog', () => {
    expect(syslogPri('informational')).toBe(134);
    expect(syslogPri('warning')).toBe(132);
    expect(syslogPri('error')).toBe(131);
    const line = formatSyslog('error', 'MADC1.kmbcloud down', new Date('2026-10-26T18:00:00'));
    expect(line.startsWith('<131>')).toBe(true);
    expect(line).toContain('KMBHelp: MADC1.kmbcloud down');
  });

  it('sends a reachable failure and hides secrets from the configuration report', async () => {
    const sent: string[] = [];
    const emitted = await emitNotice({
      env: { SYSLOG_HOST: '127.0.0.1', SYSLOG_PORT: '514' },
      code: 'directory.unreachable',
      detail: 'MADC1.kmbcloud',
      log: () => undefined,
      send: async (_host, _port, line) => {
        sent.push(line);
      },
    });
    expect(emitted).toBe(true);
    expect(sent[0]).toContain('MADC1.kmbcloud');

    const report = await inspectConfiguration(
      {
        DATABASE_URL: 'postgresql://postgres:secret-db-password@127.0.0.1/kmbhelp',
        LDAPS_BIND_PASSWORD: 'secret-bind-password',
        LDAPS_URL: 'ldaps://MADC1.kmbcloud.at:636',
      },
      {
        tcp: async () => 'dns',
        fingerprint: async () => null,
        bind: async () => false,
        database: async () => {
          throw new Error('down');
        },
        graphDns: async () => false,
        syslog: async () => true,
      },
    );
    const body = JSON.stringify(report);
    expect(body).not.toContain('secret-db-password');
    expect(body).not.toContain('secret-bind-password');
    expect(report.checks.some((entry) => entry.code === 'directory.short' && entry.status === 'error')).toBe(
      true,
    );
  });
});

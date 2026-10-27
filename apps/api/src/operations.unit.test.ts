import { describe, expect, it } from 'vitest';
import { inspectConfiguration } from './configuration.js';
import { emitNotice } from './notices.js';
import { formatSyslog, syslogPri } from './syslog.js';

describe('syslog and configuration', () => {
  it('formats the three categories as local0 syslog', () => {
    expect(syslogPri('informational')).toBe(134);
    expect(syslogPri('warning')).toBe(132);
    expect(syslogPri('error')).toBe(131);
    const line = formatSyslog(
      'error',
      'MADC1.kmbcloud.at down',
      new Date('2026-10-26T18:00:00.000Z'),
    );
    expect(line.startsWith('<131>1 2026-10-26T19:00:00.000+01:00 ')).toBe(true);
    expect(line).toContain(' KMBHelp - - - ');
    expect(line.endsWith('MADC1.kmbcloud.at down')).toBe(true);
    expect(line).toMatch(/^<\d{1,3}>1 \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2} /u);
    expect(syslogPri('error', 'local1')).toBe(139);
  });

  it('sends a reachable failure and hides secrets from the configuration report', async () => {
    const sent: string[] = [];
    const emitted = await emitNotice({
      env: { SYSLOG_HOST: '127.0.0.1', SYSLOG_PORT: '514' },
      code: 'directory.unreachable',
      detail: 'MADC1.kmbcloud.at',
      log: () => undefined,
      send: async (_host, _port, line) => {
        sent.push(line);
      },
    });
    expect(emitted).toBe(true);
    expect(sent[0]).toContain('MADC1.kmbcloud.at');

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
    expect(
      report.checks.some((entry) => entry.code === 'directory.fqdn' && entry.status === 'error'),
    ).toBe(true);
    expect(report.checks.some((entry) => entry.code === 'directory.short')).toBe(false);
    expect(report.syslog).toEqual({
      host: '192.168.191.215',
      port: 514,
      appName: 'KMBHelp',
      facility: 'local0',
      offset: '+01:00',
    });
  });
});

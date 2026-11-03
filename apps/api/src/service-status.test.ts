import { describe, expect, it } from 'vitest';
import { serviceRows, type ServiceFacts } from './service-status.js';

const healthy: ServiceFacts = {
  database: true,
  worker: 'up',
  smtp: 'open',
  directory: 'ok',
  directoryDays: 40,
  mailbox: 'ok',
  ollama: 'ok',
  syslogHost: '192.168.191.215',
};

describe('serviceRows', () => {
  it('marks a healthy service green and a failed service red', () => {
    const report = serviceRows(healthy);
    expect(report.services.map((entry) => entry.status)).toEqual([
      'ok',
      'ok',
      'ok',
      'ok',
      'ok',
      'ok',
      'ok',
    ]);
    const failed = serviceRows({
      ...healthy,
      database: false,
      worker: 'down',
      smtp: 'closed',
      directory: 'bind',
      mailbox: 'down',
      ollama: 'down',
      syslogHost: '',
    });
    expect(failed.services.every((entry) => entry.status === 'error')).toBe(true);
    expect(failed.services.find((entry) => entry.code === 'directory')?.textDe).toBe(
      'Das Dienstkonto kann nicht suchen.',
    );
  });

  it('uses red when the certificate cannot be read', () => {
    const report = serviceRows({ ...healthy, directory: 'unreadable', directoryDays: null });
    expect(report.services.find((entry) => entry.code === 'directory')).toMatchObject({
      status: 'error',
      textDe: 'Das Zertifikat lässt sich nicht lesen.',
    });
  });
});

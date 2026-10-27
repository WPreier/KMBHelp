import { createSocket } from 'node:dgram';
import { hostname } from 'node:os';
import {
  defaultSyslogFacility,
  defaultSyslogHost,
  defaultSyslogName,
  defaultSyslogOffset,
  defaultSyslogPort,
  syslogFacilities,
  syslogOffsetPattern,
} from '@kmbhelp/shared';

export type NoticeCategory = 'informational' | 'warning' | 'error';

const severityCode: Record<NoticeCategory, number> = {
  informational: 6,
  warning: 4,
  error: 3,
};

const facilityCode: Record<(typeof syslogFacilities)[number], number> = {
  local0: 16,
  local1: 17,
  local2: 18,
  local3: 19,
  local4: 20,
  local5: 21,
  local6: 22,
  local7: 23,
};

export type SyslogIdentity = {
  appName: string;
  facility: (typeof syslogFacilities)[number];
};

export function syslogFacility(value: string | undefined): (typeof syslogFacilities)[number] {
  const text = (value ?? defaultSyslogFacility).trim().toLowerCase();
  if ((syslogFacilities as readonly string[]).includes(text)) {
    return text as (typeof syslogFacilities)[number];
  }
  return defaultSyslogFacility;
}

export function syslogOffset(value: string | undefined): string {
  const text = (value ?? '').trim();
  return syslogOffsetPattern.test(text) ? text : defaultSyslogOffset;
}

export function syslogTimestamp(at: Date, offset = defaultSyslogOffset): string {
  const chosen = syslogOffset(offset);
  const sign = chosen.startsWith('-') ? -1 : 1;
  const [hours, minutes] = chosen.slice(1).split(':');
  const shift = sign * ((Number(hours) || 0) * 60 + (Number(minutes) || 0)) * 60_000;
  const local = new Date(at.getTime() + shift).toISOString().replace(/Z$/u, '');
  return `${local}${chosen}`;
}

export function syslogAppName(value: string | undefined): string {
  const cleaned = (value ?? '')
    .replace(/[^\x21-\x7e]/gu, '')
    .replace(/\s/gu, '')
    .slice(0, 48);
  return cleaned || defaultSyslogName;
}

export function syslogPri(category: NoticeCategory, facility = defaultSyslogFacility): number {
  return facilityCode[syslogFacility(facility)] * 8 + severityCode[category];
}

function senderName(): string {
  const cleaned = (hostname().split(/[\s.]/u)[0] ?? '').replace(/[^\x21-\x7e]/gu, '').slice(0, 255);
  return cleaned || 'kmbhelp';
}

export function formatSyslog(
  category: NoticeCategory,
  message: string,
  at = new Date(),
  identity?: {
    appName?: string | undefined;
    facility?: string | undefined;
    offset?: string | undefined;
  },
): string {
  const text = message.replace(/[\r\n]+/gu, ' ').slice(0, 900);
  const appName = syslogAppName(identity?.appName);
  const pri = syslogPri(category, identity?.facility);
  const stamp = syslogTimestamp(at, identity?.offset);
  return `<${pri}>1 ${stamp} ${senderName()} ${appName} - - - \uFEFF${text}`;
}

export function sendSyslog(host: string, port: number, line: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createSocket('udp4');
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('timeout'));
    }, 2000);
    socket.send(Buffer.from(line, 'utf8'), port, host, (error) => {
      clearTimeout(timer);
      socket.close();
      if (error) reject(error);
      else resolve();
    });
  });
}

export function syslogTarget(env: NodeJS.ProcessEnv): {
  host: string;
  port: number;
  appName: string;
  facility: (typeof syslogFacilities)[number];
  offset: string;
} {
  const host = env.SYSLOG_HOST?.trim() || defaultSyslogHost;
  const port = Number(env.SYSLOG_PORT?.trim() || String(defaultSyslogPort));
  return {
    host,
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : defaultSyslogPort,
    appName: syslogAppName(env.SYSLOG_NAME),
    facility: syslogFacility(env.SYSLOG_FACILITY),
    offset: syslogOffset(env.SYSLOG_UTC_OFFSET),
  };
}

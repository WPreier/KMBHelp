import { createSocket } from 'node:dgram';
import { hostname } from 'node:os';

export type NoticeCategory = 'informational' | 'warning' | 'error';

const severityCode: Record<NoticeCategory, number> = {
  informational: 6,
  warning: 4,
  error: 3,
};

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function syslogPri(category: NoticeCategory): number {
  return 16 * 8 + severityCode[category];
}

export function formatSyslog(category: NoticeCategory, message: string, at = new Date()): string {
  const day = String(at.getDate()).padStart(2, ' ');
  const time = [at.getHours(), at.getMinutes(), at.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
  const stamp = `${months[at.getMonth()]} ${day} ${time}`;
  const text = message.replace(/[\r\n]+/gu, ' ').slice(0, 900);
  const host = hostname().split(/\s/u)[0] || 'kmbhelp';
  return `<${syslogPri(category)}>${stamp} ${host} KMBHelp: ${text}`;
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

export function syslogTarget(env: NodeJS.ProcessEnv): { host: string; port: number } {
  const host = env.SYSLOG_HOST?.trim() || '127.0.0.1';
  const port = Number(env.SYSLOG_PORT?.trim() || '514');
  return { host, port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 514 };
}

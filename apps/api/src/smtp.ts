import { connect, type Socket } from 'node:net';

export type SmtpLogin = 'none' | 'plain' | 'login';

export type SmtpSettings = {
  host: string;
  port: number;
  user: string;
  password: string;
  login: SmtpLogin;
  from: string;
  to: string;
};

const emailPattern = /^[^@\s]+@[^@\s]+$/u;

export function smtpLogin(value: string | undefined): SmtpLogin {
  const name = value?.trim().toLowerCase() ?? '';
  if (name === 'plain' || name === 'login') return name;
  return 'none';
}

export function smtpSettingsFromEnv(env: NodeJS.ProcessEnv): SmtpSettings {
  const port = Number(env.SMTP_PORT?.trim() || '25');
  const mailbox = env.GRAPH_MAILBOX?.trim() ?? '';
  return {
    host: env.SMTP_SERVER?.trim() || '127.0.0.1',
    port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 25,
    user: env.SMTP_USER?.trim() ?? '',
    password: env.SMTP_PASSWD ?? '',
    login: smtpLogin(env.SMTP_LOGIN),
    from: emailPattern.test(mailbox) ? mailbox : 'helpdesk@kmbcloud.at',
    to: env.SMTP_TO?.trim() || 'helpdesk@ppc.at',
  };
}

export async function sendSmtp(
  settings: SmtpSettings,
  message: { subject: string; text: string },
  timeoutMs = 15_000,
): Promise<void> {
  if (!emailPattern.test(settings.from) || !emailPattern.test(settings.to)) {
    throw new Error('smtp address');
  }
  if (settings.login !== 'none' && (settings.user === '' || settings.password === '')) {
    throw new Error('smtp login');
  }
  const socket = connect({ host: settings.host, port: settings.port });
  socket.setTimeout(timeoutMs);
  const session = new SmtpSession(socket);
  try {
    await session.expect(220);
    await session.command('EHLO kmbhelp', 250);
    if (settings.login === 'plain') {
      const token = Buffer.from(`\u0000${settings.user}\u0000${settings.password}`).toString(
        'base64',
      );
      await session.command(`AUTH PLAIN ${token}`, 235);
    } else if (settings.login === 'login') {
      await session.command('AUTH LOGIN', 334);
      await session.command(Buffer.from(settings.user).toString('base64'), 334);
      await session.command(Buffer.from(settings.password).toString('base64'), 235);
    }
    await session.command(`MAIL FROM:<${settings.from}>`, 250);
    await session.command(`RCPT TO:<${settings.to}>`, 250);
    await session.command('DATA', 354);
    const subject = message.subject.replace(/[\r\n]/gu, ' ').slice(0, 200);
    const body = message.text.replace(/\r?\n/gu, '\r\n').replace(/^\./gmu, '..');
    const accepted = session.expect(250);
    socket.write(
      `Subject: ${subject}\r\nFrom: ${settings.from}\r\nTo: ${settings.to}\r\n\r\n${body}\r\n.\r\n`,
    );
    await accepted;
    await session.command('QUIT', 221);
  } finally {
    socket.destroy();
  }
}

class SmtpSession {
  private buffer = '';
  private readonly waiters: Array<{
    expected: number;
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(private readonly socket: Socket) {
    socket.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8');
      this.drain();
    });
    socket.once('error', (error) => this.fail(error));
    socket.once('timeout', () => this.fail(new Error('smtp timeout')));
  }

  command(line: string, expected: number): Promise<void> {
    const pending = this.expect(expected);
    this.socket.write(`${line}\r\n`);
    return pending;
  }

  expect(expected: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.waiters.push({ expected, resolve, reject });
      this.drain();
    });
  }

  private fail(error: Error): void {
    const waiting = this.waiters.splice(0);
    for (const waiter of waiting) waiter.reject(error);
  }

  private drain(): void {
    const lines = this.buffer.split(/\r?\n/u);
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!/^\d{3} /u.test(line)) continue;
      const waiter = this.waiters.shift();
      if (!waiter) continue;
      const code = Number(line.slice(0, 3));
      if (code === waiter.expected) waiter.resolve();
      else waiter.reject(new Error(`smtp ${code}`));
    }
  }
}

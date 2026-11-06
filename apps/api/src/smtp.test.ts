import { createServer, type Server, type Socket } from 'node:net';
import { describe, expect, it } from 'vitest';
import { sendSmtp, smtpSettingsFromEnv } from './smtp.js';

function speak(socket: Socket, line: string): void {
  socket.write(`${line}\r\n`);
}

describe('sendSmtp', () => {
  it('sends without login when MAIL_SMTP_LOGIN is none', async () => {
    const seen: string[] = [];
    const server: Server = createServer((socket) => {
      speak(socket, '220 local');
      socket.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        seen.push(text);
        if (text.startsWith('EHLO')) speak(socket, '250 ok');
        else if (text.startsWith('MAIL FROM')) speak(socket, '250 ok');
        else if (text.startsWith('RCPT TO')) speak(socket, '250 ok');
        else if (text.startsWith('DATA')) speak(socket, '354 go');
        else if (text.includes('\r\n.\r\n')) speak(socket, '250 queued');
        else if (text.startsWith('QUIT')) {
          speak(socket, '221 bye');
          socket.end();
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    try {
      await sendSmtp(
        {
          host: '127.0.0.1',
          port,
          user: '',
          password: '',
          login: 'none',
          from: 'helpdesk@kmbcloud.at',
          to: 'helpdesk@ppc.at',
        },
        { subject: 'KMBHelp: SMTP-Prüfung', text: 'Prüfung.\n' },
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    const transcript = seen.join('');
    expect(transcript).not.toContain('AUTH');
    expect(transcript).toContain('RCPT TO:<helpdesk@ppc.at>');
    expect(transcript).toContain('Subject: KMBHelp: SMTP-Prüfung');
  });

  it('reads the local defaults', () => {
    const settings = smtpSettingsFromEnv({});
    expect(settings.host).toBe('127.0.0.1');
    expect(settings.port).toBe(25);
    expect(settings.login).toBe('none');
    expect(settings.user).toBe('');
    expect(settings.password).toBe('');
    expect(settings.to).toBe('helpdesk@ppc.at');
  });
});

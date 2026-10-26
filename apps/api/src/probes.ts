import { lookup } from 'node:dns/promises';
import { connect } from 'node:net';
import tls from 'node:tls';
import { X509Certificate } from 'node:crypto';

export type TcpResult = 'open' | 'dns' | 'closed' | 'timeout';

export async function tcpOpen(host: string, port: number, timeoutMs = 4000): Promise<TcpResult> {
  try {
    await lookup(host);
  } catch {
    return 'dns';
  }
  return new Promise((resolve) => {
    const socket = connect({ host, port, timeout: timeoutMs });
    const finish = (value: TcpResult) => {
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => finish('open'));
    socket.once('timeout', () => finish('timeout'));
    socket.once('error', () => finish('closed'));
  });
}

export function ldapsHost(url: string | undefined): { host: string; port: number } {
  const fallback = { host: 'MADC1.kmbcloud.at', port: 636 };
  if (!url?.trim()) return fallback;
  try {
    const parsed = new URL(url);
    const port = Number(parsed.port || (parsed.protocol === 'ldaps:' ? 636 : 389));
    return { host: parsed.hostname, port };
  } catch {
    return fallback;
  }
}

export async function peerFingerprint(host: string, port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: 4000 });
    const finish = (value: string | null) => {
      socket.destroy();
      resolve(value);
    };
    socket.once('secureConnect', () => {
      const peer = socket.getPeerCertificate();
      if (!peer.raw) {
        finish(null);
        return;
      }
      finish(new X509Certificate(peer.raw).fingerprint256);
    });
    socket.once('timeout', () => finish(null));
    socket.once('error', () => finish(null));
  });
}

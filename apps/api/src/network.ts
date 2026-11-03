function ipv4(value: string): number | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/u.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    result = (result << 8) | octet;
  }
  return result >>> 0;
}

function matches(ip: string, rule: string): boolean {
  if (!rule.includes('/')) return ip === rule;
  const [base, bitsText] = rule.split('/');
  const bits = Number(bitsText);
  if (!base || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const address = ipv4(ip);
  const network = ipv4(base);
  if (address === null || network === null) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~0 << (32 - bits)) >>> 0;
  return (address & mask) === (network & mask);
}

export function viewerAddress(
  peer: string,
  forwarded: string | undefined,
  apiHost: string,
): string {
  const normalizedPeer = peer.trim().replace(/^::ffff:/u, '');
  const candidate = firstAddress(forwarded);
  if (candidate && trustedProxy(normalizedPeer, apiHost.trim())) return candidate;
  return normalizedPeer || 'unknown';
}

function trustedProxy(peer: string, apiHost: string): boolean {
  if (peer === '::1' || ipAllowed(peer, '127.0.0.0/8')) return true;
  return apiHost !== '' && peer === apiHost;
}

function firstAddress(forwarded: string | undefined): string | null {
  const first =
    forwarded
      ?.split(',')[0]
      ?.trim()
      .replace(/^::ffff:/u, '') ?? '';
  if (first === '' || first.length > 80) return null;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/u.test(first)) return ipv4(first) === null ? null : first;
  if (/^[0-9a-f:]+$/iu.test(first) && first.includes(':')) return first;
  return null;
}

export function ipAllowed(ip: string, allowlist: string): boolean {
  const normalized = ip.trim().replace(/^::ffff:/u, '');
  const rules = allowlist
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  return rules.some((rule) => matches(normalized, rule.replace(/^::ffff:/u, '')));
}

const developmentLoopback = '127.0.0.0/8';

export function withDevelopmentLoopback(allowlist: string, enabled: boolean): string {
  if (!enabled) return allowlist;
  const rules = allowlist
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  if (rules.includes(developmentLoopback)) return rules.join(',');
  return [...rules, developmentLoopback].join(',');
}

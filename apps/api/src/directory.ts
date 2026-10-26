import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import tls from 'node:tls';
import { Client } from 'ldapts';

export class DirectoryUnavailable extends Error {
  constructor() {
    super('directory unavailable');
  }
}

export type DirectoryAccount = {
  email: string;
  displayName: string;
  adObjectId: string;
  active: boolean;
  inHelpdeskGroup: boolean;
};

export type Directory = {
  readonly configured: boolean;
  verifyPassword(email: string, password: string): Promise<DirectoryAccount | null>;
  assertMembership(email: string): Promise<'member' | 'absent'>;
};

export type MemoryDirectoryAccount = DirectoryAccount & { password: string };

export function unconfiguredDirectory(): Directory {
  return {
    configured: false,
    verifyPassword(): Promise<DirectoryAccount | null> {
      throw new DirectoryUnavailable();
    },
    assertMembership(): Promise<'member' | 'absent'> {
      throw new DirectoryUnavailable();
    },
  };
}

export function memoryDirectory(accounts: MemoryDirectoryAccount[]): Directory {
  return {
    configured: true,
    async verifyPassword(email, password) {
      const found = accounts.find((account) => account.email.toLowerCase() === email.toLowerCase());
      if (!found || found.password !== password) return null;
      return {
        email: found.email,
        displayName: found.displayName,
        adObjectId: found.adObjectId,
        active: found.active,
        inHelpdeskGroup: found.inHelpdeskGroup,
      };
    },
    async assertMembership(email) {
      const found = accounts.find((account) => account.email.toLowerCase() === email.toLowerCase());
      if (!found || !found.active || !found.inHelpdeskGroup) return 'absent';
      return 'member';
    },
  };
}

export type LdapsConfig = {
  url: string;
  bindDn: string;
  bindPassword: string;
  baseDn: string;
  groupDn: string;
  caFile?: string | undefined;
  caPem?: string | undefined;
};

export function directoryFromEnv(env: NodeJS.ProcessEnv): Directory {
  const url = env.LDAPS_URL?.trim() ?? '';
  const bindDn = env.LDAPS_BIND_DN?.trim() ?? '';
  const bindPassword = env.LDAPS_BIND_PASSWORD ?? '';
  const baseDn = env.LDAPS_BASE_DN?.trim() ?? '';
  const groupDn = env.LDAPS_GROUP_DN?.trim() ?? '';
  if (!url || !bindDn || bindPassword.trim() === '' || !baseDn || !groupDn)
    return unconfiguredDirectory();
  return ldapDirectory({
    url,
    bindDn,
    bindPassword,
    baseDn,
    groupDn,
    caFile: env.LDAPS_CA_FILE?.trim() || undefined,
    caPem: env.LDAPS_CA_PEM?.trim() || undefined,
  });
}

export function ldapFilterEscape(value: string): string {
  return value.replace(
    /[\\*()\0]/gu,
    (char) => `\\${char.charCodeAt(0).toString(16).padStart(2, '0')}`,
  );
}

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return '';
}

function disabled(value: unknown): boolean {
  return (Number(value ?? 0) & 2) === 2;
}

function memberOfGroup(value: unknown, groupDn: string): boolean {
  const entries = Array.isArray(value) ? value : value == null ? [] : [value];
  const wanted = groupDn.toLowerCase();
  return entries.some((entry) => text(entry).toLowerCase() === wanted);
}

function objectId(value: unknown): string {
  if (Buffer.isBuffer(value)) return value.toString('hex');
  return text(value);
}

async function searchAccount(client: Client, config: LdapsConfig, email: string) {
  const escaped = ldapFilterEscape(email);
  const { searchEntries } = await client.search(config.baseDn, {
    scope: 'sub',
    filter: `(&(objectCategory=person)(|(mail=${escaped})(userPrincipalName=${escaped})))`,
    attributes: ['dn', 'displayName', 'cn', 'mail', 'userAccountControl', 'objectGUID', 'memberOf'],
    sizeLimit: 2,
  });
  return searchEntries[0] as ({ dn: string } & Record<string, unknown>) | undefined;
}

export function ldapDirectory(config: LdapsConfig): Directory {
  function client(): Client {
    const pinned = pinnedCertificate(config);
    const trusted = trustedCertificate(config);
    return new Client({
      url: config.url,
      tlsOptions: pinned
        ? { rejectUnauthorized: false }
        : { rejectUnauthorized: true, ...(trusted ? { ca: [trusted] } : {}) },
      ...(pinned
        ? {
            createSecureConnection: (port: number, host: string, options?: tls.ConnectionOptions) =>
              connectPinned(port, host, options, pinned.fingerprint256),
          }
        : {}),
    } as ConstructorParameters<typeof Client>[0]);
  }

  async function serviceSearch(email: string) {
    const bound = client();
    try {
      await bound.bind(config.bindDn, config.bindPassword);
      return await searchAccount(bound, config, email);
    } catch {
      throw new DirectoryUnavailable();
    } finally {
      await bound.unbind().catch(() => undefined);
    }
  }

  return {
    configured: true,
    async verifyPassword(email, password) {
      const entry = await serviceSearch(email);
      if (!entry) return null;
      const dn = text(entry['dn']);
      if (!dn) return null;
      const user = client();
      try {
        await user.bind(dn, password);
      } catch {
        return null;
      } finally {
        await user.unbind().catch(() => undefined);
      }
      const active = !disabled(entry['userAccountControl']);
      return {
        email,
        displayName: text(entry['displayName']) || text(entry['cn']) || email,
        adObjectId: objectId(entry['objectGUID']),
        active,
        inHelpdeskGroup: memberOfGroup(entry['memberOf'], config.groupDn),
      };
    },
    async assertMembership(email) {
      const entry = await serviceSearch(email);
      if (
        !entry ||
        disabled(entry['userAccountControl']) ||
        !memberOfGroup(entry['memberOf'], config.groupDn)
      ) {
        return 'absent';
      }
      return 'member';
    },
  };
}

export async function serviceBindWorks(config: LdapsConfig): Promise<boolean> {
  try {
    const membership = await ldapDirectory(config).assertMembership(
      'probe-does-not-exist@kmbcloud.at',
    );
    return membership === 'absent' || membership === 'member';
  } catch {
    return false;
  }
}

export function directoryCertificate(
  config: Pick<LdapsConfig, 'caFile' | 'caPem'>,
): X509Certificate | null {
  const pem = config.caPem?.trim() || (config.caFile ? readFileSync(config.caFile, 'utf8') : '');
  if (!pem.trim()) return null;
  return new X509Certificate(pem);
}

function trustedCertificate(config: LdapsConfig): string | undefined {
  const certificate = directoryCertificate(config);
  if (!certificate?.ca) return undefined;
  return certificate.toString();
}

function pinnedCertificate(config: LdapsConfig): X509Certificate | undefined {
  const certificate = directoryCertificate(config);
  if (!certificate || certificate.ca) return undefined;
  return certificate;
}

function connectPinned(
  port: number,
  host: string,
  options: tls.ConnectionOptions | undefined,
  fingerprint: string,
): tls.TLSSocket {
  const socket = tls.connect(port, host, { ...options, rejectUnauthorized: false });
  socket.once('secureConnect', () => {
    const peer = socket.getPeerCertificate();
    if (!peer.raw) {
      socket.destroy(new Error('ldaps certificate missing'));
      return;
    }
    const presented = new X509Certificate(peer.raw);
    if (presented.fingerprint256 !== fingerprint) {
      socket.destroy(new Error('ldaps certificate does not match the pinned certificate'));
    }
  });
  return socket;
}

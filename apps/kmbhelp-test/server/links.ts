import type { Localized } from '../src/types';
import { fetchUrl, isCertificateNameError, type NetResult } from './net';
import { LAN_ORIGIN, PUBLIC_ORIGIN } from './targets';

export function extractHrefs(html: string): string[] {
  const hrefs: string[] = [];
  const pattern = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    hrefs.push((match[1] ?? match[2] ?? match[3] ?? '').trim());
  }
  return hrefs;
}

export function classifyLink(href: string, base: URL): { kind: 'skip' | 'internal' | 'external'; url?: URL } {
  if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) {
    return { kind: 'skip' };
  }
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return { kind: 'skip' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { kind: 'skip' };
  url.hash = '';
  if (url.host === base.host) return { kind: 'internal', url };
  return { kind: 'external', url };
}

export type LinkCheck = { url: string; ok: boolean; detail: string };

export function verdictForLinks(input: {
  retrieved: boolean;
  retrieveError?: string;
  pageStatus: number;
  pageType: string;
  tlsNote: Localized;
  lanNote: Localized;
  checked: LinkCheck[];
}): { status: 'pass' | 'fail'; error?: Localized; report?: Localized } {
  if (!input.retrieved) {
    return {
      status: 'fail',
      error: {
        de: `kmbhelp konnte nicht gelesen werden: ${input.retrieveError ?? 'unbekannter Fehler'}`,
        en: `kmbhelp could not be read: ${input.retrieveError ?? 'unknown error'}`,
      },
    };
  }
  const broken = input.checked.filter((item) => !item.ok);
  if (broken.length > 0) {
    const lines = broken.slice(0, 20).map((item) => `${item.url} — ${item.detail}`);
    const extra = broken.length > 20 ? `\n… ${broken.length - 20} weitere` : '';
    return {
      status: 'fail',
      error: {
        de: `Defekte externe Links:\n${lines.join('\n')}${extra}`,
        en: `Broken external links:\n${lines.join('\n')}${extra}`,
      },
    };
  }
  return {
    status: 'pass',
    report: {
      de: `Keine defekten externen Links. ${PUBLIC_ORIGIN} antwortete HTTP ${input.pageStatus} (${input.pageType || 'ohne Typ'}), ${input.checked.length} externe Links. ${input.tlsNote.de} ${input.lanNote.de}`,
      en: `No broken external links. ${PUBLIC_ORIGIN} returned HTTP ${input.pageStatus} (${input.pageType || 'no type'}), ${input.checked.length} external links. ${input.tlsNote.en} ${input.lanNote.en}`,
    },
  };
}

function contentType(result: NetResult): string {
  if (!result.ok) return '';
  const value = result.headers['content-type'];
  return Array.isArray(value) ? value.join(',') : (value ?? '');
}

function looksLikeHtml(result: Extract<NetResult, { ok: true }>): boolean {
  const type = contentType(result);
  return type.includes('html') || result.body.trimStart().startsWith('<');
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      const item = items[current];
      if (item === undefined) return;
      results[current] = await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function probeLan(publicHealth: NetResult): Promise<Localized> {
  const lan = await fetchUrl(`${LAN_ORIGIN}/health`, { timeoutMs: 2500, maxRedirects: 2 });
  if (!lan.ok) {
    return {
      de: `LAN-Host ${LAN_ORIGIN} ist nicht erreichbar.`,
      en: `LAN host ${LAN_ORIGIN} is not reachable.`,
    };
  }
  const publicOk = publicHealth.ok && publicHealth.status === 200;
  const same = publicOk && lan.status === 200;
  if (same) {
    return {
      de: `LAN-Host antwortet auf /health wie der öffentliche Host. Zertifikat bleibt bei ${PUBLIC_ORIGIN}.`,
      en: `The LAN host answers /health like the public host. The certificate check stays on ${PUBLIC_ORIGIN}.`,
    };
  }
  return {
    de: `LAN-Host antwortet HTTP ${lan.status}, wirkt aber nicht wie dieselbe App.`,
    en: `LAN host returned HTTP ${lan.status}, and does not look like the same app.`,
  };
}

export async function crawlExternalLinks(): Promise<{ status: 'pass' | 'fail'; error?: Localized; report?: Localized }> {
  let page = await fetchUrl(PUBLIC_ORIGIN, { insecure: false, timeoutMs: 12000 });
  let tlsNote: Localized = {
    de: 'Abruf mit normaler TLS-Prüfung.',
    en: 'Fetched with normal TLS verification.',
  };
  if (!page.ok && isCertificateNameError(page.error)) {
    page = await fetchUrl(PUBLIC_ORIGIN, { insecure: true, timeoutMs: 12000 });
    tlsNote = {
      de: 'Seitenabruf ohne Namensprüfung, weil das Zertifikat nicht zum Host passt. Die Zeile Zertifikat prüft das getrennt.',
      en: 'Page fetch skipped name verification because the certificate does not match the host. The certificate row checks that separately.',
    };
  }
  const health = await fetchUrl(`${PUBLIC_ORIGIN}/health`, { insecure: true, timeoutMs: 8000 });
  const lanNote = await probeLan(health);
  if (!page.ok) {
    return verdictForLinks({
      retrieved: false,
      retrieveError: page.error,
      pageStatus: 0,
      pageType: '',
      tlsNote,
      lanNote,
      checked: [],
    });
  }

  const external = new Map<string, URL>();
  if (looksLikeHtml(page)) {
    const queue: string[] = [page.url];
    const seen = new Set<string>();
    while (queue.length > 0 && seen.size < 15 && external.size < 30) {
      const next = queue.shift();
      if (!next || seen.has(next)) continue;
      seen.add(next);
      const document = next === page.url ? page : await fetchUrl(next, { insecure: true, timeoutMs: 10000 });
      if (!document.ok || !looksLikeHtml(document)) continue;
      let base: URL;
      try {
        base = new URL(document.url);
      } catch {
        continue;
      }
      for (const href of extractHrefs(document.body)) {
        const classified = classifyLink(href, base);
        if (!classified.url) continue;
        const key = classified.url.toString();
        if (classified.kind === 'internal' && !seen.has(key) && queue.length < 15) queue.push(key);
        if (classified.kind === 'external' && !external.has(key)) external.set(key, classified.url);
      }
    }
  }

  const checked = await mapPool([...external.values()], 4, async (url) => {
    const result = await fetchUrl(url.toString(), { insecure: false, timeoutMs: 10000 });
    if (!result.ok) return { url: url.toString(), ok: false, detail: result.error };
    if (result.status >= 200 && result.status < 300) return { url: url.toString(), ok: true, detail: `HTTP ${result.status}` };
    return { url: url.toString(), ok: false, detail: `HTTP ${result.status}` };
  });

  const type = contentType(page);
  return verdictForLinks({
    retrieved: true,
    pageStatus: page.status,
    pageType: type,
    tlsNote,
    lanNote,
    checked,
  });
}

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createViteServer } from 'vite';
import type { Localized, TestId, TestOutcome } from '../src/types';
import { runLanguage, runLogin, runSearch, runTheme } from './browserChecks';
import { evaluateCertificate, readCertificate } from './cert';
import { planPayload, rerunCase, runInventory } from './inventory';
import { crawlExternalLinks } from './links';
import { runFilePath } from './plan';
import { credentialsPath, readCredentials, saveCredentials } from './secrets';
import { PUBLIC_HOSTNAME } from './targets';

const PORT = Number(process.env.PORT ?? 4317);
const HOST = '127.0.0.1';

if (process.env.NODE_ENV === 'production') {
  console.error('kmbhelp-test is development-only and refuses NODE_ENV=production.');
  process.exit(1);
}

const TEST_IDS: readonly TestId[] = ['certificate', 'external-links', 'search', 'login', 'language', 'theme'];

function isLoopbackHost(hostHeader: string | undefined): boolean {
  return /^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(hostHeader ?? '');
}

function send(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 65536) {
        reject(new Error('body too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', () => reject(new Error('body unreadable')));
  });
}

async function runCertificate(): Promise<TestOutcome> {
  try {
    const facts = await readCertificate(PUBLIC_HOSTNAME);
    const verdict = evaluateCertificate(facts, PUBLIC_HOSTNAME, new Date());
    if (!verdict.ok) {
      return {
        id: 'certificate',
        status: 'fail',
        error: {
          de: verdict.reasons.map((reason) => reason.de).join(' '),
          en: verdict.reasons.map((reason) => reason.en).join(' '),
        },
      };
    }
    return {
      id: 'certificate',
      status: 'pass',
      report: {
        de: `Zertifikat für ${PUBLIC_HOSTNAME} ist zeitlich gültig und der Hostname passt.`,
        en: `The certificate for ${PUBLIC_HOSTNAME} is currently valid and the hostname matches.`,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'certificate check failed';
    return {
      id: 'certificate',
      status: 'fail',
      error: {
        de: `Zertifikat von ${PUBLIC_HOSTNAME} nicht geprüft: ${message}`,
        en: `Certificate for ${PUBLIC_HOSTNAME} was not checked: ${message}`,
      },
    };
  }
}

async function dispatchTest(id: TestId): Promise<TestOutcome> {
  if (id === 'certificate') return runCertificate();
  if (id === 'external-links') {
    const verdict = await crawlExternalLinks();
    return { id, ...verdict };
  }
  if (id === 'search') return runSearch();
  if (id === 'login') return runLogin();
  if (id === 'language') return runLanguage();
  return runTheme();
}

function isTestId(value: string): value is TestId {
  return (TEST_IDS as readonly string[]).includes(value);
}

async function handleApi(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  if (!isLoopbackHost(request.headers.host)) {
    send(response, 403, { error: { de: 'Nur lokal.', en: 'Local only.' } });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/credentials') {
    let configured = false;
    try {
      configured = (await readCredentials()) !== null;
    } catch {
      configured = false;
    }
    send(response, 200, { configured, file: credentialsPath(), mode: '0600' });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/credentials') {
    const type = request.headers['content-type'] ?? '';
    if (!type.includes('application/json')) {
      send(response, 415, { error: { de: 'Nur JSON.', en: 'JSON only.' } });
      return;
    }
    try {
      const raw = await readBody(request);
      const body: unknown = JSON.parse(raw);
      await saveCredentials(body);
      send(response, 200, { configured: true, file: credentialsPath(), mode: '0600' });
    } catch {
      const error: Localized = {
        de: 'Benutzername oder Passwort wurde abgelehnt. Es wurde nichts erfunden.',
        en: 'Username or password was rejected. Nothing was invented.',
      };
      send(response, 400, { error });
    }
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/plan') {
    const payload = await planPayload();
    send(response, 200, payload);
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/phase2') {
    const payload = await runInventory();
    const view = await planPayload();
    send(response, 200, { ...view, plan: payload.plan, results: payload.results, error: payload.error });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/phase2/case') {
    const type = request.headers['content-type'] ?? '';
    if (!type.includes('application/json')) {
      send(response, 415, { error: { de: 'Nur JSON.', en: 'JSON only.' } });
      return;
    }
    try {
      const body: unknown = JSON.parse(await readBody(request));
      const id = typeof body === 'object' && body && 'id' in body && typeof body.id === 'string' ? body.id : '';
      if (!id) {
        send(response, 400, { error: { de: 'Fall-Id fehlt.', en: 'Case id is missing.' } });
        return;
      }
      const payload = await rerunCase(id);
      const view = await planPayload();
      send(response, 200, { ...view, plan: payload.plan, results: payload.results, error: payload.error });
    } catch {
      send(response, 400, { error: { de: 'Fall nicht ausgeführt.', en: 'Case was not run.' } });
    }
    return;
  }
  const testMatch = url.pathname.match(/^\/api\/tests\/([a-z-]+)$/);
  if (request.method === 'POST' && testMatch?.[1] && isTestId(testMatch[1])) {
    console.log(`[kmbhelp-test] run ${testMatch[1]}`);
    const outcome = await dispatchTest(testMatch[1]);
    console.log(`[kmbhelp-test] ${testMatch[1]} ${outcome.status}`);
    send(response, 200, outcome);
    return;
  }
  send(response, 404, { error: { de: 'Unbekannt.', en: 'Unknown.' } });
}

const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: 'spa',
});

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${HOST}`);
  if (url.pathname.startsWith('/api/')) {
    void handleApi(request, response, url).catch(() => {
      if (!response.headersSent) {
        send(response, 500, { error: { de: 'Prüfdienstfehler.', en: 'Check service error.' } });
      }
    });
    return;
  }
  vite.middlewares(request, response, () => {
    response.statusCode = 404;
    response.end('not found');
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[kmbhelp-test] http://${HOST}:${PORT}`);
  console.log(`[kmbhelp-test] credentials file ${credentialsPath()}`);
  console.log(`[kmbhelp-test] plan run file ${runFilePath()}`);
});

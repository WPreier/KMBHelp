import http from 'node:http';
import https from 'node:https';

const MAX_BODY = 800_000;

export type NetSuccess = {
  ok: true;
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  url: string;
};

export type NetFailure = {
  ok: false;
  error: string;
  url: string;
};

export type NetResult = NetSuccess | NetFailure;

type RequestOptions = {
  insecure?: boolean;
  timeoutMs?: number;
  maxRedirects?: number;
};

function requestOnce(url: URL, insecure: boolean, timeoutMs: number): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const request = (isHttps ? https : http).request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          'user-agent': 'kmbhelp-test-dev',
          accept: 'text/html,application/xhtml+xml,*/*;q=0.1',
        },
        ...(isHttps ? { rejectUnauthorized: !insecure, servername: url.hostname } : {}),
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size <= MAX_BODY) chunks.push(chunk);
        });
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error('timeout'));
    });
    request.on('error', (error) => {
      reject(error instanceof Error ? error : new Error('request failed'));
    });
    request.end();
  });
}

export async function fetchUrl(target: string, options: RequestOptions = {}): Promise<NetResult> {
  const timeoutMs = options.timeoutMs ?? 12000;
  const maxRedirects = options.maxRedirects ?? 5;
  let current = target;
  try {
    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      const url = new URL(current);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { ok: false, error: `unsupported protocol ${url.protocol}`, url: current };
      }
      const response = await requestOnce(url, options.insecure ?? false, timeoutMs);
      const location = response.headers.location;
      if (response.status >= 300 && response.status < 400 && location && hop < maxRedirects) {
        current = new URL(location, url).toString();
        continue;
      }
      return { ok: true, status: response.status, headers: response.headers, body: response.body, url: current };
    }
    return { ok: false, error: 'too many redirects', url: current };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'request failed';
    return { ok: false, error: message, url: current };
  }
}

export function isCertificateNameError(message: string): boolean {
  return /hostname|altname|certificate|self signed|unable to verify/i.test(message);
}

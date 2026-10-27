import { handleRpc } from './rpc.js';

const origin = process.env.KMBHELP_API_ORIGIN?.trim() || 'http://127.0.0.1:3000';
const token = process.env.MCP_SERVICE_TOKEN?.trim() ?? '';
let buffer = Buffer.alloc(0);

process.stdin.on('data', (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd < 0) return;
    const header = buffer.subarray(0, headerEnd).toString('utf8');
    const match = /content-length: (\d+)/iu.exec(header);
    if (!match?.[1]) {
      buffer = buffer.subarray(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (buffer.length < start + length) return;
    const body = buffer.subarray(start, start + length).toString('utf8');
    buffer = buffer.subarray(start + length);
    void dispatch(body);
  }
});

async function dispatch(body: string): Promise<void> {
  let message: unknown;
  try {
    message = JSON.parse(body);
  } catch {
    return;
  }
  if (!message || typeof message !== 'object') return;
  const response = await handleRpc(message, { origin, token });
  if (!response) return;
  const payload = Buffer.from(JSON.stringify(response), 'utf8');
  process.stdout.write(`Content-Length: ${payload.length}\r\n\r\n`);
  process.stdout.write(payload);
}

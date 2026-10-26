import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function loadEnvFileIfPresent(fileUrl: URL): void {
  const path = fileURLToPath(fileUrl);
  if (!existsSync(path)) return;
  process.loadEnvFile(path);
}

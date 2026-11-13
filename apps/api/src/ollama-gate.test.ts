import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { withOllamaJob } from './ollama-gate.js';

describe('ollama gate', () => {
  const previous = process.env.ACTIVITY_LOG_FILE;
  let directory = '';

  afterEach(async () => {
    if (previous === undefined) delete process.env.ACTIVITY_LOG_FILE;
    else process.env.ACTIVITY_LOG_FILE = previous;
    if (directory !== '') await rm(directory, { recursive: true, force: true });
  });

  it('runs only one job at a time', async () => {
    directory = await mkdtemp(join(tmpdir(), 'kmbhelp-ollama-'));
    process.env.ACTIVITY_LOG_FILE = join(directory, 'activity.log');
    const order: string[] = [];
    const first = withOllamaJob(async () => {
      order.push('a-start');
      await new Promise((resolve) => setTimeout(resolve, 80));
      order.push('a-end');
      return 1;
    });
    const second = withOllamaJob(async () => {
      order.push('b-start');
      order.push('b-end');
      return 2;
    });
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(order).toEqual(['a-start', 'a-end', 'b-start', 'b-end']);
  });
});

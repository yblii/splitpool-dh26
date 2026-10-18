import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadApiEnv } from './load-env.ts';

describe('loadApiEnv', () => {
  const previous = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  });

  it('fills OPENAI_API_KEY from file when the process currently has an empty value', () => {
    process.env.OPENAI_API_KEY = '';
    const dir = mkdtempSync(join(tmpdir(), 'splitpool-env-'));
    const envPath = join(dir, '.env');
    writeFileSync(envPath, 'OPENAI_API_KEY=sk-from-file\n');

    const info = loadApiEnv(envPath);
    expect(info.found).toBe(true);
    expect(info.openAiKeyPresent).toBe(true);
    expect(process.env.OPENAI_API_KEY).toBe('sk-from-file');
  });

  it('does not overwrite a non-empty existing OPENAI_API_KEY', () => {
    process.env.OPENAI_API_KEY = 'sk-already-set';
    const dir = mkdtempSync(join(tmpdir(), 'splitpool-env-'));
    const envPath = join(dir, '.env');
    writeFileSync(envPath, 'OPENAI_API_KEY=sk-from-file\n');

    const info = loadApiEnv(envPath);
    expect(info.openAiKeyPresent).toBe(true);
    expect(process.env.OPENAI_API_KEY).toBe('sk-already-set');
  });
});

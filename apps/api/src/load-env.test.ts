import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadApiEnv } from './load-env.ts';

describe('loadApiEnv', () => {
  const previous = process.env.GEMINI_API_KEY;

  afterEach(() => {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  });

  it('fills GEMINI_API_KEY from file when the process currently has an empty value', () => {
    process.env.GEMINI_API_KEY = '';
    const dir = mkdtempSync(join(tmpdir(), 'splitpool-env-'));
    const envPath = join(dir, '.env');
    writeFileSync(envPath, 'GEMINI_API_KEY=AIza-from-file\n');

    const info = loadApiEnv(envPath);
    expect(info.found).toBe(true);
    expect(info.geminiKeyPresent).toBe(true);
    expect(process.env.GEMINI_API_KEY).toBe('AIza-from-file');
  });

  it('does not overwrite a non-empty existing GEMINI_API_KEY', () => {
    process.env.GEMINI_API_KEY = 'AIza-already-set';
    const dir = mkdtempSync(join(tmpdir(), 'splitpool-env-'));
    const envPath = join(dir, '.env');
    writeFileSync(envPath, 'GEMINI_API_KEY=AIza-from-file\n');

    const info = loadApiEnv(envPath);
    expect(info.geminiKeyPresent).toBe(true);
    expect(process.env.GEMINI_API_KEY).toBe('AIza-already-set');
  });
});

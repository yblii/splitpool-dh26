import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type LoadedEnvInfo = {
  path: string;
  found: boolean;
  geminiKeyPresent: boolean;
};

export function apiEnvPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../.env');
}

/**
 * Load apps/api/.env into process.env.
 * Empty existing values are treated as unset so filling in GEMINI_API_KEY later works
 * without a shell that already exported a blank key.
 */
export function loadApiEnv(envPath = apiEnvPath()): LoadedEnvInfo {
  if (!existsSync(envPath)) {
    return {
      path: envPath,
      found: false,
      geminiKeyPresent: Boolean(process.env.GEMINI_API_KEY?.trim()),
    };
  }

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim().replace(/^\uFEFF/, '');
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    const current = process.env[key];
    if (current === undefined || current.trim() === '') {
      process.env[key] = value;
    }
  }

  return {
    path: envPath,
    found: true,
    geminiKeyPresent: Boolean(process.env.GEMINI_API_KEY?.trim()),
  };
}

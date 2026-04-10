import os from 'node:os';
import path from 'node:path';
import Conf from 'conf';
import type { AuthUser, GlobalOptions, IrisConfigStore, ResolvedRuntimeOptions } from './types';

const DEFAULT_API_URL = 'http://localhost:3001';

const store = new Conf<IrisConfigStore>({
  projectName: 'iris',
  cwd: path.join(os.homedir(), '.iris'),
  configName: 'config',
  fileExtension: 'json',
  clearInvalidConfig: true,
  defaults: {
    apiUrl: DEFAULT_API_URL,
  },
});

export function normalizeApiUrl(input: string): string {
  let url = input.trim();
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/api\/v1$/i, '');
  return url || DEFAULT_API_URL;
}

export function getStoredConfig(): IrisConfigStore {
  const cfg = store.store;
  return {
    apiUrl: normalizeApiUrl(cfg.apiUrl ?? DEFAULT_API_URL),
    token: cfg.token,
    user: cfg.user,
  };
}

export function setApiUrl(apiUrl: string): void {
  store.set('apiUrl', normalizeApiUrl(apiUrl));
}

export function saveAuthSession(apiUrl: string, user: AuthUser): void {
  store.set('apiUrl', normalizeApiUrl(apiUrl));
  store.set('token', user.token);
  store.set('user', { id: user.id, email: user.email, tier: user.tier });
}

export function clearAuthSession(): void {
  store.delete('token');
  store.delete('user');
}

export function getConfigPath(): string {
  return store.path;
}

export function resolveRuntimeOptions(globalOptions: GlobalOptions): ResolvedRuntimeOptions {
  const saved = getStoredConfig();

  const apiUrl = normalizeApiUrl(globalOptions.apiUrl ?? saved.apiUrl ?? DEFAULT_API_URL);
  const token = globalOptions.token ?? saved.token;
  const color = globalOptions.color !== false;
  const json = Boolean(globalOptions.json);

  return { apiUrl, token, color, json };
}

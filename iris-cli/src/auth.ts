import inquirer from 'inquirer';
import { login } from './api';
import { clearAuthSession, getStoredConfig, normalizeApiUrl, saveAuthSession } from './config';
import type { AuthUser, ResolvedRuntimeOptions } from './types';

export async function promptLogin(defaultApiUrl?: string): Promise<{ apiUrl: string; user: AuthUser }> {
  const saved = getStoredConfig();
  const initialApi = normalizeApiUrl(defaultApiUrl ?? saved.apiUrl);

  const answers = await inquirer.prompt<{
    apiUrl: string;
    email: string;
    password: string;
  }>([
    {
      type: 'input',
      name: 'apiUrl',
      message: 'API URL:',
      default: initialApi,
    },
    {
      type: 'input',
      name: 'email',
      message: 'Email:',
      validate: (value: string) => {
        if (!value.trim()) return 'Email is required';
        return true;
      },
    },
    {
      type: 'password',
      name: 'password',
      message: 'Password:',
      mask: '*',
      validate: (value: string) => {
        if (!value.trim()) return 'Password is required';
        return true;
      },
    },
  ]);

  const apiUrl = normalizeApiUrl(answers.apiUrl);
  const user = await login(apiUrl, answers.email, answers.password);
  saveAuthSession(apiUrl, user);

  return { apiUrl, user };
}

export function logout(): void {
  clearAuthSession();
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;

  const payload = parts[1];
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getTokenOrThrow(token?: string): string {
  if (!token) {
    throw new Error('Not logged in. Run "iris login" first or pass --token.');
  }
  return token;
}

export function getCurrentIdentity(runtime: ResolvedRuntimeOptions): {
  email: string;
  tier: string;
  apiUrl: string;
} {
  const saved = getStoredConfig();
  const token = runtime.token ?? saved.token;

  if (!token) {
    throw new Error('No active session. Run "iris login" first.');
  }

  if (saved.user?.email) {
    return {
      email: saved.user.email,
      tier: saved.user.tier,
      apiUrl: runtime.apiUrl,
    };
  }

  const payload = decodeJwtPayload(token);
  const email = typeof payload?.email === 'string' ? payload.email : 'unknown@token';
  const tier = typeof payload?.tier === 'string' ? payload.tier : 'unknown';

  return { email, tier, apiUrl: runtime.apiUrl };
}

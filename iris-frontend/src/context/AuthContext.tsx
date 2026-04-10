import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AuthState, User } from '../types';
import * as api from '../services/api';

const TOKEN_STORAGE_KEY = 'iris_token';

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeTier(tier: unknown): User['tier'] {
  return tier === 'pro' || tier === 'enterprise' || tier === 'free' ? tier : 'free';
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const raw = parts[1] ?? '';

  // base64url → base64
  const base64 = raw.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');

  try {
    const json = atob(padded);
    const parsed: unknown = JSON.parse(json);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isTokenExpired(payload: Record<string, unknown>): boolean {
  const exp = payload.exp;
  if (typeof exp === 'number') return exp * 1000 < Date.now();
  if (typeof exp === 'string') {
    const n = Number(exp);
    return Number.isFinite(n) ? n * 1000 < Date.now() : false;
  }
  return false;
}

function userFromJwtPayload(payload: Record<string, unknown>): User | null {
  const idRaw = payload.id ?? payload.sub;
  const emailRaw = payload.email;

  if (typeof idRaw !== 'string' || typeof emailRaw !== 'string') return null;

  return {
    id: idRaw,
    email: emailRaw,
    tier: normalizeTier(payload.tier),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Restore auth from localStorage on mount.
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!storedToken) {
      setLoading(false);
      return;
    }

    const payload = parseJwtPayload(storedToken);
    if (!payload || isTokenExpired(payload)) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      setUser(null);
      setToken(null);
      setLoading(false);
      return;
    }

    const parsedUser = userFromJwtPayload(payload);
    if (!parsedUser) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      setUser(null);
      setToken(null);
      setLoading(false);
      return;
    }

    setUser(parsedUser);
    setToken(storedToken);
    setLoading(false);
  }, []);

  const isAuthenticated = !!user && !!token;

  async function login(email: string, password: string): Promise<void> {
    setLoading(true);
    try {
      const data = await api.login(email, password);
      setUser({ id: data.id, email: data.email, tier: data.tier });
      setToken(data.token);
      navigate('/dashboard', { replace: true });
    } finally {
      setLoading(false);
    }
  }

  async function register(email: string, password: string, name: string): Promise<void> {
    setLoading(true);
    try {
      const data = await api.register(email, password, name);
      setUser({ id: data.id, email: data.email, tier: data.tier });
      setToken(data.token);
      navigate('/dashboard', { replace: true });
    } finally {
      setLoading(false);
    }
  }

  function logout(): void {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setUser(null);
    setToken(null);
    navigate('/', { replace: true });
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      isAuthenticated,
      login,
      register,
      logout,
    }),
    [user, token, loading, isAuthenticated]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

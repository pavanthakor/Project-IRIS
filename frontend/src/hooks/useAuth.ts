import { useState, useEffect } from 'react';
import * as api from '../services/api';

interface AuthUser { id: string; email: string; tier: string; }

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp && payload.exp * 1000 < Date.now()) {
          localStorage.clear();
          setUser(null);
        } else {
          setUser({ id: payload.id || payload.sub, email: payload.email, tier: payload.tier || 'free' });
        }
      } catch {
        localStorage.clear();
        setUser(null);
      }
    }
    setLoading(false);
  }, []);

  async function login(email: string, password: string) {
    const data = await api.login(email, password);
    setUser({ id: data.id, email: data.email, tier: data.tier });
  }

  async function register(email: string, password: string) {
    const data = await api.register(email, password);
    setUser({ id: data.id, email: data.email, tier: data.tier });
  }

  function logout() {
    localStorage.clear();
    setUser(null);
  }

  return { user, loading, login, register, logout, isAuthenticated: !!user };
}

import axios, { AxiosError } from 'axios';
import type { ThreatProfile, PaginatedHistory, IoCType } from '../types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.clear();
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export interface AuthUser { id: string; email: string; tier: string; token: string; }

export async function login(email: string, password: string): Promise<AuthUser> {
  const { data } = await api.post<AuthUser>('/auth/login', { email, password });
  localStorage.setItem('token', data.token);
  return data;
}

export async function register(email: string, password: string): Promise<AuthUser> {
  const { data } = await api.post<AuthUser>('/auth/register', { email, password });
  localStorage.setItem('token', data.token);
  return data;
}

export async function submitQuery(ioc: string, type: IoCType): Promise<ThreatProfile> {
  const { data } = await api.post<ThreatProfile>('/query', { ioc, type });
  return data;
}

export async function getQueryById(id: string): Promise<ThreatProfile> {
  const { data } = await api.get<ThreatProfile>(`/query/${id}`);
  return data;
}

export async function getHistory(page = 1, pageSize = 20): Promise<PaginatedHistory> {
  const { data } = await api.get<PaginatedHistory>('/history', { params: { page, pageSize } });
  return data;
}

export async function getHealth(): Promise<unknown> {
  const { data } = await api.get('/health');
  return data;
}

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const msg = error.response?.data?.error?.message;
    if (status === 429) return 'Rate limited. Please wait before trying again.';
    if (status === 401) return 'Session expired. Please log in again.';
    if (status === 400) return msg || 'Invalid input. Please check your entry.';
    if (status === 404) return 'Query not found.';
    if (status === 409) return msg || 'Account already exists.';
    if (error.code === 'ECONNABORTED') return 'Request timed out. The analysis is taking too long.';
    if (!error.response) return 'Cannot reach server. Make sure the backend is running.';
    return msg || 'An unexpected error occurred.';
  }
  return 'An unexpected error occurred.';
}

export default api;

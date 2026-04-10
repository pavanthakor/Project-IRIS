import axios, { AxiosError } from 'axios';
import type {
  ApiErrorResponse,
  HealthResponse,
  HistoryFilters,
  IoCType,
  PaginatedHistory,
  ReportFormat,
  ThreatProfile,
  User,
} from '../types';

const TOKEN_STORAGE_KEY = 'iris_token';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (!isRecord(value)) return false;
  const error = value.error;
  return (
    isRecord(error) &&
    typeof error.code === 'string' &&
    typeof error.message === 'string' &&
    typeof error.requestId === 'string'
  );
}

/** Convert a URL path (e.g. `/health`) into an absolute URL to the backend origin. */
function backendOriginUrl(path: string): string {
  try {
    const u = new URL(API_BASE_URL);
    return new URL(path, u.origin).toString();
  } catch {
    // If API_BASE_URL is relative, resolve against the current origin.
    if (typeof window !== 'undefined') {
      return new URL(path, window.location.origin).toString();
    }
    return path;
  }
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.clear();
      // Keep it simple: bounce back to landing.
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export interface AuthResponse extends User {
  token: string;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
  localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
  return data;
}

export async function register(email: string, password: string, name?: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/register', { email, password, name });
  localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
  return data;
}

export async function submitQuery(
  ioc: string,
  type: IoCType,
  options: { force?: boolean } = {}
): Promise<ThreatProfile> {
  const params = options.force ? { force: 'true' } : undefined;
  const { data } = await api.post<ThreatProfile>('/query', { ioc, type }, { params });
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

export async function getHealth(): Promise<HealthResponse> {
  const healthUrl = backendOriginUrl('/health');
  const { data } = await api.get<HealthResponse>(healthUrl);
  return data;
}

function buildHistoryParams(filters: HistoryFilters, page: number, pageSize: number): URLSearchParams {
  const params = new URLSearchParams();

  params.set('page', String(page));
  params.set('pageSize', String(pageSize));

  if (filters.search.trim().length > 0) params.set('search', filters.search.trim());
  if (filters.type !== 'all') params.set('type', filters.type);
  if (filters.riskLevel !== 'all') params.set('riskLevel', filters.riskLevel);
  if (filters.dateFrom) params.set('from', filters.dateFrom);
  if (filters.dateTo) params.set('to', filters.dateTo);
  params.set('sortBy', filters.sortBy);
  params.set('sortOrder', filters.sortOrder);

  return params;
}

export async function getHistoryFiltered(
  filters: HistoryFilters,
  page = 1,
  pageSize = 20
): Promise<PaginatedHistory> {
  const params = buildHistoryParams(filters, page, pageSize);
  const { data } = await api.get<PaginatedHistory>('/history', { params });
  return data;
}

export type ExportQueryFormat = Extract<ReportFormat, 'pdf' | 'json' | 'csv'>;

function acceptForExport(format: ExportQueryFormat): string {
  switch (format) {
    case 'csv':
      return 'text/csv';
    case 'pdf':
      return 'application/pdf';
    case 'json':
    default:
      return 'application/json';
  }
}

export function exportQuery(id: string, format: 'json'): Promise<ThreatProfile>;
export function exportQuery(id: string, format: 'csv' | 'pdf'): Promise<Blob>;
export async function exportQuery(id: string, format: ExportQueryFormat): Promise<ThreatProfile | Blob> {
  const accept = acceptForExport(format);
  if (format === 'json') {
    const { data } = await api.get<ThreatProfile>(`/export/query/${id}`, {
      headers: { Accept: accept },
    });
    return data;
  }

  const { data } = await api.get<Blob>(`/export/query/${id}`, {
    headers: { Accept: accept },
    responseType: 'blob',
  });
  return data;
}

export interface ExportHistoryParams {
  format?: 'json' | 'csv';
  from?: string;
  to?: string;
  minRiskScore?: number;
  maxRiskScore?: number;
}

export interface ExportHistoryJsonRow {
  id: string;
  ioc: string;
  type: string;
  riskScore: number | null;
  riskLevel?: string;
  verdict?: string;
  queriedAt: string;
}

export interface ExportHistoryJsonResponse {
  total: number;
  exported: number;
  rows: ExportHistoryJsonRow[];
}

export function exportHistory(params?: ExportHistoryParams & { format: 'json' }): Promise<ExportHistoryJsonResponse>;
export function exportHistory(params?: ExportHistoryParams & { format?: 'csv' | undefined }): Promise<Blob>;
export async function exportHistory(
  params: ExportHistoryParams = {}
): Promise<ExportHistoryJsonResponse | Blob> {
  const format = params.format ?? 'csv';
  if (format === 'json') {
    const { data } = await api.get<ExportHistoryJsonResponse>('/export/history', { params });
    return data;
  }

  const { data } = await api.get<Blob>('/export/history', {
    params: { ...params, format: 'csv' },
    responseType: 'blob',
    headers: { Accept: 'text/csv' },
  });
  return data;
}

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data;
    const message = isApiErrorResponse(data) ? data.error.message : undefined;

    if (status === 429) return 'Rate limited. Please wait before trying again.';
    if (status === 401) return 'Session expired. Please log in again.';
    if (status === 400) return message || 'Invalid input. Please check your entry.';
    if (status === 404) return 'Not found.';
    if (status === 409) return message || 'Conflict.';
    if (error.code === 'ECONNABORTED') return 'Request timed out. The analysis is taking too long.';
    if (!error.response) return 'Cannot reach server. Make sure the backend is running.';
    return message || 'An unexpected error occurred.';
  }
  return 'An unexpected error occurred.';
}

export default api;

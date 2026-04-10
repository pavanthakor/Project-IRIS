import axios, { AxiosError, AxiosInstance } from 'axios';
import type {
  AuthUser,
  HealthResponse,
  IoCType,
  PaginatedHistory,
  ThreatProfile,
} from './types';
import { normalizeApiUrl } from './config';

export interface ApiClientOptions {
  apiUrl: string;
  token?: string;
}

function buildBaseUrl(apiUrl: string): string {
  const normalized = normalizeApiUrl(apiUrl);
  return `${normalized}/api/v1`;
}

export function createApiClient(options: ApiClientOptions): AxiosInstance {
  const instance = axios.create({
    baseURL: buildBaseUrl(options.apiUrl),
    timeout: 30000,
    headers: options.token ? { Authorization: `Bearer ${options.token}` } : undefined,
  });

  return instance;
}

export async function login(apiUrl: string, email: string, password: string): Promise<AuthUser> {
  const client = createApiClient({ apiUrl });
  const { data } = await client.post<AuthUser>('/auth/login', { email, password });
  return data;
}

export async function analyzeIoC(
  client: AxiosInstance,
  ioc: string,
  type: IoCType
): Promise<ThreatProfile> {
  const { data } = await client.post<ThreatProfile>('/query', { ioc, type });
  return data;
}

export async function getHistory(
  client: AxiosInstance,
  page: number,
  pageSize: number
): Promise<PaginatedHistory> {
  const { data } = await client.get<PaginatedHistory>('/history', {
    params: { page, pageSize },
  });
  return data;
}

export async function getHealth(apiUrl: string, token?: string): Promise<HealthResponse> {
  const normalized = normalizeApiUrl(apiUrl);
  const instance = axios.create({
    baseURL: normalized,
    timeout: 15000,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const { data } = await instance.get<HealthResponse>('/health');
  return data;
}

export async function getQueryById(client: AxiosInstance, queryId: string): Promise<ThreatProfile> {
  const { data } = await client.get<ThreatProfile>(`/query/${queryId}`);
  return data;
}

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: { message?: string }; message?: string }>;
    const status = axiosError.response?.status;
    const payload = axiosError.response?.data;

    if (payload?.error?.message) {
      return payload.error.message;
    }

    if (payload?.message) {
      return payload.message;
    }

    if (status === 401) return 'Unauthorized. Run iris login or pass --token.';
    if (status === 403) return 'Forbidden.';
    if (status === 404) return 'Resource not found.';
    if (status === 429) return 'Rate limited. Try again in a bit.';
    if (status && status >= 500) return 'Server error from IRIS backend.';

    if (axiosError.code === 'ECONNABORTED') {
      return 'Request timed out.';
    }

    if (!axiosError.response) {
      return 'Cannot reach API server. Check --api-url and backend status.';
    }

    return axiosError.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unexpected error occurred.';
}

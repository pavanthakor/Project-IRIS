import { useCallback, useRef, useState } from 'react';
import type { IoCType, ThreatProfile } from '../types';
import * as api from '../services/api';

export function useQuery() {
  const [data, setData] = useState<ThreatProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const submitQuery = useCallback(async (ioc: string, type: IoCType, options: { force?: boolean } = {}) => {
    // Prepare a new abort controller for consumers that call submit repeatedly.
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const result = await api.submitQuery(ioc, type, options);
      setData(result);
    } catch (err: unknown) {
      setError(api.getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadQueryById = useCallback(async (id: string) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const result = await api.getQueryById(id);
      setData(result);
    } catch (err: unknown) {
      setError(api.getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, loading, error, submitQuery, loadQueryById, reset };
}

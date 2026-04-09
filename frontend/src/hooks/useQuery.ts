import { useState, useCallback, useRef } from 'react';
import * as api from '../services/api';
import type { ThreatProfile, IoCType } from '../types';

export function useIoCQuery() {
  const [data, setData] = useState<ThreatProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const submitQuery = useCallback(async (ioc: string, type: IoCType) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const result = await api.submitQuery(ioc, type);
      setData(result);
    } catch (err) {
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

  return { data, loading, error, submitQuery, reset };
}

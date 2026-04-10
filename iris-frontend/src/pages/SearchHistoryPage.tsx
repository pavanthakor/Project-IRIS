import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HistoryFilters, { type HistoryRiskPill } from '../components/history/HistoryFilters';
import HistoryStatsBar from '../components/history/HistoryStatsBar';
import HistoryTable from '../components/history/HistoryTable';
import type { HistoryFilters as ApiHistoryFilters, IoCType, QueryHistoryItem, ThreatProfile } from '../types';
import * as api from '../services/api';
import { formatLatency } from '../utils/formatters';

const PAGE_SIZE = 20;

function toggleInArray<T>(arr: readonly T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function withinLastDays(iso: string, days: number): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const diffMs = Date.now() - d.getTime();
  return diffMs >= 0 && diffMs <= days * 24 * 60 * 60 * 1000;
}

function riskBucket(score: number | null): HistoryRiskPill {
  if (typeof score !== 'number') return 'clean';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'clean';
}

export default function SearchHistoryPage() {
  const navigate = useNavigate();

  const [items, setItems] = useState<QueryHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [serverSearch, setServerSearch] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<IoCType[]>([]);
  const [selectedRisks, setSelectedRisks] = useState<HistoryRiskPill[]>([]);

  const [detailsById, setDetailsById] = useState<Record<string, ThreatProfile>>({});
  const inFlightDetailsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setServerSearch(search.trim());
    }, 350);
    return () => window.clearTimeout(handle);
  }, [search]);

  const serverFilters: ApiHistoryFilters = useMemo(
    () => ({
      search: serverSearch,
      type: 'all',
      riskLevel: 'all',
      sortBy: 'date',
      sortOrder: 'desc',
    }),
    [serverSearch]
  );

  const fetchPage = useCallback(
    async (targetPage: number, mode: 'replace' | 'append') => {
      try {
        if (mode === 'append') {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }

        setError(null);

        const result = await api.getHistoryFiltered(serverFilters, targetPage, PAGE_SIZE);
        setTotal(result.total);
        setPage(result.page);

        setItems((prev) => (mode === 'append' ? [...prev, ...result.items] : [...result.items]));
      } catch (err: unknown) {
        setError(api.getErrorMessage(err));
        if (mode === 'replace') {
          setItems([]);
          setTotal(0);
          setPage(1);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [serverFilters]
  );

  useEffect(() => {
    void fetchPage(1, 'replace');
  }, [fetchPage]);

  const canLoadMore = items.length < total;

  const onLoadMore = useCallback(() => {
    if (!canLoadMore || loadingMore || loading) return;
    void fetchPage(page + 1, 'append');
  }, [canLoadMore, fetchPage, loading, loadingMore, page]);

  useEffect(() => {
    if (items.length === 0) return;

    const missing = items
      .map((item) => item.id)
      .filter((id) => !detailsById[id])
      .filter((id) => !inFlightDetailsRef.current.has(id));

    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const id of missing) {
        if (cancelled) return;

        inFlightDetailsRef.current.add(id);
        try {
          const profile = await api.getQueryById(id);
          if (cancelled) return;
          setDetailsById((prev) => ({ ...prev, [id]: profile }));
        } catch {
          // Non-fatal: history list still renders.
        } finally {
          inFlightDetailsRef.current.delete(id);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [items, detailsById]);

  const filteredItems = useMemo(() => {
    const q = normalizeSearch(search);
    return items.filter((item) => {
      if (q.length > 0 && !item.iocValue.toLowerCase().includes(q)) return false;

      if (selectedTypes.length > 0 && !selectedTypes.includes(item.iocType)) return false;

      if (selectedRisks.length > 0) {
        const bucket = riskBucket(item.riskScore);
        if (!selectedRisks.includes(bucket)) return false;
      }

      return true;
    });
  }, [items, search, selectedRisks, selectedTypes]);

  const stats = useMemo(() => {
    const totalQueries = filteredItems.filter((item) => withinLastDays(item.queriedAt, 7)).length;
    const highRiskCount = filteredItems.filter((item) => typeof item.riskScore === 'number' && item.riskScore >= 60).length;

    const durations = filteredItems
      .map((item) => detailsById[item.id]?.queryDurationMs)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0);
    const avgLatencyMs = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
    const avgLatencyLabel = avgLatencyMs === null ? '—' : formatLatency(avgLatencyMs);

    const cacheHits = filteredItems.filter((item) => Boolean(detailsById[item.id]?.cachedAt)).length;

    return { totalQueries, highRiskCount, avgLatencyLabel, cacheHits };
  }, [detailsById, filteredItems]);

  const onRowClick = useCallback(
    (item: QueryHistoryItem) => {
      const params = new URLSearchParams({ id: item.id });
      navigate({ pathname: '/dashboard', search: params.toString() });
    },
    [navigate]
  );

  const onRerun = useCallback(
    (item: QueryHistoryItem) => {
      const params = new URLSearchParams({
        ioc: item.iocValue,
        type: item.iocType,
        force: 'true',
      });
      navigate({ pathname: '/dashboard', search: params.toString() });
    },
    [navigate]
  );

  return (
    <div className="space-y-4">
      <HistoryStatsBar
        totalQueries={stats.totalQueries}
        highRiskCount={stats.highRiskCount}
        avgLatencyLabel={stats.avgLatencyLabel}
        cacheHits={stats.cacheHits}
      />

      <HistoryFilters
        search={search}
        onSearchChange={setSearch}
        selectedTypes={selectedTypes}
        onToggleType={(type) => setSelectedTypes((prev) => toggleInArray(prev, type))}
        onClearTypes={() => setSelectedTypes([])}
        selectedRisks={selectedRisks}
        onToggleRisk={(risk) => setSelectedRisks((prev) => toggleInArray(prev, risk))}
        disabled={loading}
      />

      <HistoryTable
        items={filteredItems}
        total={total}
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        canLoadMore={canLoadMore}
        onLoadMore={onLoadMore}
        onRowClick={onRowClick}
        onRerun={onRerun}
        detailsById={detailsById}
      />
    </div>
  );
}

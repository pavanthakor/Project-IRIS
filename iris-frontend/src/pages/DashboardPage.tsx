import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import AnalysisLoading from '../components/dashboard/AnalysisLoading';
import ConfidenceBreakdown from '../components/dashboard/ConfidenceBreakdown';
import EmptyState from '../components/dashboard/EmptyState';
import FeedResultsPanel from '../components/dashboard/FeedResultsPanel';
import GeoLocationCard from '../components/dashboard/GeoLocationCard';
import IndicatorCard from '../components/dashboard/IndicatorCard';
import MitreAttackPanel from '../components/dashboard/MitreAttackPanel';
import RiskScoreGauge from '../components/dashboard/RiskScoreGauge';
import { useQuery } from '../hooks/useQuery';
import type { IoCType } from '../types';

function parseIoCType(raw: string | null): IoCType | null {
  if (raw === 'ip' || raw === 'domain' || raw === 'hash' || raw === 'email') {
    return raw;
  }
  return null;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.04 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28 },
  },
};

export default function DashboardPage() {
  const [searchParams] = useSearchParams();
  const { data, loading, error, submitQuery, loadQueryById, reset } = useQuery();

  const queryId = searchParams.get('id')?.trim() ?? '';
  const ioc = searchParams.get('ioc')?.trim() ?? '';
  const type = parseIoCType(searchParams.get('type'));
  const force = searchParams.get('force') === 'true';

  const [showFinalizingLoading, setShowFinalizingLoading] = useState(false);
  const wasLoadingRef = useRef(false);
  const lastQueryKeyRef = useRef<string>('');

  useEffect(() => {
    if (queryId) {
      const queryKey = `id:${queryId}`;
      if (queryKey === lastQueryKeyRef.current) return;

      lastQueryKeyRef.current = queryKey;
      void loadQueryById(queryId);
      return;
    }

    if (!ioc || !type) {
      lastQueryKeyRef.current = '';
      reset();
      return;
    }

    const queryKey = `${type}:${ioc.toLowerCase()}:${force ? 'force' : 'normal'}`;
    if (queryKey === lastQueryKeyRef.current) return;

    lastQueryKeyRef.current = queryKey;
    void submitQuery(ioc, type, { force });
  }, [force, ioc, loadQueryById, queryId, reset, submitQuery, type]);

  useEffect(() => {
    if (loading) {
      wasLoadingRef.current = true;
      return;
    }

    if (data && wasLoadingRef.current) {
      setShowFinalizingLoading(true);
      const timeout = window.setTimeout(() => {
        setShowFinalizingLoading(false);
      }, 320);
      wasLoadingRef.current = false;
      return () => window.clearTimeout(timeout);
    }

    wasLoadingRef.current = false;
    return undefined;
  }, [loading, data]);

  const queryMeta = useMemo(
    () => ({
      ioc,
      type,
    }),
    [ioc, type]
  );

  if (loading || showFinalizingLoading) {
    return <AnalysisLoading complete={showFinalizingLoading} ioc={queryMeta.ioc} />;
  }

  if (!data) {
    return (
      <div className="h-full min-h-[70vh] flex items-center justify-center px-4">
        <div className="w-full max-w-3xl">
          {error ? (
            <div className="mb-4 rounded-lg border border-iris-danger/40 bg-iris-danger/10 px-4 py-3 text-sm text-iris-danger">
              {error}
            </div>
          ) : null}
          <EmptyState />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-4"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={itemVariants} className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RiskScoreGauge profile={data} />
        <IndicatorCard profile={data} />
        <GeoLocationCard profile={data} />
      </motion.div>

      <motion.div variants={itemVariants} className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <FeedResultsPanel feeds={data.feeds} />
        </div>
        <MitreAttackPanel techniques={data.mitreTechniques} />
      </motion.div>

      <motion.div variants={itemVariants}>
        <ConfidenceBreakdown feeds={data.feeds} />
      </motion.div>
    </motion.div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Shield, Search, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import * as api from '../services/api';
import type { MitreTechnique } from '../types';

// All 38 backend techniques + their tactic groupings
const ALL_TACTICS = [
  'Initial Access',
  'Execution',
  'Persistence',
  'Defense Evasion',
  'Credential Access',
  'Discovery',
  'Lateral Movement',
  'Command and Control',
  'Exfiltration',
  'Impact',
  'Resource Development',
];

const TACTIC_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  'Initial Access':       { bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    text: 'text-rose-300',    dot: 'bg-rose-500' },
  'Execution':            { bg: 'bg-orange-500/10',  border: 'border-orange-500/30',  text: 'text-orange-300',  dot: 'bg-orange-500' },
  'Persistence':          { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-300',   dot: 'bg-amber-500' },
  'Defense Evasion':      { bg: 'bg-lime-500/10',    border: 'border-lime-500/30',    text: 'text-lime-300',    dot: 'bg-lime-500' },
  'Credential Access':    { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-300', dot: 'bg-emerald-500' },
  'Discovery':            { bg: 'bg-teal-500/10',    border: 'border-teal-500/30',    text: 'text-teal-300',    dot: 'bg-teal-500' },
  'Lateral Movement':     { bg: 'bg-cyan-500/10',    border: 'border-cyan-500/30',    text: 'text-cyan-300',    dot: 'bg-cyan-500' },
  'Command and Control':  { bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    text: 'text-blue-300',    dot: 'bg-blue-500' },
  'Exfiltration':         { bg: 'bg-indigo-500/10',  border: 'border-indigo-500/30',  text: 'text-indigo-300',  dot: 'bg-indigo-500' },
  'Impact':               { bg: 'bg-violet-500/10',  border: 'border-violet-500/30',  text: 'text-violet-300',  dot: 'bg-violet-500' },
  'Resource Development': { bg: 'bg-purple-500/10',  border: 'border-purple-500/30',  text: 'text-purple-300',  dot: 'bg-purple-500' },
};

function tacticColor(tactic: string) {
  return TACTIC_COLORS[tactic] ?? { bg: 'bg-iris-elevated', border: 'border-iris-border', text: 'text-iris-text-dim', dot: 'bg-iris-text-muted' };
}

interface SeenTechnique extends MitreTechnique {
  count: number;
  iocs: string[];
}

export default function MitrePage() {
  const [seenMap, setSeenMap] = useState<Map<string, SeenTechnique>>(new Map());
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedTactics, setExpandedTactics] = useState<Set<string>>(new Set(ALL_TACTICS));
  const [selectedTechnique, setSelectedTechnique] = useState<SeenTechnique | null>(null);

  // Pull history + full profiles to collect observed MITRE techniques
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const hist = await api.getHistory(1, 50);
        const map = new Map<string, SeenTechnique>();
        for (const item of hist.items) {
          try {
            const profile = await api.getQueryById(item.id);
            if (cancelled) return;
            for (const t of profile.mitreTechniques) {
              const existing = map.get(t.id);
              if (existing) {
                existing.count += 1;
                if (!existing.iocs.includes(profile.ioc)) existing.iocs.push(profile.ioc);
              } else {
                map.set(t.id, { ...t, count: 1, iocs: [profile.ioc] });
              }
            }
          } catch { /* skip failed profile fetches */ }
        }
        if (!cancelled) setSeenMap(new Map(map));
      } catch { /* history fetch failed */ } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const grouped = useMemo(() => {
    const q = search.toLowerCase().trim();
    const result: Record<string, SeenTechnique[]> = {};
    for (const tactic of ALL_TACTICS) {
      result[tactic] = [];
    }
    for (const [, tech] of seenMap) {
      if (q && !tech.id.toLowerCase().includes(q) && !tech.name.toLowerCase().includes(q) && !tech.tactic.toLowerCase().includes(q)) continue;
      if (result[tech.tactic]) result[tech.tactic].push(tech);
      else result[tech.tactic] = [tech];
    }
    return result;
  }, [seenMap, search]);

  const totalSeen = seenMap.size;

  function toggleTactic(tactic: string) {
    setExpandedTactics(prev => {
      const next = new Set(prev);
      if (next.has(tactic)) next.delete(tactic); else next.add(tactic);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="iris-card px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/30">
            <Shield size={20} className="text-blue-300" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-iris-text">MITRE ATT&CK Navigator</h1>
            <p className="text-xs text-iris-text-muted">Techniques observed across your query history</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-2xl font-mono font-bold text-iris-accent">{totalSeen}</p>
            <p className="text-xs text-iris-text-muted">Techniques observed</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-mono font-bold text-iris-text">38</p>
            <p className="text-xs text-iris-text-muted">In knowledge base</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-iris-text-muted" />
        <input
          className="iris-input pl-9"
          placeholder="Search techniques by ID, name, or tactic…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loadingHistory && (
        <div className="iris-card px-6 py-8 text-center text-sm text-iris-text-muted">
          Loading technique observations from query history…
        </div>
      )}

      {/* Tactic columns */}
      <div className="space-y-3">
        {ALL_TACTICS.map(tactic => {
          const color = tacticColor(tactic);
          const techniques = grouped[tactic] ?? [];
          const isExpanded = expandedTactics.has(tactic);

          return (
            <div key={tactic} className={clsx('iris-card overflow-hidden border', color.border)}>
              {/* Tactic header */}
              <button
                type="button"
                onClick={() => toggleTactic(tactic)}
                className={clsx('w-full flex items-center justify-between px-4 py-3', color.bg)}
              >
                <div className="flex items-center gap-2">
                  <span className={clsx('h-2.5 w-2.5 rounded-full', color.dot)} />
                  <span className={clsx('font-semibold text-sm', color.text)}>{tactic}</span>
                  {techniques.length > 0 && (
                    <span className={clsx('iris-badge text-[11px] px-2 py-0.5', color.bg, color.text, color.border, 'border')}>
                      {techniques.length} observed
                    </span>
                  )}
                </div>
                {isExpanded ? <ChevronUp size={16} className="text-iris-text-muted" /> : <ChevronDown size={16} className="text-iris-text-muted" />}
              </button>

              {isExpanded && (
                <div className="divide-y divide-iris-border/40">
                  {techniques.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-iris-text-muted italic">
                      {search ? 'No matching techniques' : 'No techniques observed yet'}
                    </p>
                  ) : (
                    techniques.map(tech => (
                      <button
                        key={tech.id}
                        type="button"
                        onClick={() => setSelectedTechnique(selectedTechnique?.id === tech.id ? null : tech)}
                        className="w-full text-left px-4 py-3 hover:bg-iris-elevated/40 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={clsx('font-mono text-xs font-bold', color.text)}>{tech.id}</span>
                              <span className="text-sm text-iris-text font-medium">{tech.name}</span>
                            </div>
                            {selectedTechnique?.id === tech.id && tech.description && (
                              <p className="mt-1 text-xs text-iris-text-dim leading-relaxed">{tech.description}</p>
                            )}
                            {selectedTechnique?.id === tech.id && tech.iocs.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {tech.iocs.map(ioc => (
                                  <span key={ioc} className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-iris-elevated border border-iris-border text-iris-text-dim">{ioc}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-iris-text-muted">{tech.count}×</span>
                            <a
                              href={`https://attack.mitre.org/techniques/${tech.id}/`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className={clsx('text-xs hover:underline flex items-center gap-1', color.text)}
                            >
                              ATT&CK <ExternalLink size={11} />
                            </a>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

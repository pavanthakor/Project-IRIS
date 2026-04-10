import { useCallback, useRef, useState } from 'react';
import clsx from 'clsx';
import { Upload, X, Play, AlertCircle, CheckCircle, Clock, FileUp } from 'lucide-react';
import axios from 'axios';
import api from '../services/api';
import type { IoCType, ThreatProfile } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

const IOC_PATTERNS: Record<IoCType, RegExp> = {
  ip:     /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/,
  domain: /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i,
  hash:   /^(?:[A-Fa-f0-9]{32}|[A-Fa-f0-9]{40}|[A-Fa-f0-9]{64})$/,
  email:  /^[^\s@]{1,64}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i,
};

function detectType(value: string): IoCType | null {
  for (const [type, re] of Object.entries(IOC_PATTERNS) as [IoCType, RegExp][]) {
    if (re.test(value.trim())) return type;
  }
  return null;
}

interface ParsedEntry { ioc: string; type: IoCType; raw: string; }
interface InvalidEntry { raw: string; reason: string; }

function parseInput(raw: string): { valid: ParsedEntry[]; invalid: InvalidEntry[] } {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean).filter(l => !l.startsWith('#'));
  const valid: ParsedEntry[] = [];
  const invalid: InvalidEntry[] = [];

  for (const line of lines) {
    // Support "type:value" or "value,type" or plain value
    let ioc = line;
    let type: IoCType | null = null;

    const colonMatch = line.match(/^(ip|domain|hash|email)\s*:\s*(.+)$/i);
    if (colonMatch) {
      type = colonMatch[1]!.toLowerCase() as IoCType;
      ioc  = colonMatch[2]!.trim();
    } else {
      const commaMatch = line.match(/^(.+),\s*(ip|domain|hash|email)$/i);
      if (commaMatch) {
        ioc  = commaMatch[1]!.trim();
        type = commaMatch[2]!.toLowerCase() as IoCType;
      }
    }

    if (!type) type = detectType(ioc);
    if (!type) {
      invalid.push({ raw: line, reason: 'Cannot detect type' });
    } else {
      valid.push({ ioc, type, raw: line });
    }
  }

  return { valid, invalid };
}

type ResultRow = { ioc: string; type: IoCType; profile?: ThreatProfile; error?: string; status: 'ok' | 'error'; };

export default function BulkUploadPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [results, setResults] = useState<ResultRow[]>([]);
  const [running, setRunning] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isFree = user?.tier === 'free';

  const { valid, invalid } = parseInput(text);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setText(ev.target?.result as string ?? '');
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setText(ev.target?.result as string ?? '');
    reader.readAsText(file);
  }, []);

  async function run() {
    if (valid.length === 0) return;
    setRunning(true);
    setApiError(null);
    setResults([]);
    setProgress({ done: 0, total: valid.length });

    try {
      const payload = { iocs: valid.map(v => ({ ioc: v.ioc, type: v.type })) };
      const { data } = await api.post<{
        jobId: string;
        total: number;
        completed: number;
        results: ThreatProfile[];
        durationMs: number;
      }>('/query/bulk', payload);

      const rows: ResultRow[] = data.results.map(p => ({
        ioc: p.ioc,
        type: p.type,
        profile: p,
        status: 'ok',
      }));

      // Add entries that weren't returned (shouldn't happen but be safe)
      const returnedIocs = new Set(data.results.map(p => p.ioc));
      for (const v of valid) {
        if (!returnedIocs.has(v.ioc)) {
          rows.push({ ioc: v.ioc, type: v.type, error: 'No result returned', status: 'error' });
        }
      }

      setResults(rows);
      setProgress({ done: data.completed, total: data.total });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const msg = (err.response?.data as { error?: { message?: string } })?.error?.message
          ?? err.message;
        setApiError(msg);
      } else {
        setApiError('Unexpected error');
      }
    } finally {
      setRunning(false);
    }
  }

  const scoreColor = (score: number) => {
    if (score >= 80) return 'text-iris-danger';
    if (score >= 60) return 'text-red-400';
    if (score >= 40) return 'text-iris-warning';
    return 'text-iris-success';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="iris-card px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-iris-accent/10 border border-iris-accent/30">
            <Upload size={20} className="text-iris-accent" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-iris-text">Bulk Upload</h1>
            <p className="text-xs text-iris-text-muted">Analyze multiple IoCs in one request</p>
          </div>
        </div>
        {isFree && (
          <div className="flex items-center gap-2 rounded-lg border border-iris-warning/40 bg-iris-warning/10 px-4 py-2">
            <AlertCircle size={16} className="text-iris-warning shrink-0" />
            <div>
              <p className="text-sm font-semibold text-iris-warning">Pro / Enterprise required</p>
              <p className="text-xs text-iris-text-muted">Free accounts cannot use bulk queries.</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Input panel */}
        <div className="space-y-4">
          {/* Format guide */}
          <div className="iris-card p-4 space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-iris-text-muted">Accepted Formats</h2>
            <div className="font-mono text-xs space-y-1 text-iris-text-dim">
              <p><span className="text-iris-accent">8.8.8.8</span>              <span className="text-iris-text-muted ml-4"># auto-detected IP</span></p>
              <p><span className="text-iris-accent">ip:1.2.3.4</span>           <span className="text-iris-text-muted ml-4"># explicit type prefix</span></p>
              <p><span className="text-iris-accent">google.com,domain</span>    <span className="text-iris-text-muted ml-4"># CSV type suffix</span></p>
              <p><span className="text-iris-accent">test@example.com</span>     <span className="text-iris-text-muted ml-4"># auto-detected email</span></p>
              <p><span className="text-iris-accent"># comment lines skipped</span></p>
            </div>
          </div>

          {/* Drop zone / textarea */}
          <div
            className="iris-card p-4 space-y-3"
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-iris-text-muted">IoC List</h2>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="iris-btn-secondary inline-flex items-center gap-2 px-3 py-1.5 text-xs"
              >
                <FileUp size={13} /> Upload file
              </button>
              <input ref={fileRef} type="file" accept=".txt,.csv" className="hidden" onChange={handleFile} />
            </div>

            <textarea
              className="iris-input font-mono text-xs leading-relaxed resize-none h-52"
              placeholder={"8.8.8.8\ngoogle.com\ntest@example.com\n44d88612fea8a8f36de82e1278abb02f"}
              value={text}
              onChange={e => setText(e.target.value)}
            />

            <div className="flex items-center justify-between text-xs text-iris-text-muted">
              <div className="flex items-center gap-3">
                {valid.length > 0 && <span className="text-iris-success">{valid.length} valid</span>}
                {invalid.length > 0 && <span className="text-iris-danger">{invalid.length} invalid</span>}
                {valid.length === 0 && invalid.length === 0 && <span>Enter IoCs above, one per line</span>}
              </div>
              {text && (
                <button type="button" onClick={() => setText('')} className="hover:text-iris-text">
                  <X size={13} />
                </button>
              )}
            </div>

            {invalid.length > 0 && (
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {invalid.map((inv, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-iris-danger">
                    <X size={11} />
                    <span className="font-mono truncate">{inv.raw}</span>
                    <span className="text-iris-text-muted shrink-0">— {inv.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tier limit info */}
          <div className="iris-card p-4 space-y-2 text-xs text-iris-text-muted">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-1">Tier Limits</h2>
            <div className="space-y-1">
              <div className="flex justify-between"><span>Free</span><span className="text-iris-danger">Not available</span></div>
              <div className="flex justify-between"><span>Pro</span><span className="text-iris-text">Up to 10 IoCs / request</span></div>
              <div className="flex justify-between"><span>Enterprise</span><span className="text-iris-accent">Up to 20 IoCs / request</span></div>
            </div>
          </div>

          {apiError && (
            <div className="rounded-lg border border-iris-danger/40 bg-iris-danger/10 px-4 py-3 text-sm text-iris-danger flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{apiError}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => void run()}
            disabled={running || valid.length === 0 || isFree}
            className="iris-btn-primary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running
              ? <><Clock size={16} className="animate-pulse" /> Analyzing {valid.length} IoCs…</>
              : <><Play size={16} /> Analyze {valid.length} IoC{valid.length !== 1 ? 's' : ''}</>}
          </button>
        </div>

        {/* Results panel */}
        <div className="iris-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-iris-border px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-iris-text-muted">Results</span>
            {progress && (
              <span className="text-xs text-iris-text-muted">{progress.done}/{progress.total} completed</span>
            )}
          </div>

          {running && (
            <div className="px-4 py-3">
              <div className="h-1 w-full rounded-full bg-iris-border overflow-hidden">
                <div
                  className="h-full rounded-full bg-iris-accent transition-all duration-500"
                  style={{ width: progress ? `${(progress.done / progress.total) * 100}%` : '20%' }}
                />
              </div>
              <p className="mt-2 text-xs text-iris-text-muted text-center animate-pulse">
                Running analysis across 5 feeds…
              </p>
            </div>
          )}

          {results.length === 0 && !running && (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-iris-text-muted">
              <Upload size={36} className="opacity-30" />
              <p className="text-sm">Results will appear here after analysis</p>
            </div>
          )}

          <div className="divide-y divide-iris-border/50 max-h-[600px] overflow-y-auto">
            {results.map((row, i) => (
              <div key={i} className="px-4 py-3 hover:bg-iris-elevated/30 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {row.status === 'ok'
                        ? <CheckCircle size={14} className="text-iris-success shrink-0" />
                        : <X size={14} className="text-iris-danger shrink-0" />}
                      <span className="font-mono text-sm text-iris-text truncate">{row.ioc}</span>
                      <span className="text-xs text-iris-text-muted">{row.type}</span>
                    </div>
                    {row.profile && (
                      <div className="mt-1 flex items-center gap-3 text-xs">
                        <span className={clsx('font-bold', scoreColor(row.profile.riskScore))}>
                          {row.profile.riskScore}/100
                        </span>
                        <span className="text-iris-text-dim">{row.profile.verdict}</span>
                        <span className="text-iris-text-muted">{row.profile.feeds.length} feeds</span>
                        {row.profile.cachedAt && <span className="text-iris-accent text-[10px]">cached</span>}
                      </div>
                    )}
                    {row.error && <p className="mt-1 text-xs text-iris-danger">{row.error}</p>}
                  </div>
                  {row.profile && (
                    <button
                      type="button"
                      onClick={() => navigate(`/dashboard?id=${row.profile!.queryId}`)}
                      className="iris-btn-secondary shrink-0 px-3 py-1.5 text-xs"
                    >
                      View
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

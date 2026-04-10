import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { FileText, Download, Eye, RefreshCw, CheckSquare, Square, AlertCircle } from 'lucide-react';
import * as api from '../services/api';
import type { QueryHistoryItem, ReportConfig, ThreatProfile } from '../types';

const REPORT_TYPES: { value: ReportConfig['type']; label: string; desc: string }[] = [
  { value: 'incident',  label: 'Incident Report',   desc: 'Full threat analysis for a single incident' },
  { value: 'summary',   label: 'Summary Report',     desc: 'High-level overview of multiple IoCs' },
  { value: 'watchlist', label: 'Watchlist Export',   desc: 'Structured list for SIEM ingestion' },
  { value: 'mitre',     label: 'MITRE ATT&CK Map',  desc: 'Technique mapping across all selected IoCs' },
];

const CLASSIFICATIONS: ReportConfig['classification'][] = ['TLP:WHITE', 'TLP:GREEN', 'TLP:AMBER', 'TLP:RED'];

const TLP_COLORS: Record<ReportConfig['classification'], string> = {
  'TLP:WHITE': 'text-white border-white/40 bg-white/10',
  'TLP:GREEN': 'text-green-400 border-green-400/40 bg-green-400/10',
  'TLP:AMBER': 'text-amber-400 border-amber-400/40 bg-amber-400/10',
  'TLP:RED':   'text-red-400 border-red-400/40 bg-red-400/10',
};

const DEFAULT_CONFIG: ReportConfig = {
  type: 'incident',
  selectedIoCs: [],
  sections: {
    executiveSummary: true,
    iocDetails: true,
    feedResults: true,
    mitreMapping: true,
    riskBreakdown: true,
    recommendations: false,
    rawJson: false,
  },
  title: 'Threat Intelligence Report',
  analyst: '',
  classification: 'TLP:WHITE',
  format: 'json',
};

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between cursor-pointer gap-3">
      <span className="text-sm text-iris-text-dim">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative inline-flex h-6 w-11 items-center rounded-full border transition-colors',
          checked ? 'border-iris-accent/40 bg-iris-accent/15' : 'border-iris-border bg-iris-elevated'
        )}
      >
        <span className={clsx(
          'absolute left-1 top-1 h-4 w-4 rounded-full transition-transform',
          checked ? 'translate-x-5 bg-iris-accent' : 'bg-iris-text-muted'
        )} />
      </button>
    </label>
  );
}

function buildReportJson(profiles: ThreatProfile[], config: ReportConfig): object {
  return {
    reportType: config.type,
    title: config.title,
    analyst: config.analyst,
    classification: config.classification,
    generatedAt: new Date().toISOString(),
    iocs: profiles.map(p => ({
      ioc: p.ioc,
      type: p.type,
      riskScore: p.riskScore,
      riskLevel: p.riskLevel,
      verdict: p.verdict,
      ...(config.sections.feedResults && { feeds: p.feeds }),
      ...(config.sections.mitreMapping && { mitreTechniques: p.mitreTechniques }),
      ...(config.sections.iocDetails && { geoLocation: p.geoLocation }),
    })),
  };
}

function buildReportCsv(profiles: ThreatProfile[], config: ReportConfig): string {
  const rows: string[][] = [];
  rows.push(['ioc', 'type', 'risk_score', 'risk_level', 'verdict',
    ...(config.sections.feedResults ? ['feeds_queried', 'feeds_success'] : []),
    ...(config.sections.mitreMapping ? ['mitre_techniques'] : []),
    ...(config.sections.iocDetails ? ['geo_country', 'geo_org'] : []),
  ]);
  for (const p of profiles) {
    rows.push([
      p.ioc, p.type, String(p.riskScore), p.riskLevel, p.verdict,
      ...(config.sections.feedResults ? [String(p.feeds.length), String(p.feeds.filter(f => f.status === 'success').length)] : []),
      ...(config.sections.mitreMapping ? [p.mitreTechniques.map(m => m.id).join('|')] : []),
      ...(config.sections.iocDetails ? [p.geoLocation?.country ?? '', p.geoLocation?.org ?? ''] : []),
    ]);
  }
  return rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
}

function buildReportHtml(profiles: ThreatProfile[], config: ReportConfig): string {
  const tlpColors: Record<string, string> = {
    'TLP:WHITE': '#ffffff', 'TLP:GREEN': '#22c55e', 'TLP:AMBER': '#f59e0b', 'TLP:RED': '#ef4444',
  };
  const tlpColor = tlpColors[config.classification] ?? '#ffffff';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${config.title}</title>
<style>
  body { font-family: 'Courier New', monospace; background: #fff; color: #111; margin: 0; padding: 32px; }
  h1 { font-size: 20px; border-bottom: 2px solid #111; padding-bottom: 8px; }
  .meta { color: #555; font-size: 12px; margin-bottom: 24px; }
  .tlp { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; color: ${tlpColor}; background: #111; }
  .ioc-block { border: 1px solid #ddd; border-radius: 6px; padding: 16px; margin-bottom: 16px; }
  .ioc-title { font-size: 15px; font-weight: bold; margin-bottom: 8px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-left: 8px; }
  .critical { background: #fee2e2; color: #991b1b; }
  .high { background: #fee2e2; color: #991b1b; }
  .medium { background: #fef3c7; color: #92400e; }
  .low { background: #d1fae5; color: #065f46; }
  .clean { background: #d1fae5; color: #065f46; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
  th { background: #f3f4f6; text-align: left; padding: 6px 8px; border: 1px solid #e5e7eb; }
  td { padding: 5px 8px; border: 1px solid #e5e7eb; }
  .mitre-tag { display: inline-block; background: #eff6ff; color: #1d4ed8; padding: 2px 6px; border-radius: 3px; font-size: 11px; margin: 2px; }
  @media print { body { padding: 16px; } }
</style></head><body>
<h1>${config.title}</h1>
<div class="meta">
  <span class="tlp">${config.classification}</span>
  &nbsp;Generated: ${new Date().toLocaleString()}
  ${config.analyst ? ` &nbsp;Analyst: ${config.analyst}` : ''}
</div>
${profiles.map(p => `
<div class="ioc-block">
  <div class="ioc-title">
    ${p.ioc}
    <span class="badge ${p.riskLevel.toLowerCase()}">${p.riskLevel}</span>
    <span style="font-weight:normal;font-size:13px;color:#555;"> · ${p.type.toUpperCase()} · Score: ${p.riskScore}/100 · ${p.verdict}</span>
  </div>
  ${config.sections.iocDetails && p.geoLocation ? `<p style="font-size:12px;color:#555;">Location: ${[p.geoLocation.country, p.geoLocation.org, p.geoLocation.asn].filter(Boolean).join(' · ')}</p>` : ''}
  ${config.sections.feedResults && p.feeds.length > 0 ? `
  <table><tr><th>Feed</th><th>Status</th><th>Confidence</th><th>Latency</th></tr>
  ${p.feeds.map(f => `<tr><td>${f.feedName}</td><td>${f.status}</td><td>${f.confidenceScore ?? '—'}</td><td>${f.latencyMs}ms</td></tr>`).join('')}
  </table>` : ''}
  ${config.sections.mitreMapping && p.mitreTechniques.length > 0 ? `
  <div style="margin-top:8px">
    ${p.mitreTechniques.map(m => `<span class="mitre-tag">${m.id} ${m.name}</span>`).join('')}
  </div>` : ''}
</div>`).join('')}
</body></html>`;
}

export default function ReportPage() {
  const [config, setConfig] = useState<ReportConfig>(DEFAULT_CONFIG);
  const [history, setHistory] = useState<QueryHistoryItem[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ThreatProfile>>(new Map());
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    api.getHistory(1, 50)
      .then(r => setHistory([...r.items]))
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, []);

  const fetchProfile = useCallback(async (id: string) => {
    if (profiles.has(id)) return;
    try {
      const p = await api.getQueryById(id);
      setProfiles(prev => new Map(prev).set(id, p));
    } catch { /* skip */ }
  }, [profiles]);

  function toggleIoC(id: string) {
    const sel = config.selectedIoCs;
    const next = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id];
    setConfig(c => ({ ...c, selectedIoCs: next }));
    if (!sel.includes(id)) void fetchProfile(id);
  }

  function toggleSection(key: keyof ReportConfig['sections']) {
    setConfig(c => ({ ...c, sections: { ...c.sections, [key]: !c.sections[key] } }));
  }

  const selectedProfiles = config.selectedIoCs
    .map(id => profiles.get(id))
    .filter((p): p is ThreatProfile => p !== undefined);

  async function generate() {
    if (config.selectedIoCs.length === 0) {
      setError('Select at least one IoC to generate a report.');
      return;
    }
    setGenerating(true);
    setError(null);
    setSuccess(null);

    // Fetch any missing profiles
    await Promise.allSettled(config.selectedIoCs.map(id => fetchProfile(id)));

    const profs = config.selectedIoCs
      .map(id => profiles.get(id))
      .filter((p): p is ThreatProfile => p !== undefined);

    if (profs.length === 0) {
      setError('Could not load profile data for selected IoCs. Try again.');
      setGenerating(false);
      return;
    }

    try {
      if (config.format === 'json') {
        const data = buildReportJson(profs, config);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        download(blob, `iris-report-${Date.now()}.json`);
        setSuccess('JSON report downloaded.');
      } else if (config.format === 'csv') {
        const csv = buildReportCsv(profs, config);
        const blob = new Blob([csv], { type: 'text/csv' });
        download(blob, `iris-report-${Date.now()}.csv`);
        setSuccess('CSV report downloaded.');
      } else if (config.format === 'pdf') {
        const html = buildReportHtml(profs, config);
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
          setSuccess('Report opened in new tab — use browser Print → Save as PDF.');
        } else {
          setError('Popup blocked. Allow popups for this site and try again.');
        }
      }
    } catch {
      setError('Failed to generate report.');
    } finally {
      setGenerating(false);
    }
  }

  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const previewProfiles = selectedProfiles.slice(0, 3);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Left column — config */}
      <div className="space-y-4 lg:col-span-1">
        {/* Report type */}
        <div className="iris-card p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-iris-text-muted">Report Type</h2>
          {REPORT_TYPES.map(rt => (
            <label key={rt.value} className="flex items-start gap-3 cursor-pointer">
              <div className="mt-0.5">
                {config.type === rt.value
                  ? <CheckSquare size={16} className="text-iris-accent" />
                  : <Square size={16} className="text-iris-text-muted" />}
              </div>
              <div>
                <input type="radio" className="sr-only" checked={config.type === rt.value} onChange={() => setConfig(c => ({ ...c, type: rt.value }))} />
                <p className="text-sm font-medium text-iris-text">{rt.label}</p>
                <p className="text-xs text-iris-text-muted">{rt.desc}</p>
              </div>
            </label>
          ))}
        </div>

        {/* IoC selector */}
        <div className="iris-card p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-iris-text-muted">Select IoCs</h2>
          {loadingHistory ? (
            <p className="text-sm text-iris-text-dim">Loading history…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-iris-text-muted italic">No queries yet. Analyze some IoCs first.</p>
          ) : (
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {history.map(item => (
                <label key={item.id} className="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded hover:bg-iris-elevated/40 transition-colors">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={config.selectedIoCs.includes(item.id)}
                    onChange={() => toggleIoC(item.id)}
                  />
                  {config.selectedIoCs.includes(item.id)
                    ? <CheckSquare size={14} className="text-iris-accent shrink-0" />
                    : <Square size={14} className="text-iris-text-muted shrink-0" />}
                  <span className="font-mono text-xs text-iris-text truncate">{item.iocValue}</span>
                  <span className="text-[10px] text-iris-text-muted shrink-0">{item.iocType}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Sections */}
        <div className="iris-card p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-iris-text-muted">Sections</h2>
          {(Object.keys(DEFAULT_CONFIG.sections) as Array<keyof ReportConfig['sections']>).map(key => (
            <Toggle
              key={key}
              checked={config.sections[key]}
              onChange={() => toggleSection(key)}
              label={key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
            />
          ))}
        </div>

        {/* Details */}
        <div className="iris-card p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-iris-text-muted">Details</h2>
          <div>
            <label className="text-xs text-iris-text-muted block mb-1">Report Title</label>
            <input
              className="iris-input text-sm"
              value={config.title}
              onChange={e => setConfig(c => ({ ...c, title: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-iris-text-muted block mb-1">Analyst Name</label>
            <input
              className="iris-input text-sm"
              placeholder="Optional"
              value={config.analyst}
              onChange={e => setConfig(c => ({ ...c, analyst: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-iris-text-muted block mb-1">Classification</label>
            <div className="flex flex-wrap gap-2">
              {CLASSIFICATIONS.map(cls => (
                <button
                  key={cls}
                  type="button"
                  onClick={() => setConfig(c => ({ ...c, classification: cls }))}
                  className={clsx(
                    'text-xs px-2 py-1 rounded border font-mono font-semibold transition-colors',
                    config.classification === cls ? TLP_COLORS[cls] : 'border-iris-border text-iris-text-muted'
                  )}
                >
                  {cls}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Export format */}
        <div className="iris-card p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-iris-text-muted">Export Format</h2>
          <div className="grid grid-cols-3 gap-2">
            {(['json', 'csv', 'pdf'] as const).map(fmt => (
              <button
                key={fmt}
                type="button"
                onClick={() => setConfig(c => ({ ...c, format: fmt }))}
                className={clsx(
                  'py-2 text-sm font-semibold rounded-lg border transition-colors uppercase',
                  config.format === fmt
                    ? 'border-iris-accent/50 bg-iris-accent/10 text-iris-accent'
                    : 'border-iris-border text-iris-text-dim hover:text-iris-text'
                )}
              >
                {fmt}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-iris-danger/40 bg-iris-danger/10 px-4 py-3 text-sm text-iris-danger flex items-center gap-2">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-iris-success/40 bg-iris-success/10 px-4 py-3 text-sm text-iris-success">
            {success}
          </div>
        )}

        <button
          type="button"
          onClick={() => void generate()}
          disabled={generating || config.selectedIoCs.length === 0}
          className="iris-btn-primary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating
            ? <><RefreshCw size={16} className="animate-spin" /> Generating…</>
            : <><Download size={16} /> Generate Report</>}
        </button>
      </div>

      {/* Right column — preview */}
      <div className="lg:col-span-2">
        <div className="iris-card overflow-hidden h-full min-h-[600px]">
          <div className="flex items-center gap-2 border-b border-iris-border px-4 py-3">
            <Eye size={16} className="text-iris-accent" />
            <span className="text-xs font-semibold uppercase tracking-wider text-iris-text-muted">Live Preview</span>
            {config.selectedIoCs.length > 0 && (
              <span className="ml-auto text-xs text-iris-text-muted">{config.selectedIoCs.length} IoC{config.selectedIoCs.length > 1 ? 's' : ''} selected</span>
            )}
          </div>

          {selectedProfiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-24 gap-3 text-iris-text-muted">
              <FileText size={40} className="opacity-30" />
              <p className="text-sm">Select IoCs from the left to preview the report</p>
            </div>
          ) : (
            <div className="p-6 space-y-4 font-mono text-sm">
              {/* Report header */}
              <div className="border-b border-iris-border pb-4">
                <div className="flex items-start justify-between">
                  <h2 className="text-base font-bold text-iris-text">{config.title || 'Untitled Report'}</h2>
                  <span className={clsx('text-xs px-2 py-0.5 rounded border font-semibold', TLP_COLORS[config.classification])}>
                    {config.classification}
                  </span>
                </div>
                <p className="text-xs text-iris-text-muted mt-1">
                  {new Date().toLocaleString()}
                  {config.analyst ? ` · Analyst: ${config.analyst}` : ''}
                  {' '}· {config.type.toUpperCase()} · {config.format.toUpperCase()}
                </p>
              </div>

              {/* IoC entries */}
              {previewProfiles.map(p => (
                <div key={p.queryId} className="border border-iris-border rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-iris-accent font-bold">{p.ioc}</span>
                    <span className="text-iris-text-muted text-xs">{p.type.toUpperCase()}</span>
                    <span className={clsx('iris-badge text-xs', {
                      'bg-iris-danger/20 text-iris-danger border border-iris-danger/30': p.riskLevel === 'CRITICAL' || p.riskLevel === 'HIGH',
                      'bg-iris-warning/20 text-iris-warning border border-iris-warning/30': p.riskLevel === 'MEDIUM',
                      'bg-iris-success/20 text-iris-success border border-iris-success/30': p.riskLevel === 'LOW' || p.riskLevel === 'NONE',
                      'bg-iris-border text-iris-text-muted border border-iris-border-light': p.riskLevel === 'UNKNOWN',
                    })}>
                      {p.riskLevel} · {p.riskScore}/100
                    </span>
                    <span className="text-iris-text-dim text-xs">{p.verdict}</span>
                  </div>

                  {config.sections.iocDetails && p.geoLocation && (
                    <p className="text-xs text-iris-text-muted">
                      {[p.geoLocation.country, p.geoLocation.org, p.geoLocation.asn].filter(Boolean).join(' · ')}
                    </p>
                  )}

                  {config.sections.feedResults && p.feeds.length > 0 && (
                    <div className="text-xs space-y-1">
                      {p.feeds.slice(0, 4).map(f => (
                        <div key={f.feedName} className="flex items-center gap-2">
                          <span className={clsx('h-1.5 w-1.5 rounded-full shrink-0', f.status === 'success' ? 'bg-iris-success' : f.status === 'failed' ? 'bg-iris-danger' : 'bg-iris-text-muted')} />
                          <span className="text-iris-text-dim w-24 shrink-0">{f.feedName}</span>
                          <span className="text-iris-text-muted">{f.status} · {f.latencyMs}ms</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {config.sections.mitreMapping && p.mitreTechniques.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {p.mitreTechniques.map(m => (
                        <span key={m.id} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300">
                          {m.id}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {selectedProfiles.length > 3 && (
                <p className="text-xs text-iris-text-muted text-center italic">
                  + {selectedProfiles.length - 3} more IoC{selectedProfiles.length - 3 > 1 ? 's' : ''} in full report
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

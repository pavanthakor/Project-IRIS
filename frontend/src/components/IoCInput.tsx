import { useState, useCallback } from 'react';
import type { IoCType } from '../types';

interface Props {
  onSubmit: (ioc: string, type: IoCType) => void;
  loading: boolean;
  disabled?: boolean;
}

const PATTERNS: Record<IoCType, RegExp> = {
  ip:     /^(\d{1,3}\.){3}\d{1,3}$|^([0-9a-fA-F:]+)$/,
  domain: /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/,
  hash:   /^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$/,
  email:  /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
};

const TYPE_LABELS: Record<IoCType, string> = {
  ip:     'IP Address',
  domain: 'Domain',
  hash:   'File Hash',
  email:  'Email',
};

const EXAMPLES: { label: string; type: IoCType }[] = [
  { label: '8.8.8.8',                               type: 'ip' },
  { label: 'example.com',                           type: 'domain' },
  { label: '44d88612fea8a8f36de82e1278abb02f',      type: 'hash' },
  { label: 'test@mailinator.com',                   type: 'email' },
];

function detectType(value: string): IoCType {
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value))  return 'ip';
  if (/@/.test(value))                          return 'email';
  if (/^[a-fA-F0-9]{32,64}$/.test(value))      return 'hash';
  return 'domain';
}

function SearchIcon() {
  return (
    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

export function IoCInput({ onSubmit, loading, disabled }: Props) {
  const [value, setValue] = useState('');
  const [type, setType] = useState<IoCType>('ip');
  const [manualType, setManualType] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);

  const trimmed = value.trim();
  const isValid = trimmed.length > 0 && PATTERNS[type].test(trimmed);
  const showError = trimmed.length > 2 && !isValid;
  const showSuccess = trimmed.length > 0 && isValid;

  const handleChange = useCallback((v: string) => {
    setValue(v);
    if (!manualType) {
      const detected = detectType(v.trim());
      setType(detected);
      setAutoDetected(v.trim().length > 0);
    }
  }, [manualType]);

  const handleTypeClick = (t: IoCType) => {
    setType(t);
    setManualType(true);
    setAutoDetected(false);
  };

  const handleSubmit = () => {
    if (isValid && !loading && !disabled) onSubmit(trimmed, type);
  };

  const inputRing = !trimmed
    ? 'border-slate-600 focus:ring-blue-500 focus:border-blue-500'
    : showSuccess
      ? 'border-emerald-500 ring-2 ring-emerald-500/30'
      : 'border-red-500 ring-2 ring-red-500/30';

  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-lg">
      {/* Type pills */}
      <div className="flex gap-2 mb-5">
        {(['ip', 'domain', 'hash', 'email'] as IoCType[]).map(t => (
          <button
            key={t}
            onClick={() => handleTypeClick(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              type === t
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-200'
            } ${type === t && autoDetected ? 'ring-2 ring-blue-400/40 animate-pulse' : ''}`}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Input + button row */}
      <div className="flex gap-3 mb-3">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <SearchIcon />
          </span>
          <input
            type="text"
            value={value}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder={`Enter ${TYPE_LABELS[type].toLowerCase()}, e.g. ${EXAMPLES.find(e => e.type === type)?.label}`}
            disabled={loading || disabled}
            maxLength={2048}
            className={`w-full pl-10 pr-4 py-3 bg-slate-900 border rounded-lg text-base font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 disabled:opacity-50 transition-all ${inputRing}`}
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!isValid || loading || disabled}
          className="shrink-0 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Analyzing...
            </>
          ) : (
            'Analyze Threat'
          )}
        </button>
      </div>

      {/* Validation message */}
      {showError && (
        <p className="text-sm text-red-400 mb-3">
          Invalid {TYPE_LABELS[type].toLowerCase()} format.{' '}
          {type === 'ip' && 'Expected format: 8.8.8.8'}
          {type === 'domain' && 'Expected format: example.com'}
          {type === 'hash' && 'Expected: 32 (MD5), 40 (SHA1), or 64 (SHA256) hex chars'}
          {type === 'email' && 'Expected format: user@domain.com'}
        </p>
      )}
      {showSuccess && !loading && (
        <p className="text-sm text-emerald-400 mb-3">
          ✓ Valid {TYPE_LABELS[type].toLowerCase()} — ready to analyze
        </p>
      )}

      {/* Quick examples */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-600 font-medium">Quick:</span>
        {EXAMPLES.map(ex => (
          <button
            key={ex.label}
            onClick={() => {
              setValue(ex.label);
              setType(ex.type);
              setManualType(true);
              setAutoDetected(false);
            }}
            disabled={loading}
            className="text-xs font-mono bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-slate-200 px-3 py-1 rounded-full transition-colors disabled:opacity-50 max-w-[140px] truncate"
          >
            {ex.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default IoCInput;

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { AtSign, Globe2, Hash, Network, ArrowUpRight } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { IoCType } from '../../types';
import { IOC_PATTERNS } from '../../utils/constants';

type IoCPill = {
  value: IoCType;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

const IOC_PILLS: readonly IoCPill[] = [
  { value: 'ip', label: 'IP', icon: Network },
  { value: 'domain', label: 'Domain', icon: Globe2 },
  { value: 'hash', label: 'Hash', icon: Hash },
  { value: 'email', label: 'Email', icon: AtSign },
];

function isIoCType(value: string | null): value is IoCType {
  return value === 'ip' || value === 'domain' || value === 'hash' || value === 'email';
}

function inferIocType(rawValue: string): IoCType | null {
  const value = rawValue.trim();
  if (!value) return null;

  const entries = Object.entries(IOC_PATTERNS) as Array<[IoCType, RegExp]>;
  for (const [type, pattern] of entries) {
    if (pattern.test(value)) return type;
  }
  return null;
}

interface IoCSearchBarProps {
  className?: string;
}

export default function IoCSearchBar({ className }: IoCSearchBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [selectedType, setSelectedType] = useState<IoCType>('ip');
  const [iocValue, setIocValue] = useState('');

  useEffect(() => {
    if (location.pathname !== '/dashboard') return;
    const paramIoc = searchParams.get('ioc') ?? '';
    const paramType = searchParams.get('type');
    setIocValue(paramIoc);
    if (isIoCType(paramType)) setSelectedType(paramType);
  }, [location.pathname, searchParams]);

  const inferredType = useMemo(() => inferIocType(iocValue), [iocValue]);
  const effectiveType = inferredType ?? selectedType;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = iocValue.trim();
    if (!normalized) return;

    const params = new URLSearchParams({
      ioc: normalized,
      type: effectiveType,
    });

    navigate({ pathname: '/dashboard', search: params.toString() });
  };

  return (
    <form onSubmit={handleSubmit} className={clsx('w-full', className)}>
      <div className="flex h-10 w-full items-center gap-2 rounded-lg border border-iris-border bg-iris-bg/60 px-2">
        <div className="hidden items-center gap-1 md:flex">
          {IOC_PILLS.map((pill) => {
            const PillIcon = pill.icon;
            const active = selectedType === pill.value;
            return (
              <button
                key={pill.value}
                type="button"
                onClick={() => setSelectedType(pill.value)}
                className={clsx(
                  'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors',
                  active
                    ? 'border-iris-accent/50 bg-iris-accent/15 text-iris-accent'
                    : 'border-iris-border bg-iris-surface text-iris-text-dim hover:text-iris-text'
                )}
              >
                <PillIcon size={12} />
                {pill.label}
              </button>
            );
          })}
        </div>

        <input
          value={iocValue}
          onChange={(event) => setIocValue(event.target.value)}
          placeholder="Enter IP, domain, hash, or email"
          className="h-8 w-full bg-transparent px-2 text-sm text-iris-text outline-none placeholder:text-iris-text-muted"
          aria-label="Indicator input"
        />

        <button
          type="submit"
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-iris-accent px-3 text-xs font-semibold text-iris-bg transition-colors hover:bg-iris-accent-dim"
          title="Analyze indicator"
        >
          Analyze <ArrowUpRight size={13} />
        </button>
      </div>
    </form>
  );
}

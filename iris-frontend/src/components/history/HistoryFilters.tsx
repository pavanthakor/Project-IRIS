import clsx from 'clsx';
import type { IoCType } from '../../types';

export type HistoryRiskPill = 'high' | 'medium' | 'clean';

interface HistoryFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;

  selectedTypes: readonly IoCType[];
  onToggleType: (type: IoCType) => void;
  onClearTypes: () => void;

  selectedRisks: readonly HistoryRiskPill[];
  onToggleRisk: (risk: HistoryRiskPill) => void;

  disabled?: boolean;
}

function pillBase(active: boolean): string {
  return clsx(
    'inline-flex items-center rounded-md border px-3 py-2 text-xs font-semibold transition-colors',
    active
      ? 'border-iris-accent/50 bg-iris-accent/15 text-iris-accent'
      : 'border-iris-border bg-iris-surface text-iris-text-dim hover:text-iris-text'
  );
}

function riskPillClasses(risk: HistoryRiskPill, active: boolean): string {
  if (!active) return pillBase(false);
  switch (risk) {
    case 'high':
      return 'inline-flex items-center rounded-md border border-iris-danger/40 bg-iris-danger/10 px-3 py-2 text-xs font-semibold text-iris-danger transition-colors';
    case 'medium':
      return 'inline-flex items-center rounded-md border border-iris-warning/40 bg-iris-warning/10 px-3 py-2 text-xs font-semibold text-iris-warning transition-colors';
    case 'clean':
    default:
      return 'inline-flex items-center rounded-md border border-iris-success/40 bg-iris-success/10 px-3 py-2 text-xs font-semibold text-iris-success transition-colors';
  }
}

function isSelected<T extends string>(arr: readonly T[], value: T): boolean {
  return arr.includes(value);
}

export default function HistoryFilters({
  search,
  onSearchChange,
  selectedTypes,
  onToggleType,
  onClearTypes,
  selectedRisks,
  onToggleRisk,
  disabled = false,
}: HistoryFiltersProps) {
  const allTypesActive = selectedTypes.length === 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Filter by IoC value..."
        className="iris-input h-10 max-w-[320px] px-3 py-2 text-sm"
        disabled={disabled}
        aria-label="Filter history by indicator value"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onClearTypes} className={pillBase(allTypesActive)} disabled={disabled}>
          All
        </button>
        {(['ip', 'domain', 'hash', 'email'] as const).map((type) => {
          const active = isSelected(selectedTypes, type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => onToggleType(type)}
              className={pillBase(active)}
              disabled={disabled}
            >
              {type === 'ip' ? 'IP' : type.toUpperCase()}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onToggleRisk('high')}
          className={riskPillClasses('high', isSelected(selectedRisks, 'high'))}
          disabled={disabled}
        >
          High risk
        </button>
        <button
          type="button"
          onClick={() => onToggleRisk('medium')}
          className={riskPillClasses('medium', isSelected(selectedRisks, 'medium'))}
          disabled={disabled}
        >
          Medium
        </button>
        <button
          type="button"
          onClick={() => onToggleRisk('clean')}
          className={riskPillClasses('clean', isSelected(selectedRisks, 'clean'))}
          disabled={disabled}
        >
          Clean
        </button>
      </div>
    </div>
  );
}

import type { MitreTechnique } from '../../types';

interface MitreTechniqueCardProps {
  technique: MitreTechnique;
}

function tacticBorderClass(tactic: string): string {
  const normalized = tactic.toLowerCase();
  if (normalized.includes('recon')) return 'border-l-iris-info';
  if (normalized.includes('initial')) return 'border-l-iris-warning';
  if (normalized.includes('command') || normalized.includes('control')) return 'border-l-iris-danger';
  if (normalized.includes('execution')) return 'border-l-orange-400';
  if (normalized.includes('impact')) return 'border-l-rose-400';
  return 'border-l-iris-accent';
}

function techniqueUrl(id: string): string {
  const normalized = id.trim().toUpperCase();
  if (!normalized.startsWith('T')) return 'https://attack.mitre.org/';

  if (normalized.includes('.')) {
    const [base, sub] = normalized.split('.');
    if (base && sub) return `https://attack.mitre.org/techniques/${base}/${sub}/`;
  }

  return `https://attack.mitre.org/techniques/${normalized}/`;
}

export default function MitreTechniqueCard({ technique }: MitreTechniqueCardProps) {
  return (
    <a
      href={techniqueUrl(technique.id)}
      target="_blank"
      rel="noopener noreferrer"
      className={`iris-card-elevated mb-2 block border-l-4 px-3 py-2 transition-colors hover:border-iris-accent ${tacticBorderClass(technique.tactic)}`}
    >
      <p className="text-sm text-iris-text">
        <span className="mr-2 font-mono font-bold text-iris-accent">{technique.id}</span>
        <span>{technique.name}</span>
      </p>
      <p className="mt-1 text-xs text-iris-text-muted">{technique.tactic}</p>
    </a>
  );
}

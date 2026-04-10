import { ExternalLink } from 'lucide-react';
import type { MitreTechnique } from '../../types';
import MitreTechniqueCard from './MitreTechniqueCard';

interface MitreAttackPanelProps {
  techniques: readonly MitreTechnique[];
}

export default function MitreAttackPanel({ techniques }: MitreAttackPanelProps) {
  return (
    <section className="iris-card p-4">
      <header className="mb-3 flex items-center justify-between">
        <a
          href="https://attack.mitre.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-semibold text-iris-text hover:text-iris-accent"
        >
          MITRE ATT&CK mapping <ExternalLink size={14} />
        </a>
      </header>

      <div>
        {techniques.length === 0 ? (
          <p className="rounded-lg border border-iris-border bg-iris-elevated/30 px-3 py-4 text-sm text-iris-text-muted">
            No mapped ATT&CK techniques for this indicator.
          </p>
        ) : (
          techniques.map((technique) => (
            <MitreTechniqueCard key={`${technique.id}-${technique.tactic}`} technique={technique} />
          ))
        )}
      </div>
    </section>
  );
}

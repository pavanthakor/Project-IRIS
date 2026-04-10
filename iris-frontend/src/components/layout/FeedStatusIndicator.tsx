import { Link } from 'react-router-dom';
import type { FeedHealth } from '../../types';

interface FeedStatusIndicatorProps {
  name: string;
  status: FeedHealth;
}

const statusColors: Record<FeedHealth, string> = {
  healthy: 'bg-green-500',
  disabled: 'bg-yellow-500',
  circuit_open: 'bg-red-500',
};

export default function FeedStatusIndicator({ name, status }: FeedStatusIndicatorProps) {
  return (
    <Link
      to={`/feeds#${name}`}
      className="flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-md text-iris-text-dim hover:bg-iris-surface hover:text-iris-text transition-colors"
    >
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${statusColors[status]}`}
          title={`Status: ${status.replace('_', ' ')}`}
        ></span>
        <span>{name}</span>
      </div>
    </Link>
  );
}
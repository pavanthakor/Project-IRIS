import { Link } from 'react-router-dom';
import { Eye, Menu, Bell } from 'lucide-react';
import IoCSearchBar from '../dashboard/IoCSearchBar';
import { useAuth } from '../../hooks/useAuth';

interface TopBarProps {
  toggleSidebar: () => void;
}

export default function TopBar({ toggleSidebar }: TopBarProps) {
  const { user } = useAuth();

  return (
    <header className="flex-shrink-0 h-14 px-4 flex items-center justify-between bg-iris-surface border-b border-iris-border z-40">
      <div className="flex items-center gap-4">
        <button
          onClick={toggleSidebar}
          className="lg:hidden text-iris-text-muted hover:text-iris-text"
          aria-label="Toggle sidebar"
        >
          <Menu size={20} />
        </button>
        <Link to="/dashboard" className="flex items-center gap-2">
          <Eye className="text-iris-accent" size={24} />
          <span className="hidden sm:inline font-mono text-xl font-bold tracking-widest text-iris-text">
            IRIS
          </span>
        </Link>
      </div>

      <div className="mx-2 max-w-3xl flex-1 sm:mx-4">
        <IoCSearchBar />
      </div>

      <div className="flex items-center gap-4">
        <button title="Notifications" className="text-iris-text-muted hover:text-iris-text">
          <Bell size={20} />
        </button>
        <div className="text-right">
          <p className="text-sm font-medium text-iris-text truncate">{user?.email}</p>
          <span className="text-xs font-semibold uppercase text-iris-accent">
            {user?.tier || 'Free'}
          </span>
        </div>
      </div>
    </header>
  );
}
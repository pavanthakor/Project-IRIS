import {
  LayoutDashboard,
  History,
  Shield,
  FileText,
  Upload,
  Settings,
  LogOut,
  Eye,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import NavLink from './NavLink';
import { useEffect, useState } from 'react';
import * as api from '../../services/api';
import type { FeedHealth } from '../../types';
import FeedStatusIndicator from './FeedStatusIndicator';

interface SidebarProps {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
}

interface FeedHealthItem {
  name: string;
  status: FeedHealth;
}

const SidebarHeader = ({ children }: { children: React.ReactNode }) => (
  <h3 className="px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-iris-text-muted">
    {children}
  </h3>
);

export default function Sidebar({ isSidebarOpen, toggleSidebar }: SidebarProps) {
  const { user, logout } = useAuth();
  const [feedHealth, setFeedHealth] = useState<FeedHealthItem[]>([]);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const health = await api.getHealth();
        const feeds = Object.entries(health.feeds).map(([name, status]) => ({
          name,
          status,
        }));
        setFeedHealth(feeds);
      } catch (error) {
        console.error('Failed to fetch feed health', error);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <nav className="flex-1 px-2 py-4 space-y-1">
        <SidebarHeader>Overview</SidebarHeader>
        <NavLink to="/dashboard" icon={<LayoutDashboard size={18} />}>
          Dashboard
        </NavLink>
        <NavLink to="/history" icon={<History size={18} />}>
          History
        </NavLink>

        <SidebarHeader>Feed Health</SidebarHeader>
        {feedHealth.map((feed) => (
          <FeedStatusIndicator key={feed.name} name={feed.name} status={feed.status} />
        ))}

        <SidebarHeader>Tools</SidebarHeader>
        <NavLink to="/mitre" icon={<Shield size={18} />}>
          ATT&CK Navigator
        </NavLink>
        <NavLink to="/reports" icon={<FileText size={18} />}>
          Reports
        </NavLink>
        <NavLink to="/bulk" icon={<Upload size={18} />}>
          Bulk Upload
        </NavLink>
        <NavLink to="/settings" icon={<Settings size={18} />}>
          Settings
        </NavLink>
      </nav>

      <div className="px-4 py-4 border-t border-iris-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-iris-accent/20 flex items-center justify-center">
            <Eye size={18} className="text-iris-accent" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium text-iris-text truncate">{user?.email}</p>
            <span className="text-xs font-semibold uppercase text-iris-accent">
              {user?.tier || 'Free'}
            </span>
          </div>
          <button onClick={logout} title="Logout" className="text-iris-text-muted hover:text-iris-text">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Overlay for mobile */}
      <div
        className={`fixed inset-0 bg-black/60 z-40 lg:hidden ${
          isSidebarOpen ? 'block' : 'hidden'
        }`}
        onClick={toggleSidebar}
      ></div>

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-56 bg-iris-bg border-r border-iris-border z-50 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
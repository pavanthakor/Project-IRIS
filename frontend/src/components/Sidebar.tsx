import { NavLink, useLocation } from 'react-router-dom';
import { Shield, LayoutDashboard, History, Rss, FileText, LogOut, Settings } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import clsx from 'clsx';

const navLinks = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/history', label: 'History', icon: History },
    { href: '/feeds', label: 'Live Feeds', icon: Rss },
    { href: '/reports', label: 'Reports', icon: FileText },
];

const NavItem = ({ href, label, icon: Icon }) => {
    const location = useLocation();
    const isActive = location.pathname === href;
    return (
        <NavLink
            to={href}
            className={clsx(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                    ? "bg-iris-500/10 text-iris-300"
                    : "text-slate-400 hover:bg-slate-700/50 hover:text-slate-200"
            )}
        >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
        </NavLink>
    );
};

const Sidebar = () => {
    const { user, logout } = useAuth();

    return (
        <aside className="flex h-screen w-64 flex-col border-r border-slate-800 bg-slate-900/80">
            <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-6">
                <Shield className="h-7 w-7 text-iris-400" />
                <span className="text-xl font-bold tracking-wider text-slate-100">IRIS</span>
            </div>
            <nav className="flex-1 space-y-2 p-4">
                {navLinks.map(link => <NavItem key={link.href} {...link} />)}
            </nav>
            <div className="border-t border-slate-800 p-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700">
                        <span className="text-sm font-bold">{user?.email?.[0].toUpperCase()}</span>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-200">{user?.email}</p>
                        <p className="text-xs text-slate-400 capitalize">{user?.tier} Tier</p>
                    </div>
                </div>
                <div className="mt-4 space-y-2">
                    <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-700/50 hover:text-slate-200">
                        <Settings className="h-5 w-5" />
                        <span>Settings</span>
                    </button>
                    <button
                        onClick={logout}
                        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    >
                        <LogOut className="h-5 w-5" />
                        <span>Logout</span>
                    </button>
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;

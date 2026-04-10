import { NavLink as RouterNavLink } from 'react-router-dom';

interface NavLinkProps {
  to: string;
  children: React.ReactNode;
  icon: React.ReactNode;
}

export default function NavLink({ to, children, icon }: NavLinkProps) {
  return (
    <RouterNavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
          isActive
            ? 'text-iris-accent bg-iris-accent/10'
            : 'text-iris-text-dim hover:bg-iris-surface hover:text-iris-text'
        }`
      }
    >
      {icon}
      <span>{children}</span>
    </RouterNavLink>
  );
}
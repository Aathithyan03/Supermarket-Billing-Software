import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ScanLine, Package, Users, Boxes,
  Receipt, BarChart3, Settings as SettingsIcon, LogOut, ShieldCheck, Menu, X,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/pos', label: 'Billing / POS', icon: ScanLine },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/billing-history', label: 'Billing History', icon: Receipt },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
];

const ADMIN_ITEMS = [
  { to: '/users', label: 'Staff Accounts', icon: ShieldCheck },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export default function AppLayout() {
  const { user, logout, isAdmin } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-primary-800 text-white' : 'text-primary-900 hover:bg-primary-50'
    }`;

  const SidebarContent = () => (
    <>
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-primary-800 flex items-center justify-center text-white font-display font-bold text-lg">
            S
          </div>
          <div>
            <p className="font-display font-semibold text-primary-900 leading-tight truncate max-w-[160px]">
              {settings.store_name}
            </p>
            <p className="text-xs text-sage-500">Billing System</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass} onClick={() => setMobileOpen(false)}>
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <div className="pt-4 pb-1 px-4 text-xs font-semibold uppercase tracking-wide text-sage-500">
              Administration
            </div>
            {ADMIN_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClass} onClick={() => setMobileOpen(false)}>
                <item.icon size={18} />
                {item.label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="px-3 pb-5 pt-3 border-t border-sage-100">
        <div className="px-4 py-2 mb-1">
          <p className="text-sm font-medium text-primary-900 truncate">{user?.full_name}</p>
          <p className="text-xs text-sage-500 capitalize">{user?.role}</p>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 w-full transition-colors">
          <LogOut size={18} />
          Log out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-paper">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 bg-white border-r border-sage-100 fixed inset-y-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white flex flex-col">
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 md:ml-64 flex flex-col min-h-screen">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-sage-100 sticky top-0 z-30">
          <button onClick={() => setMobileOpen(true)} className="p-2 -ml-2" aria-label="Open menu">
            <Menu size={22} className="text-primary-900" />
          </button>
          <p className="font-display font-semibold text-primary-900">{settings.store_name}</p>
          <div className="w-9" />
        </header>

        <main className="flex-1 p-4 md:p-8 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

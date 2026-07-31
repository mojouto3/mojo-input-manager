import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard,
  Gamepad2,
  SlidersHorizontal,
  ShieldCheck,
  Settings,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'virtual-devices', label: 'Virtual Devices', icon: Gamepad2 },
  { id: 'mapping', label: 'Mapping', icon: SlidersHorizontal },
  { id: 'device-filtering', label: 'Device Filtering', icon: ShieldCheck }
];

function NavButton({ isActive, icon: Icon, label, collapsed, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-left transition-colors ${
        collapsed ? 'justify-center' : ''
      }`}
    >
      {isActive && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-lg bg-mim-green/10 border border-mim-green/30"
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
        />
      )}
      <Icon size={18} className={`relative z-10 shrink-0 ${isActive ? 'text-mim-green' : 'text-mim-muted'}`} />
      <AnimatePresence>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={`relative z-10 whitespace-nowrap ${isActive ? 'text-white font-medium' : 'text-mim-muted'}`}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

export default function Sidebar({ activeView, onNavigate }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      className="flex h-full shrink-0 flex-col overflow-hidden border-r border-mim-border bg-mim-surface/80 backdrop-blur-sm"
    >
      <nav className="flex flex-1 flex-col gap-1 px-3 pt-4">
        {NAV_ITEMS.map((item) => (
          <NavButton
            key={item.id}
            isActive={activeView === item.id}
            icon={item.icon}
            label={item.label}
            collapsed={collapsed}
            onClick={() => onNavigate(item.id)}
          />
        ))}
      </nav>

      <div className="flex flex-col gap-1 px-3 pb-5">
        <NavButton
          isActive={activeView === 'settings'}
          icon={Settings}
          label="Settings"
          collapsed={collapsed}
          onClick={() => onNavigate('settings')}
        />
        <button
          onClick={() => setCollapsed((c) => !c)}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-mim-muted transition-colors hover:bg-mim-surface-light hover:text-white ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!collapsed && <span className="whitespace-nowrap">Collapse</span>}
        </button>
      </div>
    </motion.aside>
  );
}

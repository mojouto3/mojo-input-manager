import { motion } from 'framer-motion';
import { LayoutDashboard, Gamepad2, SlidersHorizontal, ShieldCheck, Settings } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'virtual-devices', label: 'Virtual Devices', icon: Gamepad2 },
  { id: 'mapping', label: 'Mapping', icon: SlidersHorizontal },
  { id: 'device-filtering', label: 'Device Filtering', icon: ShieldCheck }
];

export default function Sidebar({ activeView, onNavigate }) {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-mim-border bg-mim-surface/80 backdrop-blur-sm">
      <nav className="flex flex-1 flex-col gap-1 px-3 pt-4">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-left transition-colors"
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-lg bg-mim-green/10 border border-mim-green/30"
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                />
              )}
              <Icon
                size={18}
                className={`relative z-10 ${isActive ? 'text-mim-green' : 'text-mim-muted'}`}
              />
              <span className={`relative z-10 ${isActive ? 'text-white font-medium' : 'text-mim-muted'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="px-3 pb-5">
        <button
          onClick={() => onNavigate('settings')}
          className="relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-left transition-colors"
        >
          {activeView === 'settings' && (
            <motion.div
              layoutId="sidebar-active"
              className="absolute inset-0 rounded-lg bg-mim-green/10 border border-mim-green/30"
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            />
          )}
          <Settings
            size={18}
            className={`relative z-10 ${activeView === 'settings' ? 'text-mim-green' : 'text-mim-muted'}`}
          />
          <span className={`relative z-10 ${activeView === 'settings' ? 'text-white font-medium' : 'text-mim-muted'}`}>
            Settings
          </span>
        </button>
      </div>
    </aside>
  );
}

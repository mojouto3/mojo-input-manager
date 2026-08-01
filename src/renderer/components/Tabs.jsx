import { motion } from 'framer-motion';

export default function Tabs({ tabs, activeTab, onChange }) {
  return (
    <div className="mb-5 flex gap-6 border-b border-mim-border">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`relative flex items-center gap-2 pb-3 text-sm transition-colors ${
              isActive ? 'text-white' : 'text-mim-muted hover:text-white'
            }`}
          >
            {tab.label}
            {typeof tab.count === 'number' && (
              <span className="text-xs text-mim-muted">{tab.count}</span>
            )}
            {isActive && (
              <motion.div
                layoutId="device-filtering-tab-underline"
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full"
                style={{
                  background: 'linear-gradient(90deg,#3ddb3d,#3ddce8)',
                  boxShadow: '0 0 8px rgba(61,219,61,0.7)'
                }}
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

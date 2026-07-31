import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './components/Sidebar';
import AmbientBackground from './components/AmbientBackground';
import Dashboard from './views/Dashboard';
import ComingSoon from './views/ComingSoon';

const VIEW_TITLES = {
  'virtual-devices': 'Virtual Devices',
  mapping: 'Mapping',
  'device-filtering': 'Device Filtering',
  settings: 'Settings'
};

export default function App() {
  const [activeView, setActiveView] = useState('dashboard');

  return (
    <div className="flex h-screen bg-mim-bg">
      <AmbientBackground />
      <Sidebar activeView={activeView} onNavigate={setActiveView} />
      <main className="relative flex-1 overflow-y-auto px-10 py-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="h-full"
          >
            {activeView === 'dashboard' ? (
              <Dashboard />
            ) : (
              <ComingSoon title={VIEW_TITLES[activeView]} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

const system = typeof window !== 'undefined' ? window.mim?.system : undefined;

const DRIVERS = [
  { key: 'vjoyInstalled', name: 'vJoy', url: 'https://sourceforge.net/projects/vjoystick/' },
  { key: 'hidhideInstalled', name: 'HidHide', url: 'https://github.com/nefarius/HidHide/releases' }
];

export default function DriverStatusBanner() {
  const [status, setStatus] = useState(null);

  const check = useCallback(async () => {
    if (!system) return;
    const result = await system.checkDrivers();
    setStatus(result);
  }, []);

  useEffect(() => {
    check();
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, [check]);

  const missing = status ? DRIVERS.filter((d) => !status[d.key]) : [];

  return (
    <AnimatePresence>
      {missing.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden border-b border-amber-500/30 bg-amber-500/10"
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-2.5 text-sm text-amber-300">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} />
              <span>
                {missing.map((d) => d.name).join(' and ')} {missing.length > 1 ? "aren't" : "isn't"} installed, some
                features won't work yet.
              </span>
            </div>
            <div className="flex gap-3">
              {missing.map((d) => (
                <button
                  key={d.key}
                  onClick={() => system.openExternal(d.url)}
                  className="rounded-md border border-amber-500/40 px-2.5 py-1 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/20"
                >
                  Download {d.name}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

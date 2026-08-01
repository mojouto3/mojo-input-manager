import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Download, Loader2 } from 'lucide-react';

const system = typeof window !== 'undefined' ? window.mim?.system : undefined;

const DRIVERS = [
  { statusKey: 'vjoyInstalled', sourceKey: 'vjoy', name: 'vJoy', url: 'https://sourceforge.net/projects/vjoystick/' },
  {
    statusKey: 'hidhideInstalled',
    sourceKey: 'hidhide',
    name: 'HidHide',
    url: 'https://github.com/nefarius/HidHide/releases'
  }
];

export default function DriverStatusBanner() {
  const [status, setStatus] = useState(null);
  const [versions, setVersions] = useState({});
  const [installing, setInstalling] = useState(null);
  const [installError, setInstallError] = useState(null);

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

  const missing = status ? DRIVERS.filter((d) => !status[d.statusKey]) : [];

  useEffect(() => {
    missing.forEach((d) => {
      if (d.sourceKey in versions) return;
      system?.getDriverInfo(d.sourceKey).then((result) => {
        setVersions((v) => ({ ...v, [d.sourceKey]: result.ok ? result.info.version : null }));
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function handleInstall(driver) {
    setInstalling(driver.sourceKey);
    setInstallError(null);
    const result = await system.installDriver(driver.sourceKey);
    if (!result.ok) {
      setInstallError(`${driver.name}: ${result.error}`);
    }
    setInstalling(null);
  }

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
            <div className="flex flex-wrap items-center gap-4">
              {missing.map((d) => (
                <div key={d.sourceKey} className="flex items-center gap-2">
                  <button
                    onClick={() => handleInstall(d)}
                    disabled={installing === d.sourceKey}
                    className="flex items-center gap-1.5 rounded-md border border-amber-500/40 px-2.5 py-1 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                  >
                    {installing === d.sourceKey ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Download size={12} />
                    )}
                    {installing === d.sourceKey ? 'Downloading...' : `Install ${d.name}`}
                    {versions[d.sourceKey] ? ` (${versions[d.sourceKey]})` : ''}
                  </button>
                  <button
                    onClick={() => system.openExternal(d.url)}
                    className="text-xs text-amber-300/70 hover:text-amber-300 hover:underline"
                  >
                    or open page
                  </button>
                </div>
              ))}
            </div>
          </div>
          {installError && <div className="px-6 pb-2 text-xs text-red-400">{installError}</div>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

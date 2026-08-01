import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, ShieldCheck, EyeOff, Eye } from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Badge from '../components/Badge';

const hidhide = typeof window !== 'undefined' ? window.mim?.hidhide : undefined;

export default function DeviceFiltering() {
  const [devices, setDevices] = useState([]);
  const [cloakEnabled, setCloakEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [busyPath, setBusyPath] = useState(null);
  const [notice, setNotice] = useState(null);

  const refresh = useCallback(async () => {
    if (!hidhide) {
      setLoadError('This feature is only available inside the desktop app.');
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await hidhide.getDevices();
    if (result.ok) {
      setDevices(result.devices);
      setCloakEnabled(result.cloakEnabled);
      setLoadError(null);
    } else {
      setLoadError(result.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleToggle(device) {
    setBusyPath(device.path);
    setNotice(null);
    const result = device.hidden ? await hidhide.unhideDevice(device.path) : await hidhide.hideDevice(device.path);
    if (!result.ok) {
      setNotice({ text: `${device.name}: ${result.error}` });
    }
    setBusyPath(null);
    refresh();
  }

  if (loadError) {
    return (
      <div className="mx-auto flex h-full max-w-3xl items-center justify-center">
        <Card hover={false} className="px-10 py-8 text-center">
          <h2 className="text-xl font-semibold text-white">Device Filtering</h2>
          <p className="mt-2 text-mim-muted">{loadError}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Device Filtering</h1>
          <p className="mt-1 text-sm text-mim-muted">
            Choose which physical devices are hidden from other applications via HidHide.
          </p>
        </div>
        <Button variant="secondary" onClick={refresh} className="flex items-center gap-2" disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <Badge tone={cloakEnabled ? 'green' : 'muted'}>
          Cloaking is {cloakEnabled ? 'ON' : 'OFF'}
        </Badge>
        {!cloakEnabled && (
          <span className="text-xs text-mim-muted">
            Hiding a device below has no effect on other apps yet while cloaking is off.
          </span>
        )}
      </div>

      {notice && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400"
        >
          {notice.text}
        </motion.div>
      )}

      {devices.length === 0 ? (
        <Card hover={false} className="flex flex-col items-center gap-3 px-10 py-10 text-center">
          <ShieldCheck size={28} className="text-mim-muted" />
          <p className="text-mim-muted">No gaming devices found.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {devices.map((device) => {
            const isBusy = busyPath === device.path;
            return (
              <Card key={device.path} hover={false} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{device.name}</p>
                  <p className="truncate text-xs text-mim-muted">{device.path}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {!device.present && <Badge tone="muted">Not connected</Badge>}
                  <Badge tone={device.hidden ? 'cyan' : 'green'}>{device.hidden ? 'Hidden' : 'Visible'}</Badge>
                  <button
                    onClick={() => handleToggle(device)}
                    disabled={isBusy}
                    className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors disabled:opacity-50 ${
                      device.hidden
                        ? 'text-mim-green hover:bg-mim-green/10'
                        : 'text-mim-cyan hover:bg-mim-cyan/10'
                    }`}
                  >
                    {device.hidden ? <Eye size={12} /> : <EyeOff size={12} />}
                    {isBusy ? 'Working...' : device.hidden ? 'Unhide' : 'Hide'}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

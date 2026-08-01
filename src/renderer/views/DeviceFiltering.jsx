import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, ShieldCheck, EyeOff, Eye, Plus, X } from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Badge from '../components/Badge';

const hidhide = typeof window !== 'undefined' ? window.mim?.hidhide : undefined;

export default function DeviceFiltering() {
  const [devices, setDevices] = useState([]);
  const [apps, setApps] = useState([]);
  const [cloakEnabled, setCloakEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [busyPath, setBusyPath] = useState(null);
  const [cloakBusy, setCloakBusy] = useState(false);
  const [appBusy, setAppBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const refresh = useCallback(async () => {
    if (!hidhide) {
      setLoadError('This feature is only available inside the desktop app.');
      setLoading(false);
      return;
    }
    setLoading(true);
    const [devicesResult, appsResult] = await Promise.all([hidhide.getDevices(), hidhide.getApps()]);
    if (devicesResult.ok) {
      setDevices(devicesResult.devices);
      setCloakEnabled(devicesResult.cloakEnabled);
      setLoadError(null);
    } else {
      setLoadError(devicesResult.error);
    }
    if (appsResult.ok) {
      setApps(appsResult.apps);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleToggleCloak() {
    setCloakBusy(true);
    setNotice(null);
    const result = await hidhide.setCloak(!cloakEnabled);
    if (!result.ok) {
      setNotice({ text: `Cloaking: ${result.error}` });
    }
    setCloakBusy(false);
    refresh();
  }

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

  async function handleAddApp() {
    const picked = await hidhide.pickApp();
    if (!picked.ok) return;
    setAppBusy(true);
    setNotice(null);
    const result = await hidhide.registerApp(picked.path);
    if (!result.ok) {
      setNotice({ text: `${picked.path}: ${result.error}` });
    }
    setAppBusy(false);
    refresh();
  }

  async function handleRemoveApp(exePath) {
    setAppBusy(true);
    setNotice(null);
    const result = await hidhide.unregisterApp(exePath);
    if (!result.ok) {
      setNotice({ text: `${exePath}: ${result.error}` });
    }
    setAppBusy(false);
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

      <Card hover={false} className="mb-4 flex items-center justify-between gap-4 p-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-white">
            Cloaking
            <Badge tone={cloakEnabled ? 'green' : 'muted'}>{cloakEnabled ? 'ON' : 'OFF'}</Badge>
          </p>
          <p className="mt-1 text-xs text-mim-muted">
            {cloakEnabled
              ? 'Hidden devices below are invisible to every app except those on the allow list.'
              : 'Hiding a device below has no effect on other apps yet while cloaking is off.'}
          </p>
        </div>
        <Button
          variant={cloakEnabled ? 'secondary' : 'primary'}
          onClick={handleToggleCloak}
          disabled={cloakBusy}
        >
          {cloakBusy ? 'Working...' : cloakEnabled ? 'Turn Off' : 'Turn On'}
        </Button>
      </Card>

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
                  <Badge tone={device.hidden ? 'cyan' : 'green'} className="w-16">
                    {device.hidden ? 'Hidden' : 'Visible'}
                  </Badge>
                  <button
                    onClick={() => handleToggle(device)}
                    disabled={isBusy}
                    className={`flex w-20 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors disabled:opacity-50 ${
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

      <div className="mb-3 mt-8 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Allowed Applications</h2>
          <p className="text-xs text-mim-muted">These apps can still see hidden devices while cloaking is on.</p>
        </div>
        <Button variant="secondary" onClick={handleAddApp} disabled={appBusy} className="flex items-center gap-2">
          <Plus size={14} />
          Add Application
        </Button>
      </div>

      {apps.length === 0 ? (
        <Card hover={false} className="px-6 py-6 text-center text-sm text-mim-muted">
          No applications on the allow list yet.
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {apps.map((exePath) => (
            <Card key={exePath} hover={false} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{exePath.split('\\').pop()}</p>
                <p className="truncate text-xs text-mim-muted">{exePath}</p>
              </div>
              <button
                onClick={() => handleRemoveApp(exePath)}
                disabled={appBusy}
                className="flex w-20 shrink-0 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              >
                <X size={12} />
                Remove
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

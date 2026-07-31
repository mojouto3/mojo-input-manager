import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Plus, Trash2, Gamepad2 } from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Badge from '../components/Badge';

const vjoy = typeof window !== 'undefined' ? window.mim?.vjoy : undefined;
const MAX_DEVICES = 16;

function statusBadge(status) {
  if (status === 'FREE') return { tone: 'green', label: 'Ready' };
  return { tone: 'cyan', label: status };
}

export default function VirtualDevices() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [busyIndex, setBusyIndex] = useState(null);
  const [notice, setNotice] = useState(null);

  const refresh = useCallback(async () => {
    if (!vjoy) {
      setLoadError('This feature is only available inside the desktop app.');
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await vjoy.getStatus();
    if (result.ok) {
      setDevices(result.devices);
      setLoadError(null);
    } else {
      setLoadError(result.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleCreate(index) {
    setBusyIndex(index);
    setNotice(null);
    const result = await vjoy.createDevice(index);
    if (!result.ok && !result.cancelled) {
      setNotice({ type: 'error', text: `Device ${index}: ${result.error}` });
    }
    setBusyIndex(null);
    refresh();
  }

  async function handleDelete(index) {
    setBusyIndex(index);
    setNotice(null);
    const result = await vjoy.deleteDevice(index);
    if (!result.ok && !result.cancelled) {
      setNotice({ type: 'error', text: `Device ${index}: ${result.error}` });
    }
    setBusyIndex(null);
    refresh();
  }

  if (loadError) {
    return (
      <div className="mx-auto flex h-full max-w-3xl items-center justify-center">
        <Card hover={false} className="px-10 py-8 text-center">
          <h2 className="text-xl font-semibold text-white">Virtual Devices</h2>
          <p className="mt-2 text-mim-muted">{loadError}</p>
        </Card>
      </div>
    );
  }

  const activeDevices = devices.filter((d) => d.status !== 'MISSING');
  const nextFreeIndex = devices.find((d) => d.status === 'MISSING')?.index ?? null;
  const atLimit = nextFreeIndex === null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Virtual Devices</h1>
          <p className="mt-1 text-sm text-mim-muted">
            Create and remove vJoy virtual controllers. Each change requires administrator permission.
          </p>
        </div>
        <Button variant="secondary" onClick={refresh} className="flex items-center gap-2" disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
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

      {activeDevices.length === 0 ? (
        <Card hover={false} className="flex flex-col items-center gap-3 px-10 py-10 text-center">
          <Gamepad2 size={28} className="text-mim-muted" />
          <p className="text-mim-muted">No virtual devices yet.</p>
          <Button onClick={() => handleCreate(nextFreeIndex)} disabled={busyIndex !== null} className="flex items-center gap-2">
            <Plus size={14} />
            {busyIndex !== null ? 'Working...' : 'Add Virtual Device'}
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {activeDevices.map((device) => {
            const badge = statusBadge(device.status);
            const isBusy = busyIndex === device.index;

            return (
              <Card key={device.index} hover={false} className="flex flex-col items-center gap-2 p-4">
                <Gamepad2 size={20} className="text-mim-green" />
                <span className="text-sm font-medium text-white">Device {device.index}</span>
                <Badge tone={badge.tone}>{badge.label}</Badge>
                <button
                  onClick={() => handleDelete(device.index)}
                  disabled={isBusy}
                  className="mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                >
                  <Trash2 size={12} />
                  {isBusy ? 'Working...' : 'Delete'}
                </button>
              </Card>
            );
          })}

          {!atLimit && (
            <button
              onClick={() => handleCreate(nextFreeIndex)}
              disabled={busyIndex !== null}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-mim-border p-4 text-mim-muted transition-colors hover:border-mim-green hover:text-mim-green disabled:opacity-50"
            >
              <Plus size={20} />
              <span className="text-sm">{busyIndex !== null ? 'Working...' : 'Add Device'}</span>
            </button>
          )}
        </div>
      )}

      {atLimit && activeDevices.length > 0 && (
        <p className="mt-4 text-center text-xs text-mim-muted">Maximum of {MAX_DEVICES} devices reached.</p>
      )}
    </div>
  );
}

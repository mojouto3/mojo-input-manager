import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Gamepad2, Play, Square } from 'lucide-react';
import Card from '../components/Card';
import Badge from '../components/Badge';
import Select from '../components/Select';

const mim = typeof window !== 'undefined' ? window.mim : undefined;

// vJoy virtual devices (vendor 1234 / product bead) present themselves as regular
// HID joysticks too, so the Gamepad API reports them alongside real physical devices.
// They must be excluded here or the app could end up "mapping" a vJoy device to itself.
const VJOY_ID_PATTERN = /vjoy|1234.*bead/i;

// Matches the axis order vjoyInterface.js feeds to vJoy (X, Y, Z, RX, RY, RZ, SL0, SL1).
const AXIS_NAMES = ['X', 'Y', 'Z', 'Rx', 'Ry', 'Rz', 'Sl0', 'Sl1'];

function readGamepads() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  return Array.from(pads)
    .filter(Boolean)
    .filter((pad) => !VJOY_ID_PATTERN.test(pad.id));
}

export default function Mapping() {
  const [devices, setDevices] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [vjoyDevices, setVjoyDevices] = useState([]);
  const [targetDeviceId, setTargetDeviceId] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [liveError, setLiveError] = useState(null);
  const [savedMappings, setSavedMappings] = useState([]);
  const [remembered, setRemembered] = useState(false);
  const frameRef = useRef();
  const isLiveRef = useRef(false);
  const targetDeviceRef = useRef('');
  const selectedIndexRef = useRef(null);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  useEffect(() => {
    function tick() {
      const pads = readGamepads();
      setDevices(pads);
      if (isLiveRef.current && targetDeviceRef.current) {
        const active = pads.find((d) => d.index === selectedIndexRef.current) ?? pads[0];
        if (active) {
          mim.mapping.feed({
            axes: active.axes,
            buttons: active.buttons.map((b) => b.pressed)
          });
        }
      }
      frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  const refreshVjoyDevices = useCallback(async () => {
    if (!mim?.vjoy) return;
    const result = await mim.vjoy.getStatus();
    if (result.ok) {
      setVjoyDevices(result.devices.filter((d) => d.status === 'FREE'));
    }
  }, []);

  useEffect(() => {
    refreshVjoyDevices();
  }, [refreshVjoyDevices]);

  useEffect(() => {
    mim?.mappingProfiles?.list().then((list) => setSavedMappings(list ?? []));
  }, []);

  useEffect(() => {
    return () => {
      if (isLiveRef.current) mim?.mapping?.stop();
    };
  }, []);

  const selected = devices.find((d) => d.index === selectedIndex) ?? devices[0] ?? null;

  // Pre-fill the last remembered target for whichever physical device is
  // currently selected, so the user doesn't have to re-pick it every session.
  useEffect(() => {
    if (isLive || !selected) return;
    const saved = savedMappings.find((m) => m.physicalId === selected.id);
    if (saved && vjoyDevices.some((d) => String(d.index) === String(saved.targetDeviceId))) {
      setTargetDeviceId(String(saved.targetDeviceId));
      setRemembered(true);
    } else {
      setRemembered(false);
    }
  }, [selected?.id, vjoyDevices, isLive]);

  async function handleToggleLive() {
    if (isLive) {
      await mim.mapping.stop();
      setIsLive(false);
      isLiveRef.current = false;
      targetDeviceRef.current = '';
      refreshVjoyDevices();
      return;
    }
    if (!targetDeviceId || !selected) return;
    setLiveError(null);
    const result = await mim.mapping.start(Number(targetDeviceId));
    if (result.ok) {
      setIsLive(true);
      isLiveRef.current = true;
      targetDeviceRef.current = targetDeviceId;
      mim.mappingProfiles.save({
        physicalId: selected.id,
        physicalName: selected.id.split(' (')[0],
        targetDeviceId
      });
      setSavedMappings(await mim.mappingProfiles.list());
    } else {
      setLiveError(result.error);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Mapping</h1>
        <p className="mt-1 text-sm text-mim-muted">
          Detected physical devices and their live input. Map one onto a vJoy virtual device to forward its input.
        </p>
      </div>

      {devices.length === 0 ? (
        <Card hover={false} className="flex flex-col items-center gap-3 px-10 py-10 text-center">
          <Gamepad2 size={28} className="text-mim-muted" />
          <p className="text-mim-muted">No physical devices detected yet.</p>
          <p className="text-xs text-mim-muted">
            Plug in a controller and move a stick or press a button. Some devices only appear after their first input.
          </p>
        </Card>
      ) : (
        <>
          <Card hover={false} className="mb-4 flex items-center justify-between gap-4 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-mim-muted">Forward to</span>
              <Select
                value={targetDeviceId}
                onChange={(value) => {
                  setTargetDeviceId(value);
                  setRemembered(false);
                }}
                disabled={isLive}
                placeholder="Select vJoy device..."
                options={vjoyDevices.map((d) => ({ value: d.index, label: `vJoy Device ${d.index}` }))}
              />
              {remembered && <span className="text-xs text-mim-muted">Remembered from last time</span>}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {isLive && (
                <Badge tone="green">
                  <motion.span
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                    className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-mim-green align-middle"
                  />
                  Live
                </Badge>
              )}
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleToggleLive}
                disabled={!isLive && !targetDeviceId}
                className={`flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-semibold transition-shadow disabled:opacity-50 ${
                  isLive
                    ? 'glass-surface text-white'
                    : 'bg-[linear-gradient(135deg,#3ddb3d,#28a428)] text-mim-bg shadow-[0_4px_16px_-4px_rgba(61,219,61,0.5)]'
                }`}
              >
                {isLive ? <Square size={13} /> : <Play size={13} />}
                {isLive ? 'Stop' : 'Start Mapping'}
              </motion.button>
            </div>
          </Card>

          {liveError && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
              {liveError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <div className="flex flex-col gap-2">
              {devices.map((device) => (
                <button
                  key={device.index}
                  onClick={() => setSelectedIndex(device.index)}
                  className={`rounded-lg px-3 py-2.5 text-left text-sm transition-all ${
                    selected?.index === device.index
                      ? 'border border-mim-green/30 bg-mim-green/10 text-white shadow-[0_0_10px_rgba(61,219,61,0.15)]'
                      : 'glass-surface text-mim-muted hover:text-white'
                  }`}
                >
                  <p className="truncate font-medium">{device.id.split(' (')[0]}</p>
                  <p className="text-xs text-mim-muted">Device {device.index}</p>
                </button>
              ))}
            </div>

            {selected && (
              <Card hover={false} className="p-5">
                <h3 className="mb-4 truncate text-sm font-semibold text-white">{selected.id}</h3>

                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-mim-muted">Axes</p>
                <div className="mb-5 flex flex-col gap-2">
                  {selected.axes.map((value, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-8 text-xs text-mim-muted">{AXIS_NAMES[i] ?? `A${i}`}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-mim-surface-light">
                        <motion.div
                          className="h-full bg-mim-green"
                          animate={{ width: `${((value + 1) / 2) * 100}%` }}
                          transition={{ duration: 0.05 }}
                        />
                      </div>
                      <span className="w-12 text-right text-xs text-mim-muted">{value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-mim-muted">Buttons</p>
                <div className="flex flex-wrap gap-2">
                  {selected.buttons.map((button, i) => (
                    <div
                      key={i}
                      className={`flex h-8 w-8 items-center justify-center rounded-md border text-xs font-medium transition-colors ${
                        button.pressed
                          ? 'border-mim-green bg-mim-green/20 text-mim-green'
                          : 'border-mim-border text-mim-muted'
                      }`}
                    >
                      {i + 1}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Gamepad2, Play, Square } from 'lucide-react';
import Card from '../components/Card';
import Badge from '../components/Badge';
import Select from '../components/Select';

const mim = typeof window !== 'undefined' ? window.mim : undefined;
const MAX_AXES = 8;

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
  const [selectedIds, setSelectedIds] = useState([]);
  const [vjoyDevices, setVjoyDevices] = useState([]);
  const [targetDeviceId, setTargetDeviceId] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [liveError, setLiveError] = useState(null);
  const [savedMappings, setSavedMappings] = useState([]);
  const [remembered, setRemembered] = useState(false);
  const frameRef = useRef();
  const isLiveRef = useRef(false);
  const targetDeviceRef = useRef('');
  const selectedIdsRef = useRef([]);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    function tick() {
      const pads = readGamepads();
      setDevices(pads);
      if (isLiveRef.current && targetDeviceRef.current) {
        // Combine every selected device's axes/buttons, in selection order, into
        // one payload. This is how several physical devices feed a single vJoy
        // target: each one contributes the next slice of axes/buttons.
        const active = selectedIdsRef.current
          .map((id) => pads.find((d) => d.id === id))
          .filter(Boolean);
        if (active.length > 0) {
          mim.mapping.feed({
            axes: active.flatMap((d) => d.axes).slice(0, MAX_AXES),
            buttons: active.flatMap((d) => d.buttons.map((b) => b.pressed))
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

  const selectedDevices = selectedIds.map((id) => devices.find((d) => d.id === id)).filter(Boolean);
  const totalAxes = selectedDevices.reduce((sum, d) => sum + d.axes.length, 0);

  function toggleDevice(id) {
    if (isLive) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Pre-fill the last remembered target when exactly one device is selected,
  // so the common single-device case doesn't require re-picking it every time.
  useEffect(() => {
    if (isLive || selectedDevices.length !== 1) {
      setRemembered(false);
      return;
    }
    const saved = savedMappings.find((m) => m.physicalId === selectedDevices[0].id);
    if (saved && vjoyDevices.some((d) => String(d.index) === String(saved.targetDeviceId))) {
      setTargetDeviceId(String(saved.targetDeviceId));
      setRemembered(true);
    } else {
      setRemembered(false);
    }
  }, [selectedDevices[0]?.id, selectedDevices.length, vjoyDevices, isLive]);

  async function handleToggleLive() {
    if (isLive) {
      await mim.mapping.stop();
      setIsLive(false);
      isLiveRef.current = false;
      targetDeviceRef.current = '';
      refreshVjoyDevices();
      return;
    }
    if (!targetDeviceId || selectedDevices.length === 0) return;
    setLiveError(null);
    const result = await mim.mapping.start(Number(targetDeviceId));
    if (result.ok) {
      setIsLive(true);
      isLiveRef.current = true;
      targetDeviceRef.current = targetDeviceId;
      if (selectedDevices.length === 1) {
        mim.mappingProfiles.save({
          physicalId: selectedDevices[0].id,
          physicalName: selectedDevices[0].id.split(' (')[0],
          targetDeviceId
        });
        setSavedMappings(await mim.mappingProfiles.list());
      }
    } else {
      setLiveError(result.error);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Mapping</h1>
        <p className="mt-1 text-sm text-mim-muted">
          Select one or more physical devices to combine onto a single vJoy virtual device.
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
                disabled={!isLive && (!targetDeviceId || selectedDevices.length === 0)}
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

          {totalAxes > MAX_AXES && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
              Selected devices have {totalAxes} axes combined, but a vJoy device only accepts {MAX_AXES}. The extra
              axes will be ignored.
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <div className="flex flex-col gap-2">
              {devices.map((device) => {
                const isChecked = selectedIds.includes(device.id);
                return (
                  <button
                    key={device.id}
                    onClick={() => toggleDevice(device.id)}
                    disabled={isLive}
                    className={`rounded-lg px-3 py-2.5 text-left text-sm transition-all disabled:opacity-50 ${
                      isChecked
                        ? 'border border-mim-green/30 bg-mim-green/10 text-white shadow-[0_0_10px_rgba(61,219,61,0.15)]'
                        : 'glass-surface text-mim-muted hover:text-white'
                    }`}
                  >
                    <p className="truncate font-medium">{device.id.split(' (')[0]}</p>
                    <p className="text-xs text-mim-muted">{isChecked ? 'Selected' : 'Device ' + device.index}</p>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-4">
              {selectedDevices.length === 0 ? (
                <Card hover={false} className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                  <p className="text-sm text-mim-muted">Select a device on the left to preview its live input.</p>
                </Card>
              ) : (
                selectedDevices.map((device) => (
                  <Card key={device.id} hover={false} className="p-5">
                    <h3 className="mb-4 truncate text-sm font-semibold text-white">{device.id}</h3>

                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-mim-muted">Axes</p>
                    <div className="mb-5 flex flex-col gap-2">
                      {device.axes.map((value, i) => (
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
                      {device.buttons.map((button, i) => (
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
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

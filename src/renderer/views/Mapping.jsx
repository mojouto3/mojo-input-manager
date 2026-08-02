import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Gamepad2, Play, Square, Plus, X, ArrowLeftRight, Save, Trash2 } from 'lucide-react';
import Card from '../components/Card';
import Badge from '../components/Badge';
import Select from '../components/Select';

const mim = typeof window !== 'undefined' ? window.mim : undefined;
const MAX_AXES = 8;
// requestAnimationFrame only fires when the window is actually being painted,
// which Windows stops doing for a truly minimized (not just hidden/tray'd)
// window. setInterval is a plain timer with no such dependency, so mapping
// keeps feeding vJoy no matter how the window is put aside.
const TICK_INTERVAL_MS = 16;

// vJoy virtual devices (vendor 1234 / product bead) present themselves as regular
// HID joysticks too, so the Gamepad API reports them alongside real physical devices.
// They must be excluded here or the app could end up "mapping" a vJoy device to itself.
const VJOY_ID_PATTERN = /vjoy|1234.*bead/i;

// Matches the axis order vjoyInterface.js feeds to vJoy (X, Y, Z, RX, RY, RZ, SL0, SL1).
const AXIS_NAMES = ['X', 'Y', 'Z', 'Rx', 'Ry', 'Rz', 'Sl0', 'Sl1'];

function sameSet(a, b) {
  return a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
}

function readGamepads() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  return Array.from(pads)
    .filter(Boolean)
    .filter((pad) => !VJOY_ID_PATTERN.test(pad.id));
}

function makeSlotId() {
  return `slot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptySlot() {
  return { id: makeSlotId(), selectedIds: [], targetDeviceId: '', isLive: false, liveError: null };
}

export default function Mapping() {
  const [devices, setDevices] = useState([]);
  const [vjoyDevices, setVjoyDevices] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [savedMappings, setSavedMappings] = useState([]);
  const [gameProfiles, setGameProfiles] = useState([]);
  const [showSaveProfile, setShowSaveProfile] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [activeProfileId, setActiveProfileId] = useState(null);
  const mappingsRef = useRef([]);
  const autoRestoredRef = useRef(false);

  function refreshGameProfiles() {
    mim?.mappingSetups?.list().then((list) => setGameProfiles(list ?? []));
  }

  useEffect(() => {
    mappingsRef.current = mappings;
  }, [mappings]);

  useEffect(() => {
    function tick() {
      const pads = readGamepads();
      setDevices(pads);
      for (const slot of mappingsRef.current) {
        if (!slot.isLive || !slot.targetDeviceId) continue;
        const active = slot.selectedIds.map((id) => pads.find((d) => d.id === id)).filter(Boolean);
        if (active.length === 0) continue;
        // Combine every selected device's axes/buttons, in selection order, into
        // one payload. This is how several physical devices feed a single vJoy
        // target: each one contributes the next slice of axes/buttons.
        mim.mapping.feed({
          deviceId: Number(slot.targetDeviceId),
          axes: active.flatMap((d) => d.axes).slice(0, MAX_AXES),
          buttons: active.flatMap((d) => d.buttons.map((b) => b.pressed))
        });
      }
    }
    const interval = setInterval(tick, TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  async function refreshVjoyDevices() {
    if (!mim?.vjoy) return;
    const result = await mim.vjoy.getStatus();
    if (result.ok) {
      // Keep every created device, not just FREE ones: once a mapping goes
      // live, vJoy reports its own target as BUSY (we're the one holding
      // it), and it still needs to show up as that mapping's own selection.
      setVjoyDevices(result.devices.filter((d) => d.status !== 'MISSING'));
    }
  }

  useEffect(() => {
    refreshVjoyDevices();
  }, []);

  useEffect(() => {
    mim?.mappingProfiles?.list().then((list) => setSavedMappings(list ?? []));
  }, []);

  useEffect(() => {
    refreshGameProfiles();
  }, []);

  useEffect(() => {
    return () => {
      for (const slot of mappingsRef.current) {
        if (slot.isLive) mim?.mapping?.stop(Number(slot.targetDeviceId));
      }
    };
  }, []);

  // Auto-restore every saved combination that's fully connected, once, so a
  // multi-mapping setup (a HOTAS's throttle + stick, or two HOSAS sticks)
  // doesn't need to be rebuilt by hand on every launch. This only restores
  // the selections and targets, it never starts mapping on its own.
  useEffect(() => {
    if (autoRestoredRef.current || devices.length === 0 || savedMappings.length === 0) return;
    const connectedIds = devices.map((d) => d.id);
    const usedDevices = new Set();
    const usedTargets = new Set();
    const restored = [];
    for (const saved of savedMappings) {
      if (saved.physicalIds.some((id) => usedDevices.has(id))) continue;
      if (usedTargets.has(String(saved.targetDeviceId))) continue;
      if (!saved.physicalIds.every((id) => connectedIds.includes(id))) continue;
      saved.physicalIds.forEach((id) => usedDevices.add(id));
      usedTargets.add(String(saved.targetDeviceId));
      restored.push({
        id: makeSlotId(),
        selectedIds: saved.physicalIds,
        targetDeviceId: String(saved.targetDeviceId),
        isLive: false,
        liveError: null
      });
    }
    if (restored.length > 0) setMappings(restored);
    autoRestoredRef.current = true;
  }, [devices, savedMappings]);

  // Pre-fill a slot's target once its device selection matches a saved
  // combination, so the same set doesn't need re-picking every time.
  useEffect(() => {
    setMappings((prev) => {
      let changed = false;
      const next = prev.map((slot) => {
        if (slot.isLive || slot.targetDeviceId || slot.selectedIds.length === 0) return slot;
        const saved = savedMappings.find((m) => sameSet(m.physicalIds, slot.selectedIds));
        if (saved && vjoyDevices.some((d) => String(d.index) === String(saved.targetDeviceId))) {
          changed = true;
          return { ...slot, targetDeviceId: String(saved.targetDeviceId) };
        }
        return slot;
      });
      return changed ? next : prev;
    });
  }, [mappings, savedMappings, vjoyDevices]);

  // Drop a device from every selection the moment it disconnects, otherwise
  // it would silently reappear "selected" (without ever being clicked) if
  // the same device is plugged back in later, since selectedIds would still
  // secretly reference it while it was hidden from the device list.
  useEffect(() => {
    const connectedIds = new Set(devices.map((d) => d.id));
    setMappings((prev) => {
      let changed = false;
      const next = prev.map((slot) => {
        const selectedIds = slot.selectedIds.filter((id) => connectedIds.has(id));
        if (selectedIds.length !== slot.selectedIds.length) {
          changed = true;
          return { ...slot, selectedIds };
        }
        return slot;
      });
      return changed ? next : prev;
    });
  }, [devices]);

  function addMapping() {
    setActiveProfileId(null);
    setMappings((prev) => [...prev, emptySlot()]);
  }

  async function removeMapping(slotId) {
    const slot = mappings.find((m) => m.id === slotId);
    if (slot?.isLive) {
      await mim.mapping.stop(Number(slot.targetDeviceId));
      refreshVjoyDevices();
    }
    setActiveProfileId(null);
    setMappings((prev) => prev.filter((m) => m.id !== slotId));
  }

  function toggleDevice(slotId, deviceId) {
    setActiveProfileId(null);
    setMappings((prev) =>
      prev.map((m) => {
        if (m.id !== slotId || m.isLive) return m;
        const selectedIds = m.selectedIds.includes(deviceId)
          ? m.selectedIds.filter((id) => id !== deviceId)
          : [...m.selectedIds, deviceId];
        return { ...m, selectedIds };
      })
    );
  }

  function setTarget(slotId, targetDeviceId) {
    setActiveProfileId(null);
    setMappings((prev) => prev.map((m) => (m.id === slotId ? { ...m, targetDeviceId } : m)));
  }

  async function toggleLive(slotId) {
    const slot = mappings.find((m) => m.id === slotId);
    if (!slot) return;
    if (slot.isLive) {
      await mim.mapping.stop(Number(slot.targetDeviceId));
      setMappings((prev) => prev.map((m) => (m.id === slotId ? { ...m, isLive: false } : m)));
      refreshVjoyDevices();
      return;
    }
    if (!slot.targetDeviceId || slot.selectedIds.length === 0) return;
    setMappings((prev) => prev.map((m) => (m.id === slotId ? { ...m, liveError: null } : m)));
    const result = await mim.mapping.start(Number(slot.targetDeviceId));
    if (result.ok) {
      setMappings((prev) => prev.map((m) => (m.id === slotId ? { ...m, isLive: true } : m)));
      mim.mappingProfiles.save({ physicalIds: slot.selectedIds, targetDeviceId: slot.targetDeviceId });
      setSavedMappings(await mim.mappingProfiles.list());
      refreshVjoyDevices();
    } else {
      setMappings((prev) => prev.map((m) => (m.id === slotId ? { ...m, liveError: result.error } : m)));
    }
  }

  // Quick fix for games that occasionally scramble which device they think is
  // which (a known Star Citizen HOSAS quirk after updates): swap which vJoy
  // target two mappings feed, without touching the game at all.
  async function swapTargets(indexA, indexB) {
    const a = mappings[indexA];
    const b = mappings[indexB];
    if (!a || !b) return;
    setActiveProfileId(null);
    if (a.isLive) await mim.mapping.stop(Number(a.targetDeviceId));
    if (b.isLive) await mim.mapping.stop(Number(b.targetDeviceId));
    // Refresh before re-rendering with the swapped targets, otherwise the
    // just-freed vJoy devices are still missing from vjoyDevices and their
    // dropdown shows empty instead of the swapped value.
    await refreshVjoyDevices();

    const swappedA = { ...a, targetDeviceId: b.targetDeviceId, isLive: false, liveError: null };
    const swappedB = { ...b, targetDeviceId: a.targetDeviceId, isLive: false, liveError: null };
    setMappings((prev) => prev.map((m, i) => (i === indexA ? swappedA : i === indexB ? swappedB : m)));

    if (a.isLive) {
      const result = await mim.mapping.start(Number(swappedA.targetDeviceId));
      setMappings((prev) =>
        prev.map((m) => (m.id === swappedA.id ? { ...m, isLive: result.ok, liveError: result.ok ? null : result.error } : m))
      );
    }
    if (b.isLive) {
      const result = await mim.mapping.start(Number(swappedB.targetDeviceId));
      setMappings((prev) =>
        prev.map((m) => (m.id === swappedB.id ? { ...m, isLive: result.ok, liveError: result.ok ? null : result.error } : m))
      );
    }
    refreshVjoyDevices();
  }

  // Game profiles are a named snapshot of the current mapping cards (which
  // devices, which targets), so a whole multi-device setup can be swapped in
  // for a different game with one click instead of rebuilding it by hand.
  async function saveCurrentAsProfile() {
    const name = profileNameInput.trim();
    if (!name) return;
    const setupMappings = mappings
      .filter((m) => m.selectedIds.length > 0 && m.targetDeviceId)
      .map((m) => ({ physicalIds: m.selectedIds, targetDeviceId: m.targetDeviceId }));
    await mim.mappingSetups.create({ name, mappings: setupMappings });
    setProfileNameInput('');
    setShowSaveProfile(false);
    refreshGameProfiles();
  }

  async function applyGameProfile(setup) {
    setActiveProfileId(setup.id);
    for (const slot of mappings) {
      if (slot.isLive) await mim.mapping.stop(Number(slot.targetDeviceId));
    }
    const connectedIds = devices.map((d) => d.id);
    const newSlots = setup.mappings
      .filter((m) => m.physicalIds.every((id) => connectedIds.includes(id)))
      .map((m) => ({
        id: makeSlotId(),
        selectedIds: m.physicalIds,
        targetDeviceId: String(m.targetDeviceId),
        isLive: false,
        liveError: null
      }));
    setMappings(newSlots);
    for (const slot of newSlots) {
      const result = await mim.mapping.start(Number(slot.targetDeviceId));
      setMappings((prev) =>
        prev.map((m) => (m.id === slot.id ? { ...m, isLive: result.ok, liveError: result.ok ? null : result.error } : m))
      );
      if (result.ok) {
        mim.mappingProfiles.save({ physicalIds: slot.selectedIds, targetDeviceId: slot.targetDeviceId });
      }
    }
    setSavedMappings(await mim.mappingProfiles.list());
    refreshVjoyDevices();
  }

  async function deleteGameProfile(id) {
    if (activeProfileId === id) setActiveProfileId(null);
    await mim.mappingSetups.remove(id);
    refreshGameProfiles();
  }

  if (devices.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Mapping</h1>
          <p className="mt-1 text-sm text-mim-muted">
            Select one or more physical devices to combine onto a vJoy virtual device.
          </p>
        </div>
        <Card hover={false} className="flex flex-col items-center gap-3 px-10 py-10 text-center">
          <Gamepad2 size={28} className="text-mim-muted" />
          <p className="text-mim-muted">No physical devices detected yet.</p>
          <p className="text-xs text-mim-muted">
            Plug in a controller and move a stick or press a button. Some devices only appear after their first input.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Mapping</h1>
          <p className="mt-1 text-sm text-mim-muted">
            Select one or more physical devices to combine onto a vJoy virtual device. Add another mapping to feed a
            second vJoy device at the same time.
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={addMapping}
          className="glass-surface flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-white"
        >
          <Plus size={13} />
          Add Mapping
        </motion.button>
      </div>

      <Card hover={false} className="mb-6 p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-mim-muted">Game Profiles</span>
          <button
            onClick={() => setShowSaveProfile((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-mim-muted transition-colors hover:text-white"
          >
            <Save size={13} />
            Save current as...
          </button>
        </div>

        {showSaveProfile && (
          <div className="mb-3 flex items-center gap-2">
            <input
              autoFocus
              value={profileNameInput}
              onChange={(e) => setProfileNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveCurrentAsProfile()}
              placeholder="e.g. Star Citizen"
              className="glass-surface flex-1 rounded-md px-3 py-2 text-sm text-white outline-none"
            />
            <button
              onClick={saveCurrentAsProfile}
              disabled={!profileNameInput.trim()}
              className="glass-surface flex h-9 items-center rounded-md px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              Save
            </button>
          </div>
        )}

        {gameProfiles.length === 0 ? (
          <p className="text-sm text-mim-muted">
            No saved profiles yet. Set up your mappings below, then save them here for one-click switching per game.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {gameProfiles.map((setup) => {
              const isActive = activeProfileId === setup.id;
              return (
                <div
                  key={setup.id}
                  className={`group flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'border border-mim-accent/40 bg-mim-accent/10 text-white shadow-[0_0_10px_rgba(var(--color-mim-accent-rgb),0.15)]'
                      : 'glass-surface text-white hover:border-mim-accent/40'
                  }`}
                >
                  <button onClick={() => applyGameProfile(setup)} className="font-medium">
                    {setup.name}
                  </button>
                  <button
                    onClick={() => deleteGameProfile(setup.id)}
                    title="Delete this profile"
                    className="text-mim-muted opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {mappings.length === 0 ? (
        <Card hover={false} className="flex flex-col items-center gap-3 px-10 py-10 text-center">
          <p className="text-sm text-mim-muted">Click "Add Mapping" to forward a device to a vJoy target.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {mappings.map((slot, index) => (
            <MappingSlotCard
              key={slot.id}
              slot={slot}
              index={index}
              devices={devices}
              vjoyDevices={vjoyDevices}
              takenDevices={new Set(mappings.filter((m) => m.id !== slot.id).flatMap((m) => m.selectedIds))}
              takenTargets={new Set(
                mappings.filter((m) => m.id !== slot.id && m.targetDeviceId).map((m) => m.targetDeviceId)
              )}
              remembered={
                slot.targetDeviceId &&
                savedMappings.some(
                  (m) => sameSet(m.physicalIds, slot.selectedIds) && String(m.targetDeviceId) === slot.targetDeviceId
                )
              }
              canSwap={index < mappings.length - 1}
              onToggleDevice={(deviceId) => toggleDevice(slot.id, deviceId)}
              onSetTarget={(value) => setTarget(slot.id, value)}
              onToggleLive={() => toggleLive(slot.id)}
              onRemove={() => removeMapping(slot.id)}
              onSwapWithNext={() => swapTargets(index, index + 1)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MappingSlotCard({
  slot,
  index,
  devices,
  vjoyDevices,
  takenDevices,
  takenTargets,
  remembered,
  canSwap,
  onToggleDevice,
  onSetTarget,
  onToggleLive,
  onRemove,
  onSwapWithNext
}) {
  const selectedDevices = slot.selectedIds.map((id) => devices.find((d) => d.id === id)).filter(Boolean);
  const totalAxes = selectedDevices.reduce((sum, d) => sum + d.axes.length, 0);
  const targetOptions = vjoyDevices
    .filter((d) => {
      if (String(d.index) === slot.targetDeviceId) return true;
      if (takenTargets.has(String(d.index))) return false;
      return d.status === 'FREE';
    })
    .map((d) => ({ value: d.index, label: `vJoy Device ${d.index}` }));

  return (
    <Card hover={false} className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-mim-muted">Mapping {index + 1}</span>
        <div className="flex items-center gap-2">
          {canSwap && (
            <button
              onClick={onSwapWithNext}
              title="Swap targets with the next mapping"
              className="flex h-7 w-7 items-center justify-center rounded-md text-mim-muted transition-colors hover:bg-mim-surface-light hover:text-white"
            >
              <ArrowLeftRight size={14} />
            </button>
          )}
          <button
            onClick={onRemove}
            title="Remove this mapping"
            className="flex h-7 w-7 items-center justify-center rounded-md text-mim-muted transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-mim-muted">Forward to</span>
          <Select
            value={slot.targetDeviceId}
            onChange={onSetTarget}
            disabled={slot.isLive}
            placeholder="Select vJoy device..."
            options={targetOptions}
          />
          {remembered && <span className="text-xs text-mim-muted">Remembered from last time</span>}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {slot.isLive && (
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
            onClick={onToggleLive}
            disabled={!slot.isLive && (!slot.targetDeviceId || selectedDevices.length === 0)}
            className={`flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-semibold transition-shadow disabled:opacity-50 ${
              slot.isLive
                ? 'glass-surface text-white'
                : 'bg-[linear-gradient(135deg,#3ddb3d,#28a428)] text-mim-bg shadow-[0_4px_16px_-4px_rgba(61,219,61,0.5)]'
            }`}
          >
            {slot.isLive ? <Square size={13} /> : <Play size={13} />}
            {slot.isLive ? 'Stop' : 'Start'}
          </motion.button>
        </div>
      </div>

      {slot.liveError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {slot.liveError}
        </div>
      )}

      {totalAxes > MAX_AXES && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
          Selected devices have {totalAxes} axes combined, but a vJoy device only accepts {MAX_AXES}. The extra axes
          will be ignored.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
        <div className="flex flex-col gap-2">
          {devices.map((device) => {
            const isChecked = slot.selectedIds.includes(device.id);
            const isTakenByOther = takenDevices.has(device.id);
            return (
              <button
                key={device.id}
                onClick={() => onToggleDevice(device.id)}
                disabled={slot.isLive || isTakenByOther}
                className={`rounded-lg px-3 py-2.5 text-left text-sm transition-all disabled:opacity-50 ${
                  isChecked
                    ? 'border border-mim-accent/30 bg-mim-accent/10 text-white shadow-[0_0_10px_rgba(var(--color-mim-accent-rgb),0.15)]'
                    : 'glass-surface text-mim-muted hover:text-white'
                }`}
              >
                <p className="truncate font-medium">{device.id.split(' (')[0]}</p>
                <p className="text-xs text-mim-muted">
                  {isTakenByOther ? 'Used by another mapping' : isChecked ? 'Selected' : 'Device ' + device.index}
                </p>
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
                          className="h-full bg-mim-accent"
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
                          ? 'border-mim-accent bg-mim-accent/20 text-mim-accent'
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
    </Card>
  );
}

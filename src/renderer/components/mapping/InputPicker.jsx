import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const AXIS_NAMES = ['X', 'Y', 'Z', 'Rx', 'Ry', 'Rz', 'Sl0', 'Sl1'];
// How far an axis has to move from its Identify-start baseline before it
// counts as "this is the one", high enough to ignore stick centering drift.
const IDENTIFY_AXIS_THRESHOLD = 0.5;
// The live chip highlight can't just check "far from zero": a throttle or
// slider axis often rests away from zero by design, that isn't the axis
// being touched, it's just where it sits. What actually means "someone is
// moving this right now" is a change since the last render, so this is a
// per-tick delta threshold instead. Some hardware (small hat-style
// mini-sticks in particular) has real sensor jitter even at rest, so a
// single noisy tick isn't enough either, the delta has to hold for a couple
// of ticks in a row before it counts as real movement.
const AXIS_LIVE_DELTA = 0.06;
const AXIS_LIVE_STREAK = 2;

function describeAxis(i) {
  return AXIS_NAMES[i] ?? `A${i}`;
}

// Device-grouped instead of one flat list, so a heavy loadout (two HOTAS
// sticks, throttle, pedals, a button panel) stays scannable. `onSelect`
// receives a small descriptor object, not just the raw composite key, since
// Gamepad API device ids can contain colons themselves (vendor/product info)
// and are not safe to split back apart for display purposes.
export default function InputPicker({ devices, selectedInputKey, onSelect, boundKeys, shiftKey, onSetShiftKey }) {
  const [activeDeviceId, setActiveDeviceId] = useState(devices[0]?.id ?? null);
  const [search, setSearch] = useState('');
  // Off by default: hiding unconfigured inputs helps once a panel has dozens
  // of buttons, but as a starting default it just makes inputs look like
  // they've vanished before anything has been set up yet.
  const [configuredOnly, setConfiguredOnly] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [identifyStatus, setIdentifyStatus] = useState('');
  const baselineRef = useRef(null);
  const prevAxisValuesRef = useRef({});
  const axisLiveStreakRef = useRef({});

  const device = devices.find((d) => d.id === activeDeviceId) ?? devices[0];

  // Recomputes each axis's "moving" streak against last tick's value, then
  // stores this tick's values for the next comparison. A single noisy
  // sample only bumps the streak by one, it takes AXIS_LIVE_STREAK
  // consecutive ticks of real movement before isAxisLive() lights anything up.
  useEffect(() => {
    const prevValues = prevAxisValuesRef.current;
    const prevStreaks = axisLiveStreakRef.current;
    const nextValues = {};
    const nextStreaks = {};
    for (const d of devices) {
      d.axes.forEach((v, i) => {
        const key = `${d.id}:axis:${i}`;
        const prev = prevValues[key];
        const moved = prev !== undefined && Math.abs(v - prev) > AXIS_LIVE_DELTA;
        nextStreaks[key] = moved ? (prevStreaks[key] ?? 0) + 1 : 0;
        nextValues[key] = v;
      });
    }
    prevAxisValuesRef.current = nextValues;
    axisLiveStreakRef.current = nextStreaks;
  }, [devices]);

  function isAxisLive(key) {
    return (axisLiveStreakRef.current[key] ?? 0) >= AXIS_LIVE_STREAK;
  }

  function selectAxis(d, i) {
    onSelect({
      key: `${d.id}:axis:${i}`,
      deviceId: d.id,
      deviceLabel: d.id.split(' (')[0],
      kind: 'axis',
      index: i,
      inputLabel: `Axis ${describeAxis(i)}`
    });
  }

  function selectButton(d, i) {
    onSelect({
      key: `${d.id}:button:${i}`,
      deviceId: d.id,
      deviceLabel: d.id.split(' (')[0],
      kind: 'button',
      index: i,
      inputLabel: `Button ${i + 1}`
    });
  }

  function startIdentify() {
    baselineRef.current = new Map(devices.map((d) => [d.id, { axes: [...d.axes], buttons: d.buttons.map((b) => b.pressed) }]));
    setIdentifying(true);
    setIdentifyStatus('Move an axis or press a button on any connected device...');
  }

  // Runs on every tick's fresh gamepad snapshot (devices re-renders at ~60Hz
  // from Mapping.jsx while any mapping is live, and at least on every poll
  // otherwise) comparing against the baseline captured when Identify started.
  useEffect(() => {
    if (!identifying) return;
    const baseline = baselineRef.current;
    for (const d of devices) {
      const base = baseline?.get(d.id);
      if (!base) continue;
      for (let i = 0; i < d.axes.length; i++) {
        if (Math.abs(d.axes[i] - (base.axes[i] ?? 0)) > IDENTIFY_AXIS_THRESHOLD) {
          setActiveDeviceId(d.id);
          setConfiguredOnly(false);
          selectAxis(d, i);
          setIdentifying(false);
          setIdentifyStatus(`Detected: ${d.id.split(' (')[0]}, Axis ${describeAxis(i)}`);
          return;
        }
      }
      for (let i = 0; i < d.buttons.length; i++) {
        if (d.buttons[i].pressed && !base.buttons[i]) {
          setActiveDeviceId(d.id);
          setConfiguredOnly(false);
          selectButton(d, i);
          setIdentifying(false);
          setIdentifyStatus(`Detected: ${d.id.split(' (')[0]}, Button ${i + 1}`);
          return;
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices, identifying]);

  useEffect(() => {
    if (!identifyStatus || identifying) return;
    const t = setTimeout(() => setIdentifyStatus(''), 3000);
    return () => clearTimeout(t);
  }, [identifyStatus, identifying]);

  if (!device) {
    return <p className="text-sm text-mim-muted">No physical devices detected yet.</p>;
  }

  const q = search.trim().toLowerCase();
  const passesFilter = (key, label) =>
    (!q || label.toLowerCase().includes(q)) && (!configuredOnly || boundKeys.has(key) || key === selectedInputKey);

  const axisItems = device.axes
    .map((_, i) => ({ i, key: `${device.id}:axis:${i}`, label: describeAxis(i) }))
    .filter((item) => passesFilter(item.key, item.label));
  const buttonItems = device.buttons
    .map((_, i) => ({ i, key: `${device.id}:button:${i}`, label: `Btn ${i + 1}` }))
    .filter((item) => passesFilter(item.key, item.label));
  const totalInputs = device.axes.length + device.buttons.length;
  const isEmpty = axisItems.length === 0 && buttonItems.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {devices.map((d) => (
          <button
            key={d.id}
            onClick={() => {
              setActiveDeviceId(d.id);
              setSearch('');
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              d.id === device.id ? 'border border-mim-accent/40 bg-mim-accent/10 text-white' : 'glass-surface text-mim-muted hover:text-white'
            }`}
          >
            {d.id.split(' (')[0]}
            <span className="rounded-full bg-white/10 px-1.5 text-[10px] font-semibold text-mim-muted">
              {d.axes.length + d.buttons.length}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search this device's inputs..."
          className="glass-surface min-w-[160px] flex-1 rounded-md px-3 py-1.5 text-xs text-white outline-none"
        />
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-mim-muted">
          <input type="checkbox" checked={configuredOnly} onChange={(e) => setConfiguredOnly(e.target.checked)} className="accent-mim-accent" />
          Configured only
        </label>
        <button
          onClick={startIdentify}
          disabled={identifying}
          className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-default ${
            identifying ? 'bg-amber-500/15 text-amber-300' : 'bg-mim-accent/10 text-mim-accent hover:bg-mim-accent/20'
          }`}
        >
          {identifying ? 'Listening...' : 'Identify'}
        </button>
      </div>
      {identifyStatus && <p className="text-xs text-mim-muted">{identifyStatus}</p>}

      {isEmpty ? (
        <p className="text-sm text-mim-muted">
          No configured inputs on this device yet.{' '}
          <button onClick={() => setConfiguredOnly(false)} className="text-mim-accent underline underline-offset-2">
            Show all {totalInputs}
          </button>
        </p>
      ) : (
        <>
          {device.axes.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-mim-muted">Axes</p>
              {axisItems.length === 0 ? (
                <p className="text-xs text-mim-muted">
                  No configured axes yet.{' '}
                  <button onClick={() => setConfiguredOnly(false)} className="text-mim-accent underline underline-offset-2">
                    Show all {device.axes.length}
                  </button>
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {axisItems.map((item) => (
                    <InputChip
                      key={item.key}
                      label={item.label}
                      active={item.key === selectedInputKey}
                      bound={boundKeys.has(item.key)}
                      live={isAxisLive(item.key)}
                      onClick={() => selectAxis(device, item.i)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          {device.buttons.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-mim-muted">Buttons</p>
              {buttonItems.length === 0 ? (
                <p className="text-xs text-mim-muted">
                  No configured buttons yet.{' '}
                  <button onClick={() => setConfiguredOnly(false)} className="text-mim-accent underline underline-offset-2">
                    Show all {device.buttons.length}
                  </button>
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {buttonItems.map((item) => (
                    <InputChip
                      key={item.key}
                      label={item.label}
                      active={item.key === selectedInputKey}
                      bound={boundKeys.has(item.key)}
                      isShift={item.key === shiftKey}
                      live={device.buttons[item.i]?.pressed}
                      onClick={() => selectButton(device, item.i)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// `live` comes straight from the same Gamepad API poll Mapping.jsx already
// runs (devices refreshes ~60Hz): true for a button currently held, or an
// axis currently deflected past AXIS_LIVE_THRESHOLD. Either way, physically
// touching the real hardware lights it up here immediately, no need to jump
// over to Live Mapping just to work out which numbered input is which.
function InputChip({ label, active, bound, isShift, live, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      title={isShift ? `${label} is your Shift key` : undefined}
      animate={live ? { scale: 1.08 } : { scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        live
          ? 'border border-mim-accent bg-mim-accent/25 text-white shadow-[0_0_12px_rgba(var(--color-mim-accent-rgb),0.6)]'
          : active
            ? 'border border-mim-accent/40 bg-mim-accent/10 text-white'
            : isShift
              ? 'border border-amber-500/40 bg-amber-500/10 text-amber-200'
              : 'glass-surface text-mim-muted hover:text-white'
      }`}
    >
      {bound && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mim-accent" />}
      {label}
    </motion.button>
  );
}

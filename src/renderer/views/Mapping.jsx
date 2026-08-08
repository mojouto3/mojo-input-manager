import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gamepad2, Play, Square, Plus, X, ArrowLeftRight, Save, Trash2, SlidersHorizontal } from 'lucide-react';
import Card from '../components/Card';
import Badge from '../components/Badge';
import Select from '../components/Select';
import Toggle from '../components/Toggle';
import Tabs from '../components/Tabs';
import AdvancedMappingTab from '../components/mapping/AdvancedMappingTab';
import { shapeValue as shapeAxis, createModeRuntime, DEFAULT_MODE_ID, classifyHatDirection } from '../lib/mappingEngine';

const mim = typeof window !== 'undefined' ? window.mim : undefined;
const MAX_AXES = 8;
// requestAnimationFrame only fires when the window is actually being painted,
// which Windows stops doing for a truly minimized (not just hidden/tray'd)
// window. setInterval is a plain timer with no such dependency, so mapping
// keeps feeding vJoy no matter how the window is put aside.
const TICK_INTERVAL_MS = 16;
// How long a resolved "tap" stays asserted on its vJoy button. The physical
// button is already back up by the time a press can be classified as a tap
// (that's only known once the button releases), so this is a synthetic
// pulse rather than a mirror of the real press duration.
const TEMPO_TAP_PULSE_MS = 90;

// vJoy virtual devices (vendor 1234 / product bead) present themselves as regular
// HID joysticks too, so the Gamepad API reports them alongside real physical devices.
// They must be excluded here or the app could end up "mapping" a vJoy device to itself.
const VJOY_ID_PATTERN = /vjoy|1234.*bead/i;

// Matches the axis order vjoyInterface.js feeds to vJoy (X, Y, Z, RX, RY, RZ, SL0, SL1).
const AXIS_NAMES = ['X', 'Y', 'Z', 'Rx', 'Ry', 'Rz', 'Sl0', 'Sl1'];

function sameSet(a, b) {
  return a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
}

const DEFAULT_AXIS_SETTINGS = { invert: false, deadzone: 0, curve: 1 };

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

// Releases whatever real keyboard keys / mouse buttons a Macro's playback
// state still has held down, a vJoy output needs no equivalent cleanup (see
// the tick() comment where this is called from).
function releaseMacroSideEffects(state) {
  if (!state) return;
  for (const keyCode of state.downKeys ?? []) mim.input.sendKey(keyCode, false);
  for (const button of state.downMouse ?? []) mim.input.sendMouseButton(button, false);
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
  const [axisSettingsMap, setAxisSettingsMap] = useState({});
  const [activeModeId, setActiveModeId] = useState(DEFAULT_MODE_ID);
  const [mappingTab, setMappingTab] = useState('live');
  // Snapshot of currently-asserted vJoy output indices per inputKey, for
  // whichever inputs have a Macro (or Tempo/Hat Buttons) pipeline actively
  // holding an output right now. Lets the Advanced Mapping editor show live
  // "this output is on right now" feedback in-app, instead of the user
  // needing Windows' own Game Controllers properties panel open to see it.
  const [activeOutputs, setActiveOutputs] = useState({});
  const activeOutputsRef = useRef({});
  const mappingsRef = useRef([]);
  const axisSettingsRef = useRef({});
  const autoRestoredRef = useRef(false);
  // Advanced-mapping runtime for whichever saved game profile is currently
  // applied (see applyGameProfile). Rebuilt whenever the active profile or
  // its saved data changes; null means "no advanced profile active", in
  // which case every input just falls back to the legacy axisSettingsMap path.
  const runtimeRef = useRef(null);
  // A Change Mode action writes here instead of mutating the runtime mid-tick;
  // it's applied once at the very end of tick(), i.e. starting next tick, so
  // every input this tick still resolves against one consistent mode.
  const pendingModeChangeRef = useRef(null);
  const prevButtonsRef = useRef(new Map());
  // Per-button Tempo (tap vs. hold) state: { pressStart, resolved, pulseUntil }
  // keyed by inputKey, or absent/null between presses.
  const tempoStateRef = useRef(new Map());
  // Per-button Macro playback state: { stepIndex, nextAt, held } keyed by
  // inputKey. held is the Set of vJoy output indices the macro currently
  // has asserted, re-applied every tick for as long as they're meant to stay
  // pressed, not just at the instant a "press" step fires.
  const macroStateRef = useRef(new Map());

  useEffect(() => {
    axisSettingsRef.current = axisSettingsMap;
  }, [axisSettingsMap]);

  useEffect(() => {
    mim?.axisSettings?.getAll().then((data) => setAxisSettingsMap(data ?? {}));
  }, []);

  async function setAxisSetting(deviceId, axisIndex, settings) {
    setAxisSettingsMap((prev) => ({ ...prev, [deviceId]: { ...(prev[deviceId] ?? {}), [axisIndex]: settings } }));
    await mim?.axisSettings?.set(deviceId, axisIndex, settings);
  }

  function refreshGameProfiles() {
    mim?.mappingSetups?.list().then((list) => setGameProfiles(list ?? []));
  }

  useEffect(() => {
    mappingsRef.current = mappings;
  }, [mappings]);

  // Rebuilds the advanced-mapping runtime whenever the active game profile
  // (or its saved modes/library/sequences/bindings) changes. A profile with
  // no advanced data still normalizes to an implicit single "base" mode with
  // no bindings, so getPipeline() just returns null for everything and every
  // input falls through to the legacy per-axis-settings path below.
  useEffect(() => {
    if (!activeProfileId) {
      runtimeRef.current = null;
      setActiveModeId(DEFAULT_MODE_ID);
      return;
    }
    const setup = gameProfiles.find((p) => p.id === activeProfileId);
    runtimeRef.current = setup ? createModeRuntime(setup) : null;
    setActiveModeId(runtimeRef.current?.activeModeId ?? DEFAULT_MODE_ID);
  }, [activeProfileId, gameProfiles]);

  useEffect(() => {
    function tick() {
      const pads = readGamepads();
      setDevices(pads);
      const runtime = runtimeRef.current;
      // Per-inputKey vJoy output indices actually asserted this tick, for
      // whichever pipeline kind computes something other than a plain mirror
      // of the physical input (Hat Buttons, Tempo, Macro). Compared against
      // the previous tick's snapshot below so the Advanced Mapping editor
      // only re-renders when what's live actually changes.
      const tickActiveOutputs = {};

      for (const slot of mappingsRef.current) {
        if (!slot.isLive || !slot.targetDeviceId) continue;
        const active = slot.selectedIds.map((id) => pads.find((d) => d.id === id)).filter(Boolean);
        if (active.length === 0) continue;

        // buttonsOut is declared before the axes loop because a Hat Buttons
        // axis (see below) writes into it too, not just the buttons loop
        // further down. reservedOutputs tracks every vJoy button slot any
        // pipeline explicitly claims (Hat Buttons, Tempo, or a plain "presses
        // vJoy button N"), so the positional fallback for everything else
        // never recycles the same slot and stomps a value some other input
        // just wrote this same tick.
        const buttonsOut = [];
        const reservedOutputs = new Set();
        const now = Date.now();

        // Combine every selected device's axes, in selection order, into one
        // payload, same as before. Each axis first checks whether the active
        // mode binds it to an advanced-mapping sequence; if not, it falls
        // back to the legacy invert/deadzone/curve settings exactly as it
        // always has. An axis whose pipeline is a calibrated Hat Buttons
        // action is the one exception: it never contributes a shaped value
        // to the axes array at all, it's not really an axis anymore, its
        // whole reading is redirected into buttonsOut instead.
        const axesOut = [];
        for (const d of active) {
          for (let i = 0; i < d.axes.length; i++) {
            const v = d.axes[i];
            const inputKey = `${d.id}:axis:${i}`;
            const pipeline = runtime?.getPipeline(inputKey);
            let handledAsHat = false;
            let shaped = v;
            if (pipeline) {
              for (const step of pipeline) {
                if (step.kind === 'axis') {
                  shaped = step.run(shaped);
                } else if (step.kind === 'hat') {
                  handledAsHat = true;
                  const direction = classifyHatDirection(v, step.directions);
                  const activeOutIdx = step.outputs[direction];
                  for (const [dir, outIdx] of Object.entries(step.outputs)) {
                    if (Number.isInteger(outIdx)) {
                      buttonsOut[outIdx] = dir === direction;
                      reservedOutputs.add(outIdx);
                    }
                  }
                  if (Number.isInteger(activeOutIdx)) tickActiveOutputs[inputKey] = [activeOutIdx];
                }
              }
            } else {
              shaped = shapeAxis(v, axisSettingsRef.current[d.id]?.[i]);
            }
            if (!handledAsHat) axesOut.push(shaped);
          }
        }
        const axes = axesOut.slice(0, MAX_AXES);

        // Read-only pre-scan so every button pipeline's claimed output slot
        // (a plain "presses vJoy button N", Tempo's tap/hold slots, or every
        // slot a Macro's steps could ever touch) is known before any
        // positional assignment happens below, this never touches
        // prevButtonsRef/tempoStateRef/macroStateRef, it only looks at what
        // each pipeline is capable of writing to. A Macro's slots are
        // reserved even while it isn't currently playing, since it owns
        // those outputs whenever it does run.
        for (const d of active) {
          for (let i = 0; i < d.buttons.length; i++) {
            const pipeline = runtime?.getPipeline(`${d.id}:button:${i}`);
            if (!pipeline) continue;
            for (const step of pipeline) {
              if (step.kind === 'terminal' && Number.isInteger(step.outputIndex)) reservedOutputs.add(step.outputIndex);
              else if (step.kind === 'tempo') {
                if (Number.isInteger(step.tapOutputIndex)) reservedOutputs.add(step.tapOutputIndex);
                if (Number.isInteger(step.holdOutputIndex)) reservedOutputs.add(step.holdOutputIndex);
              } else if (step.kind === 'macro') {
                for (const s of step.steps) {
                  if (Number.isInteger(s.outputIndex)) reservedOutputs.add(s.outputIndex);
                }
              }
            }
          }
        }

        // Most buttons still forward positionally (cursor-based, same order
        // as before). A button whose pipeline ends in an explicit Map to
        // vJoy target instead jumps straight to that output slot and never
        // consumes a cursor position, so everything else still shifts up to
        // fill the gap exactly as if that button had never been selected.
        // The cursor also skips any slot reservedOutputs already claims
        // (Hat Buttons or another button's explicit target), so a plain
        // unmapped button never gets positionally assigned onto a vJoy slot
        // something else is actively driving.
        let cursor = 0;
        function nextCursorSlot() {
          while (reservedOutputs.has(cursor)) cursor += 1;
          return cursor++;
        }
        for (const d of active) {
          for (let i = 0; i < d.buttons.length; i++) {
            const b = d.buttons[i];
            const inputKey = `${d.id}:button:${i}`;
            const pipeline = runtime?.getPipeline(inputKey);
            let outputIndex = null;
            let tempoHandled = false;
            let macroHandled = false;
            if (pipeline) {
              const wasPressed = prevButtonsRef.current.get(inputKey) ?? false;
              const edge = b.pressed && !wasPressed;
              const releaseEdge = !b.pressed && wasPressed;
              for (const step of pipeline) {
                if (step.kind === 'event') {
                  step.run({
                    edge,
                    releaseEdge,
                    queueModeChange: (modeId) => {
                      if (modeId) pendingModeChangeRef.current = modeId;
                    }
                  });
                } else if (step.kind === 'terminal' && Number.isInteger(step.outputIndex)) {
                  outputIndex = step.outputIndex;
                } else if (step.kind === 'tempo') {
                  tempoHandled = true;
                  let state = tempoStateRef.current.get(inputKey) ?? null;
                  if (edge) state = { pressStart: now, resolved: null, pulseUntil: 0 };
                  if (state) {
                    if (b.pressed && state.resolved === null && now - state.pressStart >= step.thresholdMs) {
                      state.resolved = 'hold';
                    }
                    if (releaseEdge) {
                      if (state.resolved === null) {
                        state.resolved = 'tap';
                        state.pulseUntil = now + TEMPO_TAP_PULSE_MS;
                      } else if (state.resolved === 'hold') {
                        state = null;
                      }
                    }
                  }
                  if (state?.resolved === 'tap' && now >= state.pulseUntil) state = null;
                  tempoStateRef.current.set(inputKey, state);
                  if (state?.resolved === 'hold' && Number.isInteger(step.holdOutputIndex)) {
                    buttonsOut[step.holdOutputIndex] = true;
                    tickActiveOutputs[inputKey] = [step.holdOutputIndex];
                  } else if (state?.resolved === 'tap' && Number.isInteger(step.tapOutputIndex)) {
                    buttonsOut[step.tapOutputIndex] = true;
                    tickActiveOutputs[inputKey] = [step.tapOutputIndex];
                  }
                } else if (step.kind === 'macro') {
                  macroHandled = true;
                  if (edge) {
                    // A re-trigger before the previous run finished must not
                    // leave a real keyboard key or mouse button stuck down
                    // system-wide (vJoy outputs don't have this problem,
                    // buttonsOut is rebuilt from scratch every tick, so an
                    // abandoned `held` entry just naturally reads as
                    // released next tick).
                    releaseMacroSideEffects(macroStateRef.current.get(inputKey));
                    macroStateRef.current.set(inputKey, { stepIndex: 0, nextAt: now, held: new Set(), downKeys: new Set(), downMouse: new Set() });
                  }
                  const state = macroStateRef.current.get(inputKey);
                  if (state) {
                    // A press/release step fires immediately (nextAt stays
                    // at now), so a run of them in a row all execute within
                    // this same tick, only a wait step actually introduces
                    // delay before the loop stops advancing.
                    while (state.stepIndex < step.steps.length && now >= state.nextAt) {
                      const s = step.steps[state.stepIndex];
                      const target = s.target ?? 'vjoy';
                      if (s.type === 'press') {
                        if (target === 'vjoy') state.held.add(s.outputIndex);
                        else if (target === 'key') { state.downKeys.add(s.keyCode); mim.input.sendKey(s.keyCode, true); }
                        else if (target === 'mouse') { state.downMouse.add(s.mouseButton); mim.input.sendMouseButton(s.mouseButton, true); }
                      } else if (s.type === 'release') {
                        if (target === 'vjoy') state.held.delete(s.outputIndex);
                        else if (target === 'key') { state.downKeys.delete(s.keyCode); mim.input.sendKey(s.keyCode, false); }
                        else if (target === 'mouse') { state.downMouse.delete(s.mouseButton); mim.input.sendMouseButton(s.mouseButton, false); }
                      } else if (s.type === 'wait') {
                        state.nextAt = now + s.ms;
                      }
                      state.stepIndex += 1;
                    }
                    for (const idx of state.held) buttonsOut[idx] = true;
                    if (state.held.size > 0) tickActiveOutputs[inputKey] = [...state.held];
                    if (state.stepIndex >= step.steps.length && state.held.size === 0 && state.downKeys.size === 0 && state.downMouse.size === 0) {
                      macroStateRef.current.delete(inputKey);
                    }
                  }
                }
              }
              prevButtonsRef.current.set(inputKey, b.pressed);
            }
            if (tempoHandled || macroHandled) {
              // Tempo/Macro already wrote their own output slot(s) above;
              // this physical button never also occupies a positional slot.
            } else if (outputIndex !== null) {
              buttonsOut[outputIndex] = b.pressed;
            } else {
              buttonsOut[nextCursorSlot()] = b.pressed;
            }
          }
        }
        const buttons = Array.from({ length: buttonsOut.length }, (_, i) => buttonsOut[i] ?? false);

        mim.mapping.feed({ deviceId: Number(slot.targetDeviceId), axes, buttons });
      }

      if (runtime && pendingModeChangeRef.current) {
        runtime.setActiveMode(pendingModeChangeRef.current);
        setActiveModeId(runtime.activeModeId);
        pendingModeChangeRef.current = null;
      }

      const prevKeys = Object.keys(activeOutputsRef.current);
      const nextKeys = Object.keys(tickActiveOutputs);
      const changed =
        prevKeys.length !== nextKeys.length ||
        nextKeys.some((k) => activeOutputsRef.current[k]?.join() !== tickActiveOutputs[k].join());
      if (changed) {
        activeOutputsRef.current = tickActiveOutputs;
        setActiveOutputs(tickActiveOutputs);
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
      for (const state of macroStateRef.current.values()) releaseMacroSideEffects(state);
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

  const activeProfile = gameProfiles.find((p) => p.id === activeProfileId);
  const noDevices = devices.length === 0;

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
        {mappingTab === 'live' && (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={addMapping}
            className="glass-surface flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-white"
          >
            <Plus size={13} />
            Add Mapping
          </motion.button>
        )}
      </div>

      <Tabs
        activeTab={mappingTab}
        onChange={setMappingTab}
        tabs={[
          { id: 'live', label: 'Live Mapping' },
          { id: 'advanced', label: 'Advanced Mapping' }
        ]}
      />

      {/*
        The Advanced Mapping pane stays mounted permanently once a profile is
        selected (toggled with a plain className instead of being swapped in
        and out by AnimatePresence's key). Keying it to mappingTab used to
        unmount/remount AdvancedMappingTab on every tab switch, which
        re-initialized its local editing state from the gameProfiles snapshot
        at that instant, if a save's IPC round trip hadn't landed yet, the
        remount would silently resurrect a stale, pre-edit copy of the
        profile, undoing whatever was just captured (Hat Buttons calibration
        was the case that surfaced it).
      */}
      <AnimatePresence mode="wait">
        {mappingTab === 'live' && (
          <motion.div
            key="live"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {noDevices ? (
              <Card hover={false} className="flex flex-col items-center gap-3 px-10 py-10 text-center">
                <Gamepad2 size={28} className="text-mim-muted" />
                <p className="text-mim-muted">No physical devices detected yet.</p>
                <p className="text-xs text-mim-muted">
                  Plug in a controller and move a stick or press a button. Some devices only appear after their first input.
                </p>
              </Card>
            ) : (
              <>
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
                      axisSettingsMap={axisSettingsMap}
                      onSetAxisSetting={setAxisSetting}
                    />
                  ))}
                </div>
              )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className={mappingTab === 'advanced' ? 'block' : 'hidden'}>
        {activeProfile ? (
          <AdvancedMappingTab profile={activeProfile} devices={devices} activeOutputs={activeOutputs} onSaved={refreshGameProfiles} />
        ) : (
          <Card hover={false} className="flex flex-col items-center gap-3 px-10 py-10 text-center">
            <p className="text-sm text-mim-muted">
              Save a game profile in Live Mapping first, then come back here to add modes and advanced actions to it.
            </p>
          </Card>
        )}
      </div>
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
  onSwapWithNext,
  axisSettingsMap,
  onSetAxisSetting
}) {
  const [expandedAxis, setExpandedAxis] = useState(null);
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
                  {device.axes.map((rawValue, i) => {
                    const settings = axisSettingsMap[device.id]?.[i] ?? DEFAULT_AXIS_SETTINGS;
                    const value = shapeAxis(rawValue, settings);
                    const axisKey = `${device.id}::${i}`;
                    const isExpanded = expandedAxis === axisKey;
                    return (
                      <div key={i}>
                        <div className="flex items-center gap-3">
                          <span className="w-8 text-xs text-mim-muted">{AXIS_NAMES[i] ?? `A${i}`}</span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-mim-surface-light">
                            <motion.div
                              className="h-full bg-mim-accent"
                              animate={{ width: `${((value + 1) / 2) * 100}%` }}
                              transition={{ duration: 0.05 }}
                            />
                          </div>
                          <span className="w-12 text-right text-xs text-mim-muted">{value.toFixed(2)}</span>
                          <button
                            onClick={() => setExpandedAxis(isExpanded ? null : axisKey)}
                            title="Tune this axis"
                            className={`relative shrink-0 transition-colors ${
                              isExpanded ? 'text-mim-accent' : 'text-mim-muted hover:text-white'
                            }`}
                          >
                            <SlidersHorizontal size={12} />
                            {(settings.invert || settings.deadzone > 0 || settings.curve !== 1) && (
                              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-mim-accent" />
                            )}
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="mt-2 ml-11 flex flex-col gap-3 rounded-lg glass-surface p-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold uppercase tracking-wide text-mim-muted">
                                {AXIS_NAMES[i] ?? `A${i}`}
                              </span>
                              <button
                                onClick={() => onSetAxisSetting(device.id, i, { invert: false, deadzone: 0, curve: 1 })}
                                className="text-xs text-mim-muted transition-colors hover:text-white"
                              >
                                Reset
                              </button>
                            </div>
                            <div className="flex items-center justify-between text-xs text-mim-muted">
                              <span>Invert</span>
                              <Toggle
                                checked={settings.invert}
                                onChange={(v) => onSetAxisSetting(device.id, i, { ...settings, invert: v })}
                              />
                            </div>
                            <label className="flex flex-col gap-1 text-xs text-mim-muted">
                              <span className="flex justify-between">
                                <span>Deadzone</span>
                                <span>{Math.round(settings.deadzone * 100)}%</span>
                              </span>
                              <input
                                type="range"
                                min="0"
                                max="0.5"
                                step="0.01"
                                value={settings.deadzone}
                                onChange={(e) =>
                                  onSetAxisSetting(device.id, i, { ...settings, deadzone: Number(e.target.value) })
                                }
                                className="w-full accent-mim-accent"
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs text-mim-muted">
                              <span className="flex justify-between">
                                <span>Curve</span>
                                <span>{settings.curve.toFixed(1)}x</span>
                              </span>
                              <input
                                type="range"
                                min="0.3"
                                max="3"
                                step="0.1"
                                value={settings.curve}
                                onChange={(e) =>
                                  onSetAxisSetting(device.id, i, { ...settings, curve: Number(e.target.value) })
                                }
                                className="w-full accent-mim-accent"
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
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

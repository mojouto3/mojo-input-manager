import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Gamepad2 } from 'lucide-react';

const mim = typeof window !== 'undefined' ? window.mim : undefined;
import Select from '../Select';
import Toggle from '../Toggle';
import SegmentedControl from '../SegmentedControl';
import ShapePreview from './ShapePreview';
import { listButtons, describeInputKey, parseInputKey } from '../../lib/inputKeys';

const SHAPE_TYPES = [
  { value: 'responseCurve', label: 'Response Curve' },
  { value: 'deadzone', label: 'Deadzone' },
  { value: 'hatButtons', label: 'Hat Buttons' }
];

function defaultShapeConfig(type) {
  if (type === 'deadzone') return { deadzone: 0.05 };
  if (type === 'hatButtons') return { directions: {}, outputs: {} };
  return { curve: 1 };
}

function defaultActionFor(kind, index) {
  return kind === 'button' ? { type: 'mapToVjoy', config: { outputIndex: index } } : { type: 'responseCurve', config: { curve: 1 } };
}

const HAT_DIRECTIONS = [
  { key: 'up', label: 'Up' },
  { key: 'right', label: 'Right' },
  { key: 'down', label: 'Down' },
  { key: 'left', label: 'Left' },
  { key: 'neutral', label: 'Neutral (centered)' }
];

// How long a reading has to sit still before it counts as "held", not just
// passing through on the way to somewhere else.
const HAT_STABLE_MS = 300;
// How far a reading has to move from where the axis was sitting before, to
// count as "the user actually moved it" rather than mechanical noise.
const HAT_MOVE_EPSILON = 0.05;

// For hardware that reports a directional hat as a single axis with a
// handful of fixed values instead of real continuous movement (calibrated
// live per-device, there's no universal value to assume). This has to be
// hands-free: the hat springs back to idle the instant it's released, so by
// the time a hand reaches the mouse to click "capture", the reading is
// already back at idle, not the direction that was just held. One click
// starts a wizard that walks through all five directions in order; you just
// move the hat, hold each one still for a moment, and it captures itself
// and advances. The stability check runs on a real interval (not a React
// effect keyed on the value), a hat reports a small set of fixed values, so
// once it settles on one it can stay bit-for-bit identical for as long as
// it's held, an effect that only re-fires when the value changes would
// never get a second look at it.
function HatButtonsControl({ inputKey, action, devices, onChange }) {
  const config = action?.config ?? { directions: {}, outputs: {} };
  const directions = config.directions ?? {};
  const outputs = config.outputs ?? {};

  const parsed = parseInputKey(inputKey);
  const device = parsed ? devices.find((d) => d.id === parsed.deviceId) : null;
  const liveValue = device ? device.axes[parsed.index] : undefined;

  const [stepIndex, setStepIndex] = useState(-1);
  const [phase, setPhase] = useState('waiting');
  const running = stepIndex >= 0;

  const liveValueRef = useRef(liveValue);
  liveValueRef.current = liveValue;
  const latestRef = useRef();
  latestRef.current = { onChange, config, directions };
  const trackRef = useRef({ baseline: null, anchor: null, since: 0 });
  // Captured once, from the very first reading of a run (before the user has
  // touched anything), so every later step can tell "this settled on idle,
  // the hat is just passing through center on its way somewhere else" apart
  // from "this settled on the direction being calibrated".
  const idleRef = useRef(null);

  useEffect(() => {
    if (!running) return;
    if (stepIndex === 0) idleRef.current = null;
    trackRef.current = { baseline: null, anchor: null, since: 0 };
    setPhase('waiting');

    const id = setInterval(() => {
      const value = liveValueRef.current;
      if (typeof value !== 'number') return;
      if (idleRef.current === null) idleRef.current = value;
      const track = trackRef.current;

      if (track.baseline === null) {
        trackRef.current = { baseline: value, anchor: null, since: 0 };
        return;
      }
      if (track.anchor === null) {
        if (Math.abs(value - track.baseline) <= HAT_MOVE_EPSILON) return;
        trackRef.current = { ...track, anchor: value, since: Date.now() };
        setPhase('holding');
        return;
      }
      if (Math.abs(value - track.anchor) > HAT_MOVE_EPSILON) {
        trackRef.current = { ...track, anchor: value, since: Date.now() };
        return;
      }
      if (Date.now() - track.since < HAT_STABLE_MS) return;

      const dirKey = HAT_DIRECTIONS[stepIndex].key;

      // Settled, but on idle, while calibrating a direction other than
      // Neutral, that's the hat passing back through center between two
      // directions, not a real hold. Keep waiting instead of capturing it.
      if (dirKey !== 'neutral' && Math.abs(value - idleRef.current) <= HAT_MOVE_EPSILON) {
        trackRef.current = { baseline: value, anchor: null, since: 0 };
        setPhase('waiting');
        return;
      }

      const { onChange: change, config: cfg, directions: dirs } = latestRef.current;
      change({ type: 'hatButtons', config: { ...cfg, directions: { ...dirs, [dirKey]: value } } });
      setStepIndex(stepIndex + 1 < HAT_DIRECTIONS.length ? stepIndex + 1 : -1);
    }, 50);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, stepIndex]);

  function setOutput(dirKey, outIdx) {
    onChange({ type: 'hatButtons', config: { ...config, outputs: { ...outputs, [dirKey]: outIdx } } });
  }

  const allCaptured = HAT_DIRECTIONS.every((d) => typeof directions[d.key] === 'number');
  const currentLabel = running ? HAT_DIRECTIONS[stepIndex].label : null;

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-mim-muted">
          {running
            ? phase === 'waiting'
              ? `Move the hat to ${currentLabel} now...`
              : `Hold it there${typeof liveValue === 'number' ? ` (${liveValue.toFixed(3)})` : ''}...`
            : 'One click, then just move the hat through each direction in order.'}
        </p>
        {running ? (
          <button onClick={() => setStepIndex(-1)} className="shrink-0 text-xs font-medium text-mim-muted underline underline-offset-2 hover:text-white">
            Cancel
          </button>
        ) : (
          <button
            onClick={() => setStepIndex(0)}
            className="shrink-0 rounded-full bg-mim-accent/15 px-3 py-1.5 text-xs font-semibold text-mim-accent"
          >
            {allCaptured ? 'Recalibrate' : 'Start Calibration'}
          </button>
        )}
      </div>

      {HAT_DIRECTIONS.map((d, i) => {
        const captured = directions[d.key];
        const isCurrent = running && i === stepIndex;
        return (
          <div key={d.key} className="flex flex-wrap items-center gap-2">
            <span className="w-36 shrink-0 text-sm text-mim-muted">{d.label}</span>
            <span
              className={`w-32 shrink-0 rounded-full px-3 py-1.5 text-center text-xs font-semibold ${
                isCurrent
                  ? 'animate-pulse bg-amber-500/20 text-amber-300'
                  : typeof captured === 'number'
                    ? 'bg-mim-accent/15 text-mim-accent'
                    : 'glass-surface text-mim-muted'
              }`}
            >
              {isCurrent
                ? phase === 'waiting'
                  ? 'Waiting for movement...'
                  : 'Holding...'
                : typeof captured === 'number'
                  ? `Captured (${captured.toFixed(2)})`
                  : 'Not captured yet'}
            </span>
            {d.key !== 'neutral' && (
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-sm text-mim-muted">presses</span>
                <Select value={outputs[d.key] ?? ''} onChange={(v) => setOutput(d.key, Number(v))} options={VJOY_BUTTON_OPTIONS} placeholder="pick vJoy button..." />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Axis-only: "reshape it" (Response Curve), "add a deadzone", or, for
// hardware that needs it, "Hat Buttons". Change Mode is never presented
// here, it's how a condition works under the hood, not something anyone picks.
function ShapeControl({ inputKey, action, devices, layoutId, onChange }) {
  const type = action?.type ?? 'responseCurve';
  const config = action?.config ?? defaultShapeConfig(type);

  return (
    <div className="flex w-full flex-wrap items-center gap-3">
      <SegmentedControl
        layoutId={layoutId}
        options={SHAPE_TYPES}
        value={type}
        onChange={(t) => {
          if (t === type) return;
          // Switching shape type used to just throw the current config away,
          // so bouncing over to Deadzone to compare and back to Hat Buttons
          // silently wiped a whole calibration. Now the outgoing type's
          // config is stashed on the action itself and restored if the user
          // comes back to it, only a genuinely new type gets the blank default.
          const shapeStash = { ...(action?.shapeStash ?? {}), [type]: config };
          onChange({ type: t, config: shapeStash[t] ?? defaultShapeConfig(t), shapeStash });
        }}
      />
      {type === 'responseCurve' && (
        <>
          <ShapePreview config={{ curve: config.curve ?? 1 }} />
          <input
            type="range"
            min="0.3"
            max="3"
            step="0.1"
            value={config.curve ?? 1}
            onChange={(e) => onChange({ type, config: { curve: Number(e.target.value) } })}
            className="w-28 accent-mim-accent"
          />
          <span className="w-10 shrink-0 text-right text-xs text-mim-muted">{(config.curve ?? 1).toFixed(1)}x</span>
        </>
      )}
      {type === 'deadzone' && (
        <>
          <ShapePreview config={{ deadzone: config.deadzone ?? 0 }} />
          <input
            type="range"
            min="0"
            max="0.5"
            step="0.01"
            value={config.deadzone ?? 0}
            onChange={(e) => onChange({ type, config: { deadzone: Number(e.target.value) } })}
            className="w-28 accent-mim-accent"
          />
          <span className="w-10 shrink-0 text-right text-xs text-mim-muted">{Math.round((config.deadzone ?? 0) * 100)}%</span>
        </>
      )}
      {type === 'hatButtons' && <HatButtonsControl inputKey={inputKey} action={action} devices={devices} onChange={onChange} />}
    </div>
  );
}

// vJoy virtual devices support up to 32 buttons, matching the same range the
// rest of the app already assumes (MAX_AXES-style constant for axes exists
// in Mapping.jsx, this is that same ceiling for buttons).
const VJOY_BUTTON_OPTIONS = Array.from({ length: 32 }, (_, i) => ({ value: i, label: `vJoy Button ${i + 1}` }));

const BUTTON_TYPES = [
  { value: 'mapToVjoy', label: 'Single Press' },
  { value: 'tempo', label: 'Tap / Hold' }
];

function defaultButtonAction(type) {
  return type === 'tempo'
    ? { type: 'tempo', config: { thresholdMs: 250, tapOutputIndex: 0, holdOutputIndex: 1 } }
    : { type: 'mapToVjoy', config: { outputIndex: 0 } };
}

// Button-only. Either a single vJoy button it presses (browsed the same
// dropdown way the trigger picker in a condition already works), or a
// Tempo: a quick tap and a press held past a threshold land on two
// different vJoy buttons, still described as one sentence, not a separate
// menu, since Tempo is just a different flavor of "what this button does".
function ButtonControl({ action, layoutId, onChange }) {
  const type = action?.type === 'tempo' ? 'tempo' : 'mapToVjoy';
  const config = action?.config ?? {};

  return (
    <div className="flex flex-wrap items-center gap-3">
      <SegmentedControl layoutId={layoutId} options={BUTTON_TYPES} value={type} onChange={(t) => onChange(defaultButtonAction(t))} />
      {type === 'mapToVjoy' && (
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-sm text-mim-muted">presses</span>
          <Select
            value={config.outputIndex ?? 0}
            onChange={(v) => onChange({ type: 'mapToVjoy', config: { outputIndex: Number(v) } })}
            options={VJOY_BUTTON_OPTIONS}
          />
        </span>
      )}
      {type === 'tempo' && (
        <>
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-sm text-mim-muted">tap presses</span>
            <Select
              value={config.tapOutputIndex ?? 0}
              onChange={(v) => onChange({ type: 'tempo', config: { ...config, tapOutputIndex: Number(v) } })}
              options={VJOY_BUTTON_OPTIONS}
            />
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-sm text-mim-muted">holding presses</span>
            <Select
              value={config.holdOutputIndex ?? 1}
              onChange={(v) => onChange({ type: 'tempo', config: { ...config, holdOutputIndex: Number(v) } })}
              options={VJOY_BUTTON_OPTIONS}
            />
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-sm text-mim-muted">after</span>
            <input
              type="range"
              min="100"
              max="800"
              step="50"
              value={config.thresholdMs ?? 250}
              onChange={(e) => onChange({ type: 'tempo', config: { ...config, thresholdMs: Number(e.target.value) } })}
              className="w-24 accent-mim-accent"
            />
            <span className="w-14 shrink-0 text-right text-xs text-mim-muted">{config.thresholdMs ?? 250}ms</span>
          </span>
        </>
      )}
    </div>
  );
}

function ActionControl({ kind, inputKey, action, devices, layoutId, onChange }) {
  return kind === 'button' ? (
    <ButtonControl action={action} layoutId={layoutId} onChange={onChange} />
  ) : (
    <ShapeControl inputKey={inputKey} action={action} devices={devices} layoutId={layoutId} onChange={onChange} />
  );
}

// Everything a user sees about this input's behavior, in plain sentences:
// "Normally, [control]." then zero or more "While holding [a button],
// instead [control]." rows. No modes, bindings, or sequences appear
// anywhere, those are pure implementation detail (mappingEngine.js).
//
// If a Shift key is already designated for this profile (see the "Shift"
// tag in InputPicker), that's overwhelmingly the only trigger anyone
// actually needs (a single modifier button, matching how Gremlin profiles
// get used in practice), so it gets a plain on/off Toggle here instead of
// making the user re-pick a trigger from a dropdown for every input.
export default function RuleCard({
  inputKey,
  inputLabel,
  inputKind,
  inputIndex,
  rule,
  devices,
  shiftKey,
  onSetShiftKey,
  onSetBase,
  onClearBase,
  onSetCondition,
  onRemoveCondition
}) {
  const [pickingTrigger, setPickingTrigger] = useState('');

  const isShiftKey = shiftKey === inputKey;
  const shiftCondition = shiftKey ? rule.conditions.find((c) => c.triggerKey === shiftKey) : null;
  const otherConditions = rule.conditions.filter((c) => c.triggerKey !== shiftKey);
  const canUseShift = shiftKey && !isShiftKey;

  const triggerOptions = listButtons(devices).filter((b) => b.key !== inputKey && b.key !== shiftKey);

  function addCondition(triggerKey) {
    if (!triggerKey) return;
    onSetCondition(triggerKey, defaultActionFor(inputKind, inputIndex));
    setPickingTrigger('');
  }

  function toggleShift(on) {
    if (on) onSetCondition(shiftKey, defaultActionFor(inputKind, inputIndex));
    else onRemoveCondition(shiftCondition.triggerModeId);
  }

  return (
    <motion.div layout className="flex flex-col gap-4">
      <motion.div
        key={inputKey}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="rules-header flex items-center justify-between gap-3"
      >
        <h3 className="text-sm font-semibold text-white">{inputLabel}</h3>
        <button
          onClick={() => mim?.system?.openGameControllers()}
          title="Open Windows' Game Controllers list to watch the live vJoy output"
          className="glass-surface flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-mim-muted transition-colors hover:text-white"
        >
          <Gamepad2 size={12} />
          Test in Windows
        </button>
      </motion.div>

      {inputKind === 'button' && (
        <motion.div layout className="flex items-center gap-3 rounded-xl border border-dashed border-mim-border p-3">
          <Toggle checked={isShiftKey} onChange={(on) => onSetShiftKey(on ? inputKey : null)} />
          <span className="text-sm text-mim-muted">
            Use as your <span className="font-semibold text-white">Shift key</span>, hold it to change what other inputs do.
          </span>
        </motion.div>
      )}

      <motion.div layout className="flex flex-wrap items-start gap-3 rounded-xl border border-mim-border bg-mim-surface-light/40 p-3">
        <span className="shrink-0 pt-1.5 text-sm text-mim-muted">Normally,</span>
        <AnimatePresence mode="wait" initial={false}>
          {rule.base ? (
            <motion.div
              key="customized"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 6 }}
              transition={{ duration: 0.15 }}
              className="flex flex-1 flex-wrap items-center gap-3"
            >
              <ActionControl kind={inputKind} inputKey={inputKey} action={rule.base} devices={devices} layoutId={`base-${inputKey}`} onChange={onSetBase} />
              <button onClick={onClearBase} className="ml-auto shrink-0 text-xs text-mim-muted underline underline-offset-2 hover:text-white">
                Reset
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="default"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 6 }}
              transition={{ duration: 0.15 }}
              className="flex flex-1 items-center gap-3"
            >
              <span className="text-sm text-mim-muted">{inputKind === 'button' ? 'presses the matching vJoy button.' : 'passes through unchanged.'}</span>
              <button
                onClick={() => onSetBase(defaultActionFor(inputKind, inputIndex))}
                className="ml-auto shrink-0 text-xs font-semibold text-mim-accent underline underline-offset-2"
              >
                Customize
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence initial={false}>
        {canUseShift && (
          <motion.div
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-start gap-3 rounded-xl border border-dashed border-amber-500/30 bg-amber-500/[0.06] p-3">
              <span className="shrink-0 pt-1.5 text-sm text-mim-muted">Shift version</span>
              <Toggle checked={Boolean(shiftCondition)} onChange={toggleShift} />
              <AnimatePresence initial={false}>
                {shiftCondition && (
                  <motion.div
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6 }}
                    transition={{ duration: 0.15 }}
                  >
                    <ActionControl kind={inputKind} inputKey={inputKey} action={shiftCondition.action} devices={devices} layoutId={`shift-${inputKey}`} onChange={(next) => onSetCondition(shiftKey, next)} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {otherConditions.map((c) => (
          <motion.div
            key={c.triggerModeId}
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-start gap-3 rounded-xl border border-dashed border-amber-500/30 bg-amber-500/[0.06] p-3">
              <span className="shrink-0 pt-1.5 text-sm text-mim-muted">While holding</span>
              <span className="shrink-0 rounded-full bg-white/8 px-3 py-1 text-xs font-semibold text-white">{describeInputKey(devices, c.triggerKey)}</span>
              <span className="shrink-0 pt-1.5 text-sm text-mim-muted">instead,</span>
              <ActionControl kind={inputKind} inputKey={inputKey} action={c.action} devices={devices} layoutId={`cond-${c.triggerModeId}-${inputKey}`} onChange={(next) => onSetCondition(c.triggerKey, next)} />
              <button onClick={() => onRemoveCondition(c.triggerModeId)} title="Remove this condition" className="ml-auto shrink-0 pt-1 text-mim-muted transition-colors hover:text-red-400">
                <X size={14} />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <motion.div layout>
        <Select
          value={pickingTrigger}
          onChange={addCondition}
          options={triggerOptions.map((b) => ({ value: b.key, label: b.label }))}
          placeholder={shiftKey ? '+ Add another condition...' : '+ Add a condition...'}
          className="w-fit border border-dashed border-mim-border"
        />
      </motion.div>

      <p className="text-xs text-mim-muted">No modes, no bindings, no sequences, just what this input does, and when it does something different.</p>
    </motion.div>
  );
}

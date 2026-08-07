import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Gamepad2 } from 'lucide-react';

const mim = typeof window !== 'undefined' ? window.mim : undefined;
import Select from '../Select';
import Toggle from '../Toggle';
import SegmentedControl from '../SegmentedControl';
import ShapePreview from './ShapePreview';
import { listButtons, describeInputKey } from '../../lib/inputKeys';

const SHAPE_TYPES = [
  { value: 'responseCurve', label: 'Response Curve' },
  { value: 'deadzone', label: 'Deadzone' }
];

function defaultShapeConfig(type) {
  return type === 'deadzone' ? { deadzone: 0.05 } : { curve: 1 };
}

function defaultActionFor(kind, index) {
  return kind === 'button' ? { type: 'mapToVjoy', config: { outputIndex: index } } : { type: 'responseCurve', config: { curve: 1 } };
}

// Axis-only: "reshape it" (Response Curve) or "add a deadzone". Change Mode
// is never presented here, it's how a condition works under the hood, not
// something anyone picks.
function ShapeControl({ action, layoutId, onChange }) {
  const type = action?.type ?? 'responseCurve';
  const config = action?.config ?? defaultShapeConfig(type);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <SegmentedControl layoutId={layoutId} options={SHAPE_TYPES} value={type} onChange={(t) => onChange({ type: t, config: defaultShapeConfig(t) })} />
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

function ActionControl({ kind, action, layoutId, onChange }) {
  return kind === 'button' ? <ButtonControl action={action} layoutId={layoutId} onChange={onChange} /> : <ShapeControl action={action} layoutId={layoutId} onChange={onChange} />;
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
              <ActionControl kind={inputKind} action={rule.base} layoutId={`base-${inputKey}`} onChange={onSetBase} />
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
                    <ActionControl kind={inputKind} action={shiftCondition.action} layoutId={`shift-${inputKey}`} onChange={(next) => onSetCondition(shiftKey, next)} />
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
              <ActionControl kind={inputKind} action={c.action} layoutId={`cond-${c.triggerModeId}-${inputKey}`} onChange={(next) => onSetCondition(c.triggerKey, next)} />
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

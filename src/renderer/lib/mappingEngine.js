// Pure, framework-agnostic engine for the advanced mapping mode/action system.
// This runs in-process inside the renderer's 16ms tick loop (see the tick()
// function in views/Mapping.jsx), so everything here must stay synchronous
// and free of React/Electron/DOM imports: any IPC round trip here would add
// latency to a real-time input loop.
//
// Milestone 1 ships exactly four action types (responseCurve, deadzone,
// mapToVjoy, changeMode). The rest of the Joystick-Gremlin-parity roster
// (Merge Axis, Split Axis, Condition, Tempo, Macro, etc.) lands in later
// milestones; compileAction() below just skips anything it doesn't recognize
// rather than throwing, so a profile referencing a future action type never
// crashes the live loop, it just no-ops that step.

export const DEFAULT_MODE_ID = 'base';

// Same invert -> deadzone -> curve shaping the old per-axis settings panel
// applied inline, kept bit-identical so the legacy axisSettingsMap path and
// the new responseCurve/deadzone actions produce the same output for the
// same config instead of two divergent copies of this formula.
export function shapeValue(value, { invert = false, deadzone = 0, curve = 1 } = {}) {
  let v = invert ? -value : value;
  if (deadzone > 0) {
    const abs = Math.abs(v);
    v = abs < deadzone ? 0 : Math.sign(v) * ((abs - deadzone) / (1 - deadzone));
  }
  if (curve !== 1) {
    v = Math.sign(v) * Math.abs(v) ** curve;
  }
  return Math.max(-1, Math.min(1, v));
}

// Walks a mode's parentId chain from modeId up to the root, cycle-safe via a
// visited Set. Returns an array of mode ids starting with modeId itself, so
// callers can look for a binding at each level in child-overrides-parent order.
export function resolveModeChain(modes, modeId) {
  const byId = new Map((modes ?? []).map((m) => [m.id, m]));
  const chain = [];
  const seen = new Set();
  let current = byId.get(modeId) ?? byId.get(DEFAULT_MODE_ID);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

// Defensive, renderer-side mirror of the same cycle-breaking check the main
// process applies authoritatively in mappingSetups.js (profiles can also
// arrive via backup:import, which never touches this module). Cuts the
// parentId of whichever mode re-enters an already-visited chain.
export function sanitizeModes(modes) {
  if (!Array.isArray(modes) || modes.length === 0) {
    return [{ id: DEFAULT_MODE_ID, name: 'Base', parentId: null }];
  }
  const byId = new Map(modes.map((m) => [m.id, m]));
  return modes.map((mode) => {
    const seen = new Set([mode.id]);
    let parentId = mode.parentId;
    while (parentId) {
      if (seen.has(parentId) || !byId.has(parentId)) return { ...mode, parentId: null };
      seen.add(parentId);
      parentId = byId.get(parentId).parentId;
    }
    return mode;
  });
}

// A Macro step is valid if it's a wait, or a press/release with a target
// the runtime actually knows how to act on: 'vjoy' (the default, backward
// compatible with steps saved before keyboard/mouse targets existed),
// 'key', or 'mouse'.
function isValidMacroStep(s) {
  if (!s) return false;
  if (s.type === 'wait') return Number.isFinite(s.ms);
  const target = s.target ?? 'vjoy';
  if (target === 'vjoy') return Number.isInteger(s.outputIndex);
  if (target === 'key') return Number.isInteger(s.keyCode);
  if (target === 'mouse') return typeof s.mouseButton === 'string';
  return false;
}

// Turns one library action node into an executable step. Returns null for an
// unrecognized type (future action, or a hand-edited/corrupted profile) so
// the caller can silently skip it instead of crashing the tick loop.
export function compileAction(action) {
  if (!action) return null;
  switch (action.type) {
    case 'responseCurve':
      return { kind: 'axis', run: (value) => shapeValue(value, { curve: action.config?.curve ?? 1 }) };
    case 'deadzone':
      return { kind: 'axis', run: (value) => shapeValue(value, { deadzone: action.config?.deadzone ?? 0 }) };
    case 'mapToVjoy':
      // outputIndex is 0-based and always targets this same mapping slot's
      // own vJoy device, cross-slot routing isn't exposed in the UI yet.
      return { kind: 'terminal', outputIndex: action.config?.outputIndex };
    case 'tempo':
      // Button-only: a brief press ("tap") and a press held past thresholdMs
      // ("hold") land on two different vJoy buttons. Unlike mapToVjoy this
      // owns its own output placement entirely (see tick()'s tempo handling
      // in Mapping.jsx), it never falls back to positional forwarding.
      return {
        kind: 'tempo',
        thresholdMs: action.config?.thresholdMs ?? 250,
        tapOutputIndex: action.config?.tapOutputIndex,
        holdOutputIndex: action.config?.holdOutputIndex
      };
    case 'macro':
      // Button-only: pressing the physical button plays a fixed sequence of
      // press/release/wait steps over time, instead of just asserting one
      // output for as long as it's held. Each press/release step targets
      // either a vJoy button (owns its own output placement, like Tempo, so
      // it never falls back to positional forwarding, and every vJoy index
      // any step references is reserved up front, see tick()'s pre-scan in
      // Mapping.jsx, even before the macro has ever played) or a real
      // keyboard key / mouse button via Windows' keybd_event/mouse_event
      // (src/main/inputInterface.js), a one-shot OS-level side effect rather
      // than a vJoy slot the tick loop needs to keep re-asserting.
      return {
        kind: 'macro',
        steps: Array.isArray(action.config?.steps) ? action.config.steps.filter(isValidMacroStep) : []
      };
    case 'hatButtons':
      // Axis-only: some hardware reports a 4-way hat as a single axis with a
      // handful of fixed discrete values (calibrated per-device in the UI,
      // there's no universal standard value to assume), rather than as real
      // continuous movement. This turns that one axis into up to four
      // button-shaped outputs instead of a curve/deadzone-shaped value.
      return {
        kind: 'hat',
        directions: action.config?.directions ?? {},
        outputs: action.config?.outputs ?? {}
      };
    case 'changeMode':
      return {
        kind: 'event',
        run: (helpers) => {
          if (helpers.edge) helpers.queueModeChange(action.config?.targetModeId);
          // Momentary (the only flavor the Rules UI ever generates): release
          // reverts straight back to the base mode. This is a deliberate
          // Milestone 1 simplification, holding two different trigger
          // buttons at once doesn't nest (releasing the second always lands
          // you back on base, not back on the first one's mode), proper
          // stacking is a later-milestone refinement.
          if (helpers.releaseEdge && action.config?.momentary) helpers.queueModeChange(DEFAULT_MODE_ID);
        }
      };
    default:
      return null;
  }
}

// Finds whichever calibrated direction (including 'neutral', if calibrated)
// the current raw value sits closest to. Nearest-match rather than a fixed
// tolerance band, since the calibrated points are whatever this specific
// hardware actually reports, not a value MIM assumes in advance.
export function classifyHatDirection(value, directions) {
  let best = null;
  let bestDist = Infinity;
  for (const [dir, refValue] of Object.entries(directions ?? {})) {
    if (typeof refValue !== 'number') continue;
    const dist = Math.abs(value - refValue);
    if (dist < bestDist) {
      bestDist = dist;
      best = dir;
    }
  }
  return best;
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// Everything below exists so the UI never has to show the words "mode",
// "binding", or "sequence" to the user. A "condition" (While holding X, this
// input does Y instead) is the only concept surfaced; modes are an
// implementation detail auto-created and auto-wired here, one per unique
// trigger input, shared across every condition that holds the same trigger.

// Finds (or describes creating) the hidden mode for a given trigger input,
// and the hidden, auto-managed Change Mode action that activates it whenever
// that input is held, appended alongside whatever the trigger's own normal
// action already is, so adding a condition never disturbs the trigger
// button's own unrelated behavior.
export function ensureHoldTrigger(setup, triggerKey) {
  const modes = setup.modes ?? [];
  let mode = modes.find((m) => m.trigger?.key === triggerKey);
  let nextModes = modes;
  if (!mode) {
    mode = { id: makeId('hold'), name: 'Hold', parentId: DEFAULT_MODE_ID, trigger: { key: triggerKey } };
    nextModes = [...modes, mode];
  }

  const library = { ...(setup.library ?? {}) };
  const sequences = { ...(setup.sequences ?? {}) };
  const bindings = { ...(setup.bindings ?? {}), [DEFAULT_MODE_ID]: { ...(setup.bindings?.[DEFAULT_MODE_ID] ?? {}) } };

  const existingSeqId = bindings[DEFAULT_MODE_ID][triggerKey];
  const existingSeq = existingSeqId ? sequences[existingSeqId] : null;
  const alreadyWired = existingSeq?.actionIds.some((id) => library[id]?.auto && library[id]?.config?.targetModeId === mode.id);

  if (!alreadyWired) {
    const ownActionIds = existingSeq ? existingSeq.actionIds.filter((id) => !library[id]?.auto) : [];
    const hiddenId = `act-auto-${mode.id}`;
    library[hiddenId] = { type: 'changeMode', config: { targetModeId: mode.id, momentary: true }, auto: true };
    const seqId = existingSeqId ?? makeId('seq-auto');
    sequences[seqId] = { actionIds: [...ownActionIds, hiddenId] };
    bindings[DEFAULT_MODE_ID][triggerKey] = seqId;
  }

  return { ...setup, modes: nextModes, library, sequences, bindings, triggerModeId: mode.id };
}

// Sets (creating or replacing) inputKey's single unconditional action,
// preserving any hidden auto trigger action already wired to that same
// input (an input can be both "a button with its own normal behavior" and
// "the trigger for someone else's condition" at once).
export function setBaseAction(setup, inputKey, action) {
  const library = { ...(setup.library ?? {}) };
  const sequences = { ...(setup.sequences ?? {}) };
  const bindings = { ...(setup.bindings ?? {}), [DEFAULT_MODE_ID]: { ...(setup.bindings?.[DEFAULT_MODE_ID] ?? {}) } };

  const existingSeqId = bindings[DEFAULT_MODE_ID][inputKey];
  const existingSeq = existingSeqId ? sequences[existingSeqId] : null;
  const autoActionIds = existingSeq ? existingSeq.actionIds.filter((id) => library[id]?.auto) : [];

  const actionId = makeId('act');
  library[actionId] = { type: action.type, config: action.config, typeStash: action.typeStash };
  const seqId = existingSeqId ?? makeId('seq');
  sequences[seqId] = { actionIds: [actionId, ...autoActionIds] };
  bindings[DEFAULT_MODE_ID][inputKey] = seqId;

  return { ...setup, library, sequences, bindings };
}

// Removes inputKey's unconditional action, keeping the hidden auto trigger
// action (if any) wired so it doesn't stop working as someone else's trigger.
export function clearBaseAction(setup, inputKey) {
  const sequences = { ...(setup.sequences ?? {}) };
  const bindings = { ...(setup.bindings ?? {}), [DEFAULT_MODE_ID]: { ...(setup.bindings?.[DEFAULT_MODE_ID] ?? {}) } };
  const seqId = bindings[DEFAULT_MODE_ID][inputKey];
  const seq = seqId ? sequences[seqId] : null;
  if (seq) {
    const library = setup.library ?? {};
    const autoActionIds = seq.actionIds.filter((id) => library[id]?.auto);
    if (autoActionIds.length > 0) {
      sequences[seqId] = { actionIds: autoActionIds };
    } else {
      delete bindings[DEFAULT_MODE_ID][inputKey];
    }
  }
  return { ...setup, sequences, bindings };
}

// Sets (creating or replacing) the single override action a condition
// applies to targetInputKey while triggerKey is held.
export function setConditionAction(setup, triggerKey, targetInputKey, action) {
  const withTrigger = ensureHoldTrigger(setup, triggerKey);
  const { modes, library, sequences, bindings, triggerModeId } = withTrigger;
  const actionId = makeId('act');
  const nextLibrary = { ...library, [actionId]: { type: action.type, config: action.config, typeStash: action.typeStash } };
  const seqId = makeId('seq');
  const nextSequences = { ...sequences, [seqId]: { actionIds: [actionId] } };
  const nextBindings = { ...bindings, [triggerModeId]: { ...(bindings[triggerModeId] ?? {}), [targetInputKey]: seqId } };
  return { ...setup, modes, library: nextLibrary, sequences: nextSequences, bindings: nextBindings };
}

// Removes one condition (identified by which hold-trigger mode it lives in).
// The hidden trigger mode/action are left in place even if this was its last
// condition, harmless unused storage rather than a correctness issue, real
// garbage collection is a later cleanup, not a Milestone 1 requirement.
export function clearCondition(setup, triggerModeId, targetInputKey) {
  const bindings = { ...(setup.bindings ?? {}) };
  if (!bindings[triggerModeId]) return setup;
  const modeBindings = { ...bindings[triggerModeId] };
  delete modeBindings[targetInputKey];
  bindings[triggerModeId] = modeBindings;
  return { ...setup, bindings };
}

// Reads the single normal action bound to inputKey in the base mode (if any,
// ignoring the hidden auto-generated ones) plus every condition that
// overrides inputKey while some trigger is held, the exact shape the
// sentence-based Rules UI renders directly, no mode/binding/sequence
// vocabulary leaks past this function.
export function getRuleFor(setup, inputKey) {
  const baseSeqId = setup.bindings?.[DEFAULT_MODE_ID]?.[inputKey];
  const baseSeq = baseSeqId ? setup.sequences?.[baseSeqId] : null;
  const baseAction = baseSeq?.actionIds.map((id) => setup.library?.[id]).find((a) => a && !a.auto) ?? null;

  const conditions = (setup.modes ?? [])
    .filter((m) => m.trigger)
    .map((m) => {
      const seqId = setup.bindings?.[m.id]?.[inputKey];
      const seq = seqId ? setup.sequences?.[seqId] : null;
      const action = seq ? setup.library?.[seq.actionIds[0]] : null;
      return action ? { triggerModeId: m.id, triggerKey: m.trigger.key, action } : null;
    })
    .filter(Boolean);

  return { base: baseAction, conditions };
}

// Resolves and compiles the pipeline bound to inputKey, walking from modeId up
// through parents (child overrides parent, matching Gremlin's mode
// inheritance). Returns null if nothing is bound anywhere in the chain, or if
// the binding points at a sequence/action that no longer exists, dangling
// references are silent no-ops, never thrown errors, since this runs inside
// a live 60Hz loop.
export function compilePipelineForInput(setup, modeId, inputKey) {
  const chain = resolveModeChain(setup.modes, modeId);
  for (const mId of chain) {
    const seqId = setup.bindings?.[mId]?.[inputKey];
    if (!seqId) continue;
    const sequence = setup.sequences?.[seqId];
    if (!sequence) return null;
    return sequence.actionIds.map((id) => setup.library?.[id]).map(compileAction).filter(Boolean);
  }
  return null;
}

// One instance per actively-ticking game profile. Compiling is lazy per input
// key rather than eager for every possible input, since physical devices can
// hot-plug and most inputs on a big panel are never touched. A mode switch
// just drops the cache; the next tick recompiles only the inputs it actually
// reads.
export function createModeRuntime(setup) {
  let activeModeId = setup.defaultModeId ?? DEFAULT_MODE_ID;
  let cache = new Map();

  return {
    getPipeline(inputKey) {
      if (!cache.has(inputKey)) {
        cache.set(inputKey, compilePipelineForInput(setup, activeModeId, inputKey));
      }
      return cache.get(inputKey);
    },
    setActiveMode(modeId) {
      if (modeId === activeModeId) return;
      activeModeId = modeId;
      cache = new Map();
    },
    get activeModeId() {
      return activeModeId;
    }
  };
}

// Best-effort importer for Joystick Gremlin profile XML files, converting
// them into the same Rules data shape mappingEngine.js already works with
// (setBaseAction/setConditionAction), rather than inventing a second
// bindings format. This deliberately does NOT aim for full Gremlin parity:
// MIM's Rules UI only exposes "Normally" plus one level of "While holding X"
// conditions, by design (see the pivot away from an earlier modes/bindings
// UI the user found too close to Gremlin's own confusing complexity), so
// anything that needs real mode graphs, cycling, or output types MIM has no
// concept of (keyboard keys, mouse movement, text-to-speech) is skipped and
// reported back as a warning rather than silently dropped or guessed at.
import { setBaseAction, setConditionAction } from './mappingEngine';

const UNSUPPORTED_LABELS = {
  mapToMouse: 'axis-to-mouse-movement',
  previousMode: '"previous mode" navigation',
  cycleModes: 'permanent mode cycling',
  textToSpeech: 'text-to-speech'
};

// Parses the raw XML text into a plain-object tree, independent of MIM's own
// data model, so the conversion step below can stay a separate, testable
// pass. Uses the browser's native DOMParser (available in the renderer,
// Electron is Chromium under the hood), no XML parsing dependency needed.
export function parseGremlinXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) throw new Error('Could not parse this file as XML.');
  const root = doc.documentElement;
  if (!root || root.tagName !== 'profile') {
    throw new Error('Not a Joystick Gremlin profile (missing <profile> root).');
  }

  const devices = [];
  for (const deviceEl of root.querySelectorAll(':scope > devices > device')) {
    if (deviceEl.getAttribute('type') !== 'joystick') continue; // keyboard/mouse aren't input sources MIM can read
    devices.push({
      guid: deviceEl.getAttribute('device-guid'),
      name: (deviceEl.getAttribute('name') ?? '').trim(),
      modes: [...deviceEl.querySelectorAll(':scope > mode')].map(parseMode)
    });
  }
  return { version: Number(root.getAttribute('version')), devices };
}

function parseMode(modeEl) {
  return {
    name: modeEl.getAttribute('name'),
    inherit: modeEl.getAttribute('inherit') || null,
    axes: [...modeEl.querySelectorAll(':scope > axis')].map(parseInputEl),
    buttons: [...modeEl.querySelectorAll(':scope > button')].map(parseInputEl),
    hats: [...modeEl.querySelectorAll(':scope > hat')].map(parseInputEl)
  };
}

function parseInputEl(el) {
  return {
    id: Number(el.getAttribute('id')),
    containers: [...el.querySelectorAll(':scope > container')].map(parseContainer)
  };
}

function parseContainer(containerEl) {
  const delay = containerEl.getAttribute('delay');
  return {
    type: containerEl.getAttribute('type'),
    activateOn: containerEl.getAttribute('activate-on'),
    delayMs: delay ? Math.round(Number(delay) * 1000) : null,
    actionSets: [...containerEl.querySelectorAll(':scope > action-set')].map((setEl) =>
      [...setEl.children].map(parseAction)
    )
  };
}

function parseAction(el) {
  switch (el.tagName) {
    case 'remap':
      return {
        kind: 'remap',
        axis: el.getAttribute('axis'),
        button: el.getAttribute('button'),
        hat: el.getAttribute('hat'),
        vjoy: el.getAttribute('vjoy')
      };
    case 'response-curve': {
      const dz = el.querySelector('deadzone');
      return {
        kind: 'responseCurve',
        hasCurve: Boolean(el.querySelector('mapping')),
        deadzoneLow: dz ? Number(dz.getAttribute('low')) : null,
        deadzoneHigh: dz ? Number(dz.getAttribute('high')) : null
      };
    }
    case 'temporary-mode-switch':
      return { kind: 'temporaryModeSwitch', name: el.getAttribute('name') };
    case 'cycle-modes':
      return { kind: 'cycleModes', modes: [...el.querySelectorAll('mode')].map((m) => m.getAttribute('name')) };
    case 'macro': {
      const steps = [];
      for (const stepEl of el.querySelectorAll('actions > *')) {
        if (stepEl.tagName === 'vjoy' && stepEl.getAttribute('input-type') === 'button') {
          steps.push({
            kind: stepEl.getAttribute('value') === 'True' ? 'press' : 'release',
            outputIndex: Number(stepEl.getAttribute('input-id')) - 1
          });
        } else if (stepEl.tagName === 'pause') {
          steps.push({ kind: 'wait', ms: Math.round(Number(stepEl.getAttribute('duration')) * 1000) });
        } else if (stepEl.tagName === 'key') {
          steps.push({ kind: 'key-unsupported' });
        }
      }
      return { kind: 'macro', steps };
    }
    case 'map-to-mouse':
      return { kind: 'mapToMouse' };
    case 'previous-mode':
      return { kind: 'previousMode' };
    case 'text-to-speech':
      return { kind: 'textToSpeech' };
    default:
      return { kind: 'unknown', tag: el.tagName };
  }
}

// Converts one action-set into a MIM action, or null if it contains nothing
// MIM can represent, pushing a human-readable line onto `warnings` for
// anything skipped along the way.
function actionSetToMimAction(actionSet, kind, label, warnings) {
  for (const action of actionSet) {
    const unsupportedLabel = UNSUPPORTED_LABELS[action.kind];
    if (unsupportedLabel) warnings.push(`${label}: ${unsupportedLabel} isn't supported yet, skipped`);
  }

  if (kind === 'hat') {
    if (actionSet.some((a) => a.kind === 'remap')) {
      warnings.push(`${label}: hat-to-vJoy-hat remapping isn't supported yet, skipped`);
    }
    return null;
  }

  if (kind === 'axis') {
    if (actionSet.some((a) => a.kind === 'remap')) {
      warnings.push(`${label}: routing to a specific vJoy axis isn't supported (axes stay in their original order), skipped`);
    }
    const curve = actionSet.find((a) => a.kind === 'responseCurve');
    if (curve) {
      if (curve.hasCurve) warnings.push(`${label}: custom response curve shape isn't supported yet, skipped`);
      const dz = Math.max(Math.abs(curve.deadzoneLow ?? 0), curve.deadzoneHigh ?? 0);
      if (dz > 0.001) return { type: 'deadzone', config: { deadzone: Math.min(dz, 0.5) } };
    }
    return null;
  }

  // Buttons.
  const macro = actionSet.find((a) => a.kind === 'macro');
  if (macro) {
    const steps = [];
    for (const s of macro.steps) {
      if (s.kind === 'key-unsupported') {
        warnings.push(`${label}: a keyboard step inside this Macro isn't supported yet, skipped (the rest of the Macro was still imported)`);
        continue;
      }
      steps.push(s.kind === 'wait' ? { type: 'wait', ms: s.ms } : { type: s.kind, outputIndex: s.outputIndex });
    }
    return { type: 'macro', config: { steps } };
  }
  const remap = actionSet.find((a) => a.kind === 'remap' && a.button != null);
  if (remap) return { type: 'mapToVjoy', config: { outputIndex: Number(remap.button) - 1 } };
  return null;
}

function inputKeyFor(physicalDeviceId, kind, gremlinId) {
  return `${physicalDeviceId}:${kind}:${gremlinId - 1}`; // Gremlin ids are 1-based, MIM's are 0-based
}

// Imports one Gremlin mode's inputs as MIM base actions for physicalDeviceId.
// Only one level of "temporary-mode-switch while held" gets turned into a
// condition on the SAME inputs in the target mode, mirroring exactly what
// MIM's Shift-key mechanic already does, deeper/cyclical mode graphs are
// reported as skipped rather than approximated.
function importModeInputs(setup, physicalDeviceId, device, mode, deviceLabel, warnings, seenModes) {
  let next = setup;

  function importList(list, kind, kindLabel) {
    for (const input of list) {
      const label = `${deviceLabel} ${kindLabel} ${input.id}`;
      for (const container of input.containers) {
        if (container.type === 'basic') {
          const actionSet = container.actionSets[0] ?? [];
          const action = actionSetToMimAction(actionSet, kind, label, warnings);
          if (action) next = setBaseAction(next, inputKeyFor(physicalDeviceId, kind, input.id), action);

          const tms = actionSet.find((a) => a.kind === 'temporaryModeSwitch');
          if (tms && kind === 'button') {
            const targetMode = device.modes.find((m) => m.name === tms.name);
            const triggerKey = inputKeyFor(physicalDeviceId, kind, input.id);
            if (targetMode && !seenModes.has(targetMode.name)) {
              seenModes.add(targetMode.name);
              next = importModeAsConditions(next, physicalDeviceId, device, targetMode, triggerKey, deviceLabel, warnings, seenModes);
            } else if (!targetMode) {
              warnings.push(`${label}: mode "${tms.name}" referenced but not found, skipped`);
            }
          }
        } else if (container.type === 'tempo' && kind === 'button') {
          const [tapSet, holdSet] = container.actionSets;
          const tapAction = actionSetToMimAction(tapSet ?? [], kind, `${label} (tap)`, warnings);
          const holdIsSimpleRemap =
            (holdSet ?? []).every((a) => a.kind !== 'cycleModes' && a.kind !== 'temporaryModeSwitch') &&
            (holdSet ?? []).some((a) => a.kind === 'remap');
          if (holdIsSimpleRemap && tapAction?.type === 'mapToVjoy') {
            const holdRemap = holdSet.find((a) => a.kind === 'remap' && a.button != null);
            next = setBaseAction(next, inputKeyFor(physicalDeviceId, kind, input.id), {
              type: 'tempo',
              config: {
                thresholdMs: container.delayMs ?? 250,
                tapOutputIndex: tapAction.config.outputIndex,
                holdOutputIndex: Number(holdRemap.button) - 1
              }
            });
          } else {
            if (tapAction) next = setBaseAction(next, inputKeyFor(physicalDeviceId, kind, input.id), tapAction);
            actionSetToMimAction(holdSet ?? [], kind, `${label} (hold)`, warnings);
            warnings.push(`${label}: the "hold" behavior wasn't a plain vJoy press, only the tap press was imported`);
          }
        } else if (container.type !== 'basic') {
          warnings.push(`${label}: container type "${container.type}" isn't supported yet, skipped`);
        }
      }
    }
  }

  importList(mode.axes, 'axis', 'axis');
  importList(mode.buttons, 'button', 'button');
  importList(mode.hats, 'hat', 'hat');
  return next;
}

// A mode reached only while triggerKey is held becomes a MIM condition on
// every input that mode overrides, using the same engine helper the Shift
// key UI uses, so it behaves identically at runtime.
function importModeAsConditions(setup, physicalDeviceId, device, mode, triggerKey, deviceLabel, warnings, seenModes) {
  let next = setup;

  function importList(list, kind, kindLabel) {
    for (const input of list) {
      const label = `${deviceLabel} ${kindLabel} ${input.id} (while holding trigger)`;
      for (const container of input.containers) {
        if (container.type !== 'basic') {
          warnings.push(`${label}: container type "${container.type}" isn't supported as a condition yet, skipped`);
          continue;
        }
        const action = actionSetToMimAction(container.actionSets[0] ?? [], kind, label, warnings);
        if (action) next = setConditionAction(next, triggerKey, inputKeyFor(physicalDeviceId, kind, input.id), action);
      }
    }
  }

  importList(mode.axes, 'axis', 'axis');
  importList(mode.buttons, 'button', 'button');
  importList(mode.hats, 'hat', 'hat');
  return next;
}

// Top-level entry point: imports one Gremlin device's chosen base mode into
// setup for physicalDeviceId, returning the updated setup plus a flat list
// of human-readable warnings for anything that couldn't be represented.
export function importGremlinDevice(setup, physicalDeviceId, device, baseModeName) {
  const baseMode = device.modes.find((m) => m.name === baseModeName);
  const warnings = [];
  if (!baseMode) return { setup, warnings: [`Mode "${baseModeName}" not found on ${device.name}.`] };
  const seenModes = new Set([baseModeName]);
  const next = importModeInputs(setup, physicalDeviceId, device, baseMode, device.name.trim(), warnings, seenModes);
  return { setup: next, warnings };
}

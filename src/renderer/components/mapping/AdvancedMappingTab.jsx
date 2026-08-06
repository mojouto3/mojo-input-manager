import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Card from '../Card';
import InputPicker from './InputPicker';
import RuleCard from './RuleCard';
import { getRuleFor, setBaseAction, clearBaseAction, setConditionAction, clearCondition } from '../../lib/mappingEngine';

const mim = typeof window !== 'undefined' ? window.mim : undefined;

// Editor for one saved game profile's rules. `profile` is the full
// mappingSetups entry (already normalized with modes/library/sequences/
// bindings by the main process, see src/main/mappingSetups.js), `devices` is
// the same live Gamepad API list Mapping.jsx already polls. Modes exist only
// inside mappingEngine.js's reconciliation helpers, this component and
// everything it renders talks entirely in "rules" (see RuleCard.jsx).
export default function AdvancedMappingTab({ profile, devices, onSaved }) {
  const [setup, setSetup] = useState(profile);
  const [selectedInput, setSelectedInput] = useState(null);

  useEffect(() => {
    setSetup(profile);
    setSelectedInput(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  async function persist(nextSetup) {
    setSetup(nextSetup);
    await mim.mappingSetups.update(profile.id, {
      modes: nextSetup.modes,
      library: nextSetup.library,
      sequences: nextSetup.sequences,
      bindings: nextSetup.bindings,
      shiftKey: nextSetup.shiftKey
    });
    onSaved?.();
  }

  const boundKeys = new Set();
  for (const d of devices) {
    d.axes.forEach((_, i) => {
      const key = `${d.id}:axis:${i}`;
      const rule = getRuleFor(setup, key);
      if (rule.base || rule.conditions.length > 0) boundKeys.add(key);
    });
    d.buttons.forEach((_, i) => {
      const key = `${d.id}:button:${i}`;
      const rule = getRuleFor(setup, key);
      if (rule.base || rule.conditions.length > 0) boundKeys.add(key);
    });
  }

  const rule = selectedInput ? getRuleFor(setup, selectedInput.key) : null;

  return (
    <div className="flex flex-col gap-4">
      <Card hover={false} className="p-4">
        <InputPicker
          devices={devices}
          selectedInputKey={selectedInput?.key ?? null}
          onSelect={setSelectedInput}
          boundKeys={boundKeys}
          shiftKey={setup.shiftKey}
          onSetShiftKey={(key) => persist({ ...setup, shiftKey: key })}
        />
      </Card>

      <AnimatePresence mode="wait">
        {selectedInput && rule && (
          <motion.div
            key={selectedInput.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <Card hover={false} className="p-4">
              <RuleCard
                inputKey={selectedInput.key}
                inputLabel={`${selectedInput.deviceLabel}, ${selectedInput.inputLabel}`}
                inputKind={selectedInput.kind}
                inputIndex={selectedInput.index}
                rule={rule}
                devices={devices}
                shiftKey={setup.shiftKey}
                onSetShiftKey={(key) => persist({ ...setup, shiftKey: key })}
                onSetBase={(action) => persist(setBaseAction(setup, selectedInput.key, action))}
                onClearBase={() => persist(clearBaseAction(setup, selectedInput.key))}
                onSetCondition={(triggerKey, action) => persist(setConditionAction(setup, triggerKey, selectedInput.key, action))}
                onRemoveCondition={(triggerModeId) => persist(clearCondition(setup, triggerModeId, selectedInput.key))}
              />
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Upload, TriangleAlert, CircleCheck } from 'lucide-react';
import Select from '../Select';
import { parseGremlinXml, importGremlinDevice } from '../../lib/gremlinImport';

const mim = typeof window !== 'undefined' ? window.mim : undefined;

// Rough first guess at which connected physical device a Gremlin profile
// entry refers to, by substring match on name. Always left for the user to
// confirm/correct in the UI, this is only a convenience default.
function guessMatch(gremlinName, devices) {
  const normalized = gremlinName.trim().toLowerCase();
  return devices.find((d) => d.id.toLowerCase().includes(normalized))?.id ?? '';
}

// Best-effort Joystick Gremlin profile import, closes only via its own
// explicit buttons (no backdrop-click dismissal), matching ConfirmDialog's
// established pattern in this app.
export default function GremlinImportDialog({ open, devices, setup, onImport, onClose }) {
  const [step, setStep] = useState('pick');
  const [error, setError] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [deviceMatches, setDeviceMatches] = useState({});
  const [modeChoices, setModeChoices] = useState({});
  const [warnings, setWarnings] = useState([]);

  function reset() {
    setStep('pick');
    setError(null);
    setParsed(null);
    setDeviceMatches({});
    setModeChoices({});
    setWarnings([]);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function pickFile() {
    setError(null);
    const result = await mim?.gremlin?.pickImportFile();
    if (!result?.ok) {
      if (!result?.cancelled) setError(result?.error ?? 'Could not read that file.');
      return;
    }
    try {
      const data = parseGremlinXml(result.text);
      if (data.devices.length === 0) {
        setError('No joystick devices found in this profile (only keyboard/mouse entries, which MIM cannot use as trigger inputs).');
        return;
      }
      const matches = {};
      const modes = {};
      for (const d of data.devices) {
        matches[d.guid] = guessMatch(d.name, devices);
        modes[d.guid] = d.modes[0]?.name ?? '';
      }
      setParsed(data);
      setDeviceMatches(matches);
      setModeChoices(modes);
      setStep('configure');
    } catch (err) {
      setError(err.message);
    }
  }

  function runImport() {
    let nextSetup = setup;
    const allWarnings = [];
    for (const d of parsed.devices) {
      const physicalId = deviceMatches[d.guid];
      const modeName = modeChoices[d.guid];
      if (!physicalId || !modeName) continue;
      const result = importGremlinDevice(nextSetup, physicalId, d, modeName);
      nextSetup = result.setup;
      allWarnings.push(...result.warnings.map((w) => `${d.name.trim()}: ${w}`));
    }
    onImport(nextSetup);
    setWarnings(allWarnings);
    setStep('done');
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="glass-panel w-full max-w-lg rounded-2xl p-5"
          >
            <h3 className="mb-4 text-sm font-semibold text-white">Import Joystick Gremlin Profile</h3>

            {step === 'pick' && (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mim-accent/15 text-mim-accent">
                  <Upload size={20} />
                </span>
                <p className="text-sm text-mim-muted">
                  MIM imports what it has a real equivalent for (button presses, Tempo, Macro, and Shift-style "while holding" conditions), and shows you
                  a list of anything it had to skip, like custom response curves, mouse output, or mode cycling.
                </p>
                {error && <p className="text-xs text-red-400">{error}</p>}
                <div className="mt-1 flex w-full justify-end gap-2">
                  <button onClick={handleClose} className="glass-surface rounded-full px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10">
                    Cancel
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={pickFile}
                    className="rounded-full bg-mim-accent/15 px-4 py-2 text-xs font-semibold text-mim-accent"
                  >
                    Choose .xml file...
                  </motion.button>
                </div>
              </div>
            )}

            {step === 'configure' && parsed && (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-mim-muted">
                  Match each Gremlin device to a connected controller, and pick which mode to import as this profile's normal behavior. Leave a device
                  unmatched to skip it.
                </p>
                <div className="flex max-h-80 flex-col gap-3 overflow-y-auto pr-1">
                  {parsed.devices.map((d) => (
                    <div key={d.guid} className="flex flex-col gap-2 rounded-xl border border-mim-border p-3">
                      <span className="text-sm font-medium text-white">{d.name.trim()}</span>
                      <div className="flex items-center gap-2">
                        <span className="w-14 shrink-0 text-xs text-mim-muted">Device</span>
                        <Select
                          value={deviceMatches[d.guid] ?? ''}
                          onChange={(v) => setDeviceMatches((prev) => ({ ...prev, [d.guid]: v }))}
                          options={devices.map((dev) => ({ value: dev.id, label: dev.id }))}
                          placeholder="Skip this device..."
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-14 shrink-0 text-xs text-mim-muted">Mode</span>
                        <Select
                          value={modeChoices[d.guid] ?? ''}
                          onChange={(v) => setModeChoices((prev) => ({ ...prev, [d.guid]: v }))}
                          options={d.modes.map((m) => ({ value: m.name, label: m.name }))}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex justify-end gap-2">
                  <button onClick={handleClose} className="glass-surface rounded-full px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10">
                    Cancel
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={runImport}
                    className="rounded-full bg-mim-accent/15 px-4 py-2 text-xs font-semibold text-mim-accent"
                  >
                    Import
                  </motion.button>
                </div>
              </div>
            )}

            {step === 'done' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-mim-accent">
                  <CircleCheck size={18} />
                  <span className="text-sm font-medium">Import complete.</span>
                </div>
                {warnings.length > 0 ? (
                  <>
                    <div className="flex items-center gap-2 text-amber-300">
                      <TriangleAlert size={16} />
                      <span className="text-xs font-semibold">{warnings.length} item(s) skipped:</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto rounded-lg bg-black/20 p-2 text-xs text-mim-muted">
                      {warnings.map((w, i) => (
                        <p key={i} className="border-b border-white/5 py-1 last:border-0">
                          {w}
                        </p>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-mim-muted">Everything in the selected mode(s) was imported cleanly.</p>
                )}
                <div className="mt-1 flex justify-end">
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleClose}
                    className="rounded-full bg-mim-accent/15 px-4 py-2 text-xs font-semibold text-mim-accent"
                  >
                    Done
                  </motion.button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Gamepad2 } from 'lucide-react';
import Card from '../components/Card';

function readGamepads() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  return Array.from(pads).filter(Boolean);
}

export default function Mapping() {
  const [devices, setDevices] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const frameRef = useRef();

  useEffect(() => {
    function tick() {
      setDevices(readGamepads());
      frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  const selected = devices.find((d) => d.index === selectedIndex) ?? devices[0] ?? null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Mapping</h1>
        <p className="mt-1 text-sm text-mim-muted">
          Detected physical devices and their live input. Move a stick or press a button to test.
        </p>
      </div>

      {devices.length === 0 ? (
        <Card hover={false} className="flex flex-col items-center gap-3 px-10 py-10 text-center">
          <Gamepad2 size={28} className="text-mim-muted" />
          <p className="text-mim-muted">No physical devices detected yet.</p>
          <p className="text-xs text-mim-muted">
            Plug in a controller and move a stick or press a button — some devices only appear after their first input.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
          <div className="flex flex-col gap-2">
            {devices.map((device) => (
              <button
                key={device.index}
                onClick={() => setSelectedIndex(device.index)}
                className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  selected?.index === device.index
                    ? 'border-mim-green/30 bg-mim-green/10 text-white'
                    : 'border-mim-border bg-mim-surface/60 text-mim-muted hover:text-white'
                }`}
              >
                <p className="truncate font-medium">{device.id.split(' (')[0]}</p>
                <p className="text-xs text-mim-muted">Device {device.index}</p>
              </button>
            ))}
          </div>

          {selected && (
            <Card hover={false} className="p-5">
              <h3 className="mb-4 truncate text-sm font-semibold text-white">{selected.id}</h3>

              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-mim-muted">Axes</p>
              <div className="mb-5 flex flex-col gap-2">
                {selected.axes.map((value, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-6 text-xs text-mim-muted">A{i}</span>
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
                {selected.buttons.map((button, i) => (
                  <div
                    key={i}
                    className={`flex h-8 w-8 items-center justify-center rounded-md border text-xs font-medium transition-colors ${
                      button.pressed
                        ? 'border-mim-green bg-mim-green/20 text-mim-green'
                        : 'border-mim-border text-mim-muted'
                    }`}
                  >
                    {i}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

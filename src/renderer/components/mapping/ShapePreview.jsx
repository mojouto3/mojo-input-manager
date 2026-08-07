import { shapeValue } from '../../lib/mappingEngine';

const SAMPLES = 28;

// Plots shapeValue(x, config) over x in [-1, 1], the exact same function the
// live 60Hz tick loop runs, so this is never a lie about what a curve or
// deadzone actually does to the signal, not just a schematic illustration.
export default function ShapePreview({ config, width = 84, height = 36 }) {
  const points = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const x = -1 + (2 * i) / SAMPLES;
    const y = shapeValue(x, config);
    points.push(`${((x + 1) / 2) * width},${height - ((y + 1) / 2) * height}`);
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0 text-mim-accent">
      <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="currentColor" strokeOpacity="0.12" />
      <line x1={width / 2} y1="0" x2={width / 2} y2={height} stroke="currentColor" strokeOpacity="0.12" />
      <polyline points={points.join(' ')} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

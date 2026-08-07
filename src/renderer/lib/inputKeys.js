// Composite input keys look like "<gamepad id>:axis:0" or "<gamepad id>:button:3".
// Gamepad API id strings can themselves contain colons (vendor/product info),
// so parsing anchors on the fixed ":axis:<digits>" / ":button:<digits>" suffix
// rather than splitting on every colon.
const AXIS_NAMES = ['X', 'Y', 'Z', 'Rx', 'Ry', 'Rz', 'Sl0', 'Sl1'];
const KEY_PATTERN = /^(.*):(axis|button):(\d+)$/;

export function parseInputKey(key) {
  const match = KEY_PATTERN.exec(key ?? '');
  if (!match) return null;
  return { deviceId: match[1], kind: match[2], index: Number(match[3]) };
}

export function describeInputKey(devices, key) {
  const parsed = parseInputKey(key);
  if (!parsed) return key ?? '';
  const device = devices.find((d) => d.id === parsed.deviceId);
  const deviceLabel = (device ? device.id : parsed.deviceId).split(' (')[0] || 'Unknown device';
  const inputLabel = parsed.kind === 'axis' ? `Axis ${AXIS_NAMES[parsed.index] ?? parsed.index}` : `Button ${parsed.index + 1}`;
  return `${deviceLabel}, ${inputLabel}`;
}

// Buttons only, holding an axis down as a trigger isn't a meaningful concept.
export function listButtons(devices) {
  return devices.flatMap((d) =>
    d.buttons.map((_, i) => ({ key: `${d.id}:button:${i}`, label: `${d.id.split(' (')[0]}, Button ${i + 1}` }))
  );
}

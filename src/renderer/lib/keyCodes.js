// Windows Virtual-Key codes for the keys a Macro step can realistically
// target. Not exhaustive (no exotic OEM/IME keys), just what's actually
// useful for game keybinds: letters, digits, function keys, navigation,
// modifiers, and the common punctuation keys.
export const KEY_OPTIONS = [
  ...('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter, i) => ({ value: 0x41 + i, label: letter }))),
  ...Array.from({ length: 10 }, (_, i) => ({ value: 0x30 + i, label: String(i) })),
  ...Array.from({ length: 12 }, (_, i) => ({ value: 0x70 + i, label: `F${i + 1}` })),
  { value: 0x20, label: 'Space' },
  { value: 0x0d, label: 'Enter' },
  { value: 0x1b, label: 'Esc' },
  { value: 0x09, label: 'Tab' },
  { value: 0x08, label: 'Backspace' },
  { value: 0x2e, label: 'Delete' },
  { value: 0x2d, label: 'Insert' },
  { value: 0x24, label: 'Home' },
  { value: 0x23, label: 'End' },
  { value: 0x21, label: 'Page Up' },
  { value: 0x22, label: 'Page Down' },
  { value: 0x25, label: 'Left Arrow' },
  { value: 0x26, label: 'Up Arrow' },
  { value: 0x27, label: 'Right Arrow' },
  { value: 0x28, label: 'Down Arrow' },
  { value: 0x14, label: 'Caps Lock' },
  { value: 0xa0, label: 'Left Shift' },
  { value: 0xa1, label: 'Right Shift' },
  { value: 0xa2, label: 'Left Ctrl' },
  { value: 0xa3, label: 'Right Ctrl' },
  { value: 0xa4, label: 'Left Alt' },
  { value: 0xa5, label: 'Right Alt' },
  ...Array.from({ length: 10 }, (_, i) => ({ value: 0x60 + i, label: `Numpad ${i}` })),
  { value: 0xba, label: '; :' },
  { value: 0xbb, label: '= +' },
  { value: 0xbc, label: ', <' },
  { value: 0xbd, label: '- _' },
  { value: 0xbe, label: '. >' },
  { value: 0xbf, label: '/ ?' },
  { value: 0xc0, label: '` ~' },
  { value: 0xdb, label: '[ {' },
  { value: 0xdc, label: '\\ |' },
  { value: 0xdd, label: '] }' },
  { value: 0xde, label: "' \"" }
];

export const MOUSE_BUTTON_OPTIONS = [
  { value: 'left', label: 'Left Click' },
  { value: 'right', label: 'Right Click' },
  { value: 'middle', label: 'Middle Click' }
];

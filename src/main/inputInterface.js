const koffi = require('koffi');

// keybd_event/mouse_event over SendInput: Microsoft calls these superseded,
// but they take plain scalar arguments (no struct/union marshalling), which
// keeps this FFI call low-risk to get right the first time. SendInput's
// INPUT struct is a union whose exact memory layout has to match the Win32
// ABI bit-for-bit, a subtle mismatch there risks a native crash rather than
// a caught JS error, not worth it for what a Macro step needs (press/release
// one key or mouse button).

let lib = null;
let fns = null;

function load() {
  if (fns) return fns;
  lib = koffi.load('user32.dll');
  fns = {
    keybd_event: lib.func('keybd_event', 'void', ['uint8', 'uint8', 'uint32', 'uintptr']),
    mouse_event: lib.func('mouse_event', 'void', ['uint32', 'uint32', 'uint32', 'uint32', 'uintptr'])
  };
  return fns;
}

const KEYEVENTF_KEYUP = 0x0002;

function sendKey(vkCode, isDown) {
  load().keybd_event(vkCode, 0, isDown ? 0 : KEYEVENTF_KEYUP, 0);
}

const MOUSE_FLAGS = {
  left: [0x0002, 0x0004],
  right: [0x0008, 0x0010],
  middle: [0x0020, 0x0040]
};

function sendMouseButton(button, isDown) {
  const [downFlag, upFlag] = MOUSE_FLAGS[button] ?? MOUSE_FLAGS.left;
  load().mouse_event(isDown ? downFlag : upFlag, 0, 0, 0, 0);
}

module.exports = { sendKey, sendMouseButton };

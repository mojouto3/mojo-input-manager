const koffi = require('koffi');

const DLL_PATH = 'C:\\Program Files\\vJoy\\x64\\vJoyInterface.dll';

const AXIS_USAGE = [0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37]; // X, Y, Z, RX, RY, RZ, SL0, SL1
const AXIS_MIN = 0;
const AXIS_MAX = 32768;

let lib = null;
let fns = null;

function load() {
  if (fns) return fns;
  lib = koffi.load(DLL_PATH);
  fns = {
    vJoyEnabled: lib.func('vJoyEnabled', 'bool', []),
    AcquireVJD: lib.func('AcquireVJD', 'bool', ['uint32']),
    RelinquishVJD: lib.func('RelinquishVJD', 'void', ['uint32']),
    SetAxis: lib.func('SetAxis', 'bool', ['long', 'uint32', 'uint32']),
    SetBtn: lib.func('SetBtn', 'bool', ['bool', 'uint32', 'uint8'])
  };
  return fns;
}

function isAvailable() {
  try {
    return load().vJoyEnabled();
  } catch {
    return false;
  }
}

function acquire(deviceId) {
  return load().AcquireVJD(deviceId);
}

function relinquish(deviceId) {
  load().RelinquishVJD(deviceId);
}

function axisValueFromGamepad(value) {
  const clamped = Math.min(1, Math.max(-1, value));
  return Math.round(((clamped + 1) / 2) * (AXIS_MAX - AXIS_MIN) + AXIS_MIN);
}

function feed(deviceId, { axes = [], buttons = [] }) {
  const { SetAxis, SetBtn } = load();
  axes.slice(0, AXIS_USAGE.length).forEach((value, i) => {
    SetAxis(axisValueFromGamepad(value), deviceId, AXIS_USAGE[i]);
  });
  buttons.forEach((pressed, i) => {
    SetBtn(Boolean(pressed), deviceId, i + 1);
  });
}

module.exports = { isAvailable, acquire, relinquish, feed };

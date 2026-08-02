const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Keyed by the Gamepad API id string (stable per physical device, matching
// the same key mappingProfiles.js uses), then by axis index. Each axis:
// { invert: bool, deadzone: 0-0.5, curve: 0.1-3 (1 = linear) }.
function storePath() {
  return path.join(app.getPath('userData'), 'axis-settings.json');
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(storePath(), 'utf8'));
  } catch {
    return {};
  }
}

function save(data) {
  fs.writeFileSync(storePath(), JSON.stringify(data, null, 2));
}

function getAll() {
  return load();
}

function setAxis(deviceId, axisIndex, settings) {
  const data = load();
  if (!data[deviceId]) data[deviceId] = {};
  data[deviceId][axisIndex] = settings;
  save(data);
  return data;
}

function replaceAll(data) {
  save(data);
}

module.exports = { getAll, setAxis, replaceAll };

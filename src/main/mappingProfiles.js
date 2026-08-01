const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function storePath() {
  return path.join(app.getPath('userData'), 'mapping-profiles.json');
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(storePath(), 'utf8'));
  } catch {
    return [];
  }
}

function save(profiles) {
  fs.writeFileSync(storePath(), JSON.stringify(profiles, null, 2));
}

function list() {
  return load();
}

// Keyed by the Gamepad API's id string, which is stable per device model
// across app restarts (unlike the numeric index, which depends on connection
// order). One remembered target per physical device: saving again overwrites.
function upsert({ physicalId, physicalName, targetDeviceId }) {
  const profiles = load().filter((p) => p.physicalId !== physicalId);
  profiles.push({ physicalId, physicalName, targetDeviceId });
  save(profiles);
}

function remove(physicalId) {
  save(load().filter((p) => p.physicalId !== physicalId));
}

module.exports = { list, upsert, remove };

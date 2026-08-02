const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function storePath() {
  return path.join(app.getPath('userData'), 'mapping-profiles.json');
}

function normalize(entry) {
  // Older versions stored a single `physicalId` per entry. Normalize those to
  // the current physicalIds[] shape so existing saved mappings keep working.
  const physicalIds = entry.physicalIds ?? (entry.physicalId ? [entry.physicalId] : []);
  return { physicalIds, targetDeviceId: entry.targetDeviceId };
}

function key(physicalIds) {
  return [...physicalIds].sort().join('|');
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(storePath(), 'utf8'));
    return raw.map(normalize);
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

// Keyed by the set of Gamepad API id strings (stable across restarts, unlike
// the numeric index). One remembered target per device combination: saving
// again with the same set of devices overwrites the previous entry.
function upsert({ physicalIds, targetDeviceId }) {
  const profiles = load().filter((p) => key(p.physicalIds) !== key(physicalIds));
  profiles.push({ physicalIds, targetDeviceId });
  save(profiles);
}

function remove(physicalIds) {
  save(load().filter((p) => key(p.physicalIds) !== key(physicalIds)));
}

function replaceAll(profiles) {
  save(profiles.map(normalize));
}

module.exports = { list, upsert, remove, replaceAll };

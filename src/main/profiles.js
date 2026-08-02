const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const hidhide = require('./hidhide');

function storePath() {
  return path.join(app.getPath('userData'), 'profiles.json');
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

function create({ name, appPath, hiddenDevicePaths }) {
  const profiles = load();
  const profile = {
    id: crypto.randomUUID(),
    name,
    appPath,
    hiddenDevicePaths
  };
  profiles.push(profile);
  save(profiles);
  return profile;
}

function remove(id) {
  const profiles = load().filter((p) => p.id !== id);
  save(profiles);
}

function replaceAll(profiles) {
  save(profiles);
}

async function apply(id) {
  const profile = load().find((p) => p.id === id);
  if (!profile) {
    throw new Error('Profile not found.');
  }

  const [currentDevices, currentApps] = [await hidhide.getDevices(), await hidhide.getApps()];
  const shouldBeHidden = new Set(profile.hiddenDevicePaths);

  for (const device of currentDevices) {
    if (shouldBeHidden.has(device.path) && !device.hidden) {
      await hidhide.hideDevice(device.path);
    } else if (!shouldBeHidden.has(device.path) && device.hidden) {
      await hidhide.unhideDevice(device.path);
    }
  }

  if (!currentApps.includes(profile.appPath)) {
    await hidhide.registerApp(profile.appPath);
  }

  await hidhide.setCloak(true);
}

module.exports = { list, create, remove, replaceAll, apply };

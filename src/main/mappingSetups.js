const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// One JSON file per game profile, in a plain visible folder under userData
// (not the install directory, which the auto-updater overwrites on every
// update) so a user can browse, back up, or hand-edit them directly.
function dirPath() {
  return path.join(app.getPath('userData'), 'profiles');
}

function ensureDir() {
  fs.mkdirSync(dirPath(), { recursive: true });
}

function slugify(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'profile';
}

function filePath(id) {
  return path.join(dirPath(), `${id}.json`);
}

function list() {
  ensureDir();
  return fs
    .readdirSync(dirPath())
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dirPath(), f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function create({ name, mappings }) {
  ensureDir();
  const base = slugify(name);
  let id = base;
  let n = 2;
  while (fs.existsSync(filePath(id))) {
    id = `${base}-${n++}`;
  }
  const setup = { id, name, mappings };
  fs.writeFileSync(filePath(id), JSON.stringify(setup, null, 2));
  return setup;
}

function remove(id) {
  const target = filePath(id);
  if (fs.existsSync(target)) fs.unlinkSync(target);
}

function replaceAll(setups) {
  ensureDir();
  for (const existing of list()) {
    remove(existing.id);
  }
  for (const setup of setups) {
    fs.writeFileSync(filePath(setup.id || slugify(setup.name)), JSON.stringify(setup, null, 2));
  }
}

module.exports = { list, create, remove, replaceAll };

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

// Breaks any parentId cycle by cutting the edge of whichever mode re-enters
// an already-visited chain. This is the authoritative check: profiles can
// also arrive via backup:import, bypassing the renderer's own defensive copy
// of this same logic (src/renderer/lib/mappingEngine.js), so it can't be the
// only place a cycle gets caught.
function sanitizeModes(modes) {
  if (!Array.isArray(modes) || modes.length === 0) {
    return [{ id: 'base', name: 'Base', parentId: null }];
  }
  const byId = new Map(modes.map((m) => [m.id, m]));
  return modes.map((mode) => {
    const seen = new Set([mode.id]);
    let parentId = mode.parentId;
    while (parentId) {
      if (seen.has(parentId) || !byId.has(parentId)) return { ...mode, parentId: null };
      seen.add(parentId);
      parentId = byId.get(parentId).parentId;
    }
    return mode;
  });
}

// Fills in the advanced-mapping fields (added after `mappings` already
// existed) with safe defaults on every read, the same normalize-on-read
// pattern mappingProfiles.js uses for its own older single-`physicalId`
// schema, so profiles saved before this feature existed keep working forever
// without a migration step ever touching the file on disk.
function normalize(setup) {
  const rawModes = setup.modes?.length ? setup.modes : [{ id: 'base', name: 'Base', parentId: null }];
  return {
    ...setup,
    schemaVersion: 1,
    modes: sanitizeModes(rawModes),
    defaultModeId: setup.defaultModeId ?? 'base',
    library: setup.library ?? {},
    sequences: setup.sequences ?? {},
    bindings: setup.bindings ?? {},
    // The one button most setups actually need (a single shift/modifier key,
    // per real-world Gremlin/Star Citizen usage), starred on a button in the
    // Advanced Mapping input picker. Every other input then gets a one-click
    // "Shift version" toggle instead of picking a trigger from a list every
    // time.
    shiftKey: setup.shiftKey ?? null
  };
}

function list() {
  ensureDir();
  return fs
    .readdirSync(dirPath())
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return normalize(JSON.parse(fs.readFileSync(path.join(dirPath(), f), 'utf8')));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function readOne(id) {
  try {
    return normalize(JSON.parse(fs.readFileSync(filePath(id), 'utf8')));
  } catch {
    return null;
  }
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

// Shallow-merges patch over an existing saved profile. create() only ever
// appends brand-new profiles by name; the Advanced Mapping editor needs to
// repeatedly edit modes/library/sequences/bindings on a profile that already
// exists, which this is the first thing in this module to support.
function update(id, patch) {
  const current = readOne(id);
  if (!current) return null;
  const next = { ...current, ...patch, id: current.id };
  if (patch.modes) next.modes = sanitizeModes(patch.modes);
  ensureDir();
  fs.writeFileSync(filePath(id), JSON.stringify(next, null, 2));
  return next;
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
    const id = setup.id || slugify(setup.name);
    const safe = { ...normalize(setup), id };
    fs.writeFileSync(filePath(id), JSON.stringify(safe, null, 2));
  }
}

module.exports = { list, create, update, remove, replaceAll };

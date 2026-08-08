const { app, BrowserWindow, Menu, Tray, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const vjoy = require('./vjoy');
const vjoyInterface = require('./vjoyInterface');
const inputInterface = require('./inputInterface');
const hidhide = require('./hidhide');
const profiles = require('./profiles');
const mappingProfiles = require('./mappingProfiles');
const mappingSetups = require('./mappingSetups');
const axisSettings = require('./axisSettings');
const driverSources = require('./driverSources');

// Each vJoy target can be fed independently and concurrently (a HOTAS's
// throttle and stick, or two HOSAS sticks, each mapped to their own target
// at the same time), so active mappings are tracked as a set of device ids
// rather than a single one.
const activeMappingDeviceIds = new Set();

function stopMapping(deviceId) {
  if (activeMappingDeviceIds.has(deviceId)) {
    vjoyInterface.relinquish(deviceId);
    activeMappingDeviceIds.delete(deviceId);
  }
}

function stopAllMappings() {
  for (const deviceId of activeMappingDeviceIds) {
    vjoyInterface.relinquish(deviceId);
  }
  activeMappingDeviceIds.clear();
}
const isDev = !app.isPackaged;
const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.ico');
const startHidden = process.argv.includes('--hidden');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let updateStatus = app.isPackaged ? { status: 'idle' } : { status: 'unsupported' };

Menu.setApplicationMenu(null);

function setUpdateStatus(status) {
  updateStatus = status;
  mainWindow?.webContents.send('updater:status', updateStatus);
}

autoUpdater.on('checking-for-update', () => setUpdateStatus({ status: 'checking' }));
autoUpdater.on('update-available', (info) => setUpdateStatus({ status: 'available', version: info.version }));
autoUpdater.on('update-not-available', () => setUpdateStatus({ status: 'not-available' }));
autoUpdater.on('download-progress', (progress) =>
  setUpdateStatus({ status: 'downloading', percent: Math.round(progress.percent) })
);
autoUpdater.on('update-downloaded', (info) => setUpdateStatus({ status: 'downloaded', version: info.version }));
autoUpdater.on('error', (err) => {
  console.error('Auto-update check failed:', err.message);
  setUpdateStatus({ status: 'error', message: err.message });
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 720,
    minHeight: 480,
    frame: false,
    show: !startHidden,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Mapping runs on requestAnimationFrame; Chromium throttles that (and
      // timers) once the window is hidden, which would silently stall live
      // mapping the moment MIM is minimized to the tray.
      backgroundThrottling: false
    }
  });

  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized-change', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized-change', false));

  // MIM is meant to stay running in the tray, so the close button hides the
  // window instead of quitting; only the tray's Quit item actually exits.
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'renderer', 'index.html'));
  }
}

function showMainWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

let rebuildTrayMenu = () => {};

function createTray() {
  tray = new Tray(iconPath);
  tray.setToolTip('Mojo Input Manager');

  rebuildTrayMenu = () => {
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Mojo Input Manager', click: showMainWindow },
      { type: 'separator' },
      {
        label: 'Launch at startup',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (menuItem) => {
          setLaunchAtStartup(menuItem.checked);
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]));
  };
  rebuildTrayMenu();

  tray.on('click', showMainWindow);
}

function setLaunchAtStartup(enabled) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: enabled ? ['--hidden'] : []
  });
  rebuildTrayMenu();
}

ipcMain.on('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.on('window:toggle-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win?.isMaximized()) {
    win.unmaximize();
  } else {
    win?.maximize();
  }
});

ipcMain.on('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

ipcMain.handle('window:is-maximized', (event) => {
  return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
});

ipcMain.handle('vjoy:get-status', async () => {
  try {
    return { ok: true, devices: await vjoy.getStatus() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('vjoy:create-device', async (event, index) => {
  try {
    await vjoy.createDevice(index);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message, cancelled: Boolean(err.cancelled) };
  }
});

ipcMain.handle('vjoy:delete-device', async (event, index) => {
  try {
    await vjoy.deleteDevice(index);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message, cancelled: Boolean(err.cancelled) };
  }
});

ipcMain.handle('mapping:start', (event, deviceId) => {
  if (!vjoyInterface.isAvailable()) {
    return { ok: false, error: 'vJoy driver is not available.' };
  }
  if (activeMappingDeviceIds.has(deviceId)) {
    return { ok: true };
  }
  const acquired = vjoyInterface.acquire(deviceId);
  if (!acquired) {
    return { ok: false, error: `Device ${deviceId} could not be acquired (it may be in use by another app).` };
  }
  activeMappingDeviceIds.add(deviceId);
  return { ok: true };
});

ipcMain.on('mapping:feed', (event, { deviceId, axes, buttons }) => {
  if (activeMappingDeviceIds.has(deviceId)) {
    vjoyInterface.feed(deviceId, { axes, buttons });
  }
});

ipcMain.handle('mapping:stop', (event, deviceId) => {
  stopMapping(deviceId);
  return { ok: true };
});

// Fire-and-forget, same as mapping:feed, a Macro step firing a key/mouse
// press is edge-triggered from the renderer's own tick loop, an ack round
// trip here would just add latency for no benefit.
ipcMain.on('input:key', (event, { vkCode, down }) => {
  inputInterface.sendKey(vkCode, down);
});

ipcMain.on('input:mouse-button', (event, { button, down }) => {
  inputInterface.sendMouseButton(button, down);
});

ipcMain.handle('hidhide:get-devices', async () => {
  try {
    // HidHideCLI doesn't handle concurrent invocations well, so these must run one at a time.
    const devices = await hidhide.getDevices();
    const cloakEnabled = await hidhide.getCloakState();
    return { ok: true, devices, cloakEnabled };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('hidhide:hide-device', async (event, devicePath) => {
  try {
    await hidhide.hideDevice(devicePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('hidhide:unhide-device', async (event, devicePath) => {
  try {
    await hidhide.unhideDevice(devicePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('hidhide:set-cloak', async (event, enabled) => {
  try {
    await hidhide.setCloak(enabled);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('hidhide:get-apps', async () => {
  try {
    return { ok: true, apps: await hidhide.getApps() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('hidhide:pick-app', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Select an application',
    properties: ['openFile'],
    filters: [{ name: 'Applications', extensions: ['exe'] }]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { ok: false, cancelled: true };
  }
  return { ok: true, path: result.filePaths[0] };
});

ipcMain.handle('hidhide:register-app', async (event, exePath) => {
  try {
    await hidhide.registerApp(exePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('hidhide:unregister-app', async (event, exePath) => {
  try {
    await hidhide.unregisterApp(exePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('profiles:list', () => {
  return { ok: true, profiles: profiles.list() };
});

ipcMain.handle('profiles:create', (event, data) => {
  try {
    return { ok: true, profile: profiles.create(data) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('profiles:remove', (event, id) => {
  profiles.remove(id);
  return { ok: true };
});

ipcMain.handle('profiles:apply', async (event, id) => {
  try {
    await profiles.apply(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('system:check-drivers', () => {
  return {
    vjoyInstalled: Boolean(vjoy.findVJoyConfig()),
    hidhideInstalled: Boolean(hidhide.findCli())
  };
});

const ALLOWED_EXTERNAL_URLS = [
  'https://sourceforge.net/projects/vjoystick/',
  'https://github.com/nefarius/HidHide/releases'
];

ipcMain.handle('system:open-external', (event, url) => {
  if (ALLOWED_EXTERNAL_URLS.includes(url)) {
    shell.openExternal(url);
  }
});

// Windows has no way to deep-link straight to one controller's properties
// page, only to the general list (the user still picks the right vJoy
// device from there), but that's still faster than digging through Settings
// by hand while testing a rule in Advanced Mapping.
ipcMain.handle('system:open-game-controllers', () => {
  exec('control joy.cpl', (err) => {
    if (err) console.error('Failed to open joy.cpl:', err.message);
  });
});

ipcMain.handle('system:get-driver-info', async (event, key) => {
  try {
    return { ok: true, info: await driverSources.getLatest(key) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('system:install-driver', async (event, key) => {
  try {
    return { ok: true, info: await driverSources.downloadAndRun(key) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('system:get-app-version', () => app.getVersion());

ipcMain.handle('system:get-launch-at-startup', () => app.getLoginItemSettings().openAtLogin);

ipcMain.handle('system:set-launch-at-startup', (event, enabled) => {
  setLaunchAtStartup(enabled);
  return { ok: true };
});

ipcMain.handle('system:get-update-status', () => updateStatus);

ipcMain.handle('system:check-for-updates', () => {
  if (app.isPackaged) {
    autoUpdater.checkForUpdates();
  }
});

ipcMain.handle('mapping-profiles:list', () => {
  return mappingProfiles.list();
});

ipcMain.handle('mapping-profiles:save', (event, data) => {
  mappingProfiles.upsert(data);
  return { ok: true };
});

ipcMain.handle('mapping-profiles:remove', (event, physicalIds) => {
  mappingProfiles.remove(physicalIds);
  return { ok: true };
});

ipcMain.handle('mapping-setups:list', () => mappingSetups.list());

ipcMain.handle('mapping-setups:create', (event, data) => mappingSetups.create(data));

ipcMain.handle('mapping-setups:update', (event, { id, patch }) => mappingSetups.update(id, patch));

ipcMain.handle('mapping-setups:remove', (event, id) => {
  mappingSetups.remove(id);
  return { ok: true };
});

ipcMain.handle('axis-settings:get-all', () => axisSettings.getAll());

ipcMain.handle('axis-settings:set', (event, { deviceId, axisIndex, settings }) => {
  return axisSettings.setAxis(deviceId, axisIndex, settings);
});

ipcMain.handle('backup:export', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win, {
    title: 'Export MIM Profiles',
    defaultPath: 'mim-profiles-backup.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) {
    return { ok: false, cancelled: true };
  }
  try {
    const data = {
      exportedAt: new Date().toISOString(),
      version: 1,
      deviceFilteringProfiles: profiles.list(),
      mappingProfiles: mappingProfiles.list(),
      gameProfiles: mappingSetups.list(),
      axisSettings: axisSettings.getAll()
    };
    fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2));
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Split into pick+validate (native file picker is the one native dialog
// every desktop app is expected to have) and a separate apply step, so the
// "are you sure, this replaces everything" confirmation can be a normal
// in-app modal styled like the rest of MIM instead of a native OS message
// box that looked out of place next to a fully custom UI.
// Only reads the raw file and hands the text back, actual XML parsing happens
// in the renderer via its native DOMParser, no XML library needed as a
// dependency here. Joystick Gremlin profile filenames often contain
// bracketed tags (e.g. "[ENH][NXT]"), the file filter is by extension only.
ipcMain.handle('gremlin:pick-import-file', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const picked = await dialog.showOpenDialog(win, {
    title: 'Import Joystick Gremlin Profile',
    properties: ['openFile'],
    filters: [{ name: 'Joystick Gremlin Profile', extensions: ['xml'] }]
  });
  if (picked.canceled || picked.filePaths.length === 0) {
    return { ok: false, cancelled: true };
  }
  try {
    const text = fs.readFileSync(picked.filePaths[0], 'utf8');
    return { ok: true, text, fileName: path.basename(picked.filePaths[0]) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('backup:pick-import-file', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const picked = await dialog.showOpenDialog(win, {
    title: 'Import MIM Profiles',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (picked.canceled || picked.filePaths.length === 0) {
    return { ok: false, cancelled: true };
  }
  try {
    const data = JSON.parse(fs.readFileSync(picked.filePaths[0], 'utf8'));
    if (!Array.isArray(data.deviceFilteringProfiles) || !Array.isArray(data.mappingProfiles)) {
      throw new Error('Not a valid MIM profiles backup file.');
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('backup:apply-import', (event, data) => {
  try {
    const gameProfiles = Array.isArray(data.gameProfiles) ? data.gameProfiles : [];
    profiles.replaceAll(data.deviceFilteringProfiles);
    mappingProfiles.replaceAll(data.mappingProfiles);
    mappingSetups.replaceAll(gameProfiles);
    if (data.axisSettings && typeof data.axisSettings === 'object') {
      axisSettings.replaceAll(data.axisSettings);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);

  app.whenReady().then(() => {
    createWindow();
    createTray();

    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else {
        showMainWindow();
      }
    });
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('window-all-closed', () => {
    stopAllMappings();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
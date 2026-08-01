const { app, BrowserWindow, Menu, Tray, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const vjoy = require('./vjoy');
const vjoyInterface = require('./vjoyInterface');
const hidhide = require('./hidhide');
const profiles = require('./profiles');
const mappingProfiles = require('./mappingProfiles');

let activeMappingDeviceId = null;

function stopActiveMapping() {
  if (activeMappingDeviceId !== null) {
    vjoyInterface.relinquish(activeMappingDeviceId);
    activeMappingDeviceId = null;
  }
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
      nodeIntegration: false
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

function createTray() {
  tray = new Tray(iconPath);
  tray.setToolTip('Mojo Input Manager');

  const rebuildMenu = () => {
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Mojo Input Manager', click: showMainWindow },
      { type: 'separator' },
      {
        label: 'Launch at startup',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (menuItem) => {
          app.setLoginItemSettings({
            openAtLogin: menuItem.checked,
            args: menuItem.checked ? ['--hidden'] : []
          });
          rebuildMenu();
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
  rebuildMenu();

  tray.on('click', showMainWindow);
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
  stopActiveMapping();
  const acquired = vjoyInterface.acquire(deviceId);
  if (!acquired) {
    return { ok: false, error: `Device ${deviceId} could not be acquired (it may be in use by another app).` };
  }
  activeMappingDeviceId = deviceId;
  return { ok: true };
});

ipcMain.on('mapping:feed', (event, state) => {
  if (activeMappingDeviceId !== null) {
    vjoyInterface.feed(activeMappingDeviceId, state);
  }
});

ipcMain.handle('mapping:stop', () => {
  stopActiveMapping();
  return { ok: true };
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

ipcMain.handle('system:get-app-version', () => app.getVersion());

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
    stopActiveMapping();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
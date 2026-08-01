const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const vjoy = require('./vjoy');
const vjoyInterface = require('./vjoyInterface');
const hidhide = require('./hidhide');
const profiles = require('./profiles');

let activeMappingDeviceId = null;

function stopActiveMapping() {
  if (activeMappingDeviceId !== null) {
    vjoyInterface.relinquish(activeMappingDeviceId);
    activeMappingDeviceId = null;
  }
}
const isDev = !app.isPackaged;
const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.ico');

Menu.setApplicationMenu(null);

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 720,
    minHeight: 480,
    frame: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized-change', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized-change', false));

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'renderer', 'index.html'));
  }
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

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopActiveMapping();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
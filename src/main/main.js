const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const vjoy = require('./vjoy');
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

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
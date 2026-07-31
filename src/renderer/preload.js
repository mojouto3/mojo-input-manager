const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mim', {
  version: process.versions.electron,
  windowControls: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: (callback) => {
      const listener = (_event, isMaximized) => callback(isMaximized);
      ipcRenderer.on('window:maximized-change', listener);
      return () => ipcRenderer.removeListener('window:maximized-change', listener);
    }
  },
  vjoy: {
    getStatus: () => ipcRenderer.invoke('vjoy:get-status'),
    createDevice: (index) => ipcRenderer.invoke('vjoy:create-device', index),
    deleteDevice: (index) => ipcRenderer.invoke('vjoy:delete-device', index)
  },
  mapping: {
    start: (deviceId) => ipcRenderer.invoke('mapping:start', deviceId),
    feed: (state) => ipcRenderer.send('mapping:feed', state),
    stop: () => ipcRenderer.invoke('mapping:stop')
  }
});
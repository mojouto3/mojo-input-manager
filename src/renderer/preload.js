const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('mim', {
  version: process.versions.electron
});
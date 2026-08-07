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
    stop: (deviceId) => ipcRenderer.invoke('mapping:stop', deviceId)
  },
  hidhide: {
    getDevices: () => ipcRenderer.invoke('hidhide:get-devices'),
    hideDevice: (devicePath) => ipcRenderer.invoke('hidhide:hide-device', devicePath),
    unhideDevice: (devicePath) => ipcRenderer.invoke('hidhide:unhide-device', devicePath),
    setCloak: (enabled) => ipcRenderer.invoke('hidhide:set-cloak', enabled),
    getApps: () => ipcRenderer.invoke('hidhide:get-apps'),
    pickApp: () => ipcRenderer.invoke('hidhide:pick-app'),
    registerApp: (exePath) => ipcRenderer.invoke('hidhide:register-app', exePath),
    unregisterApp: (exePath) => ipcRenderer.invoke('hidhide:unregister-app', exePath)
  },
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list'),
    create: (data) => ipcRenderer.invoke('profiles:create', data),
    remove: (id) => ipcRenderer.invoke('profiles:remove', id),
    apply: (id) => ipcRenderer.invoke('profiles:apply', id)
  },
  system: {
    checkDrivers: () => ipcRenderer.invoke('system:check-drivers'),
    openExternal: (url) => ipcRenderer.invoke('system:open-external', url),
    getAppVersion: () => ipcRenderer.invoke('system:get-app-version'),
    getLaunchAtStartup: () => ipcRenderer.invoke('system:get-launch-at-startup'),
    setLaunchAtStartup: (enabled) => ipcRenderer.invoke('system:set-launch-at-startup', enabled),
    getUpdateStatus: () => ipcRenderer.invoke('system:get-update-status'),
    checkForUpdates: () => ipcRenderer.invoke('system:check-for-updates'),
    getDriverInfo: (key) => ipcRenderer.invoke('system:get-driver-info', key),
    installDriver: (key) => ipcRenderer.invoke('system:install-driver', key),
    onUpdateStatus: (callback) => {
      const listener = (_event, status) => callback(status);
      ipcRenderer.on('updater:status', listener);
      return () => ipcRenderer.removeListener('updater:status', listener);
    }
  },
  mappingProfiles: {
    list: () => ipcRenderer.invoke('mapping-profiles:list'),
    save: (data) => ipcRenderer.invoke('mapping-profiles:save', data),
    remove: (physicalIds) => ipcRenderer.invoke('mapping-profiles:remove', physicalIds)
  },
  mappingSetups: {
    list: () => ipcRenderer.invoke('mapping-setups:list'),
    create: (data) => ipcRenderer.invoke('mapping-setups:create', data),
    update: (id, patch) => ipcRenderer.invoke('mapping-setups:update', { id, patch }),
    remove: (id) => ipcRenderer.invoke('mapping-setups:remove', id)
  },
  axisSettings: {
    getAll: () => ipcRenderer.invoke('axis-settings:get-all'),
    set: (deviceId, axisIndex, settings) => ipcRenderer.invoke('axis-settings:set', { deviceId, axisIndex, settings })
  },
  backup: {
    export: () => ipcRenderer.invoke('backup:export'),
    import: () => ipcRenderer.invoke('backup:import')
  }
});
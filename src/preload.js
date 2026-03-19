const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getVolumes: () => ipcRenderer.invoke('get-volumes'),
  selectDestination: () => ipcRenderer.invoke('select-destination'),
  startBackup: (args) => ipcRenderer.invoke('start-backup', args),
  openInfoWindow: (args) => ipcRenderer.invoke('open-info-window', args),
  revealInExplorer: (folderPath) => ipcRenderer.invoke('reveal-in-explorer', folderPath),
  checkSizes: (args) => ipcRenderer.invoke('check-sizes', args),
  cancelBackup: () => ipcRenderer.invoke('cancel-backup'),
  startWatcher: (config) => ipcRenderer.invoke('start-watcher', config),
  stopWatcher: () => ipcRenderer.invoke('stop-watcher'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  onProgress: (callback) => ipcRenderer.on('backup-progress', (_, data) => callback(data)),
  onNewCard: (callback) => ipcRenderer.on('new-card-detected', (_, data) => callback(data)),
  onCardRemoved: (callback) => ipcRenderer.on('card-removed', (_, data) => callback(data)),

  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});

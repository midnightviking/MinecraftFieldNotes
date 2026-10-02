const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fieldNotes', {
  getData: () => ipcRenderer.invoke('data:list'),
  saveWaypoint: (waypoint) => ipcRenderer.invoke('waypoint:save', waypoint),
  deleteWaypoint: (id) => ipcRenderer.invoke('waypoint:delete', id),
  saveWorld: (world) => ipcRenderer.invoke('world:save', world),
  deleteWorld: (id) => ipcRenderer.invoke('world:delete', id),
  saveCategory: (category) => ipcRenderer.invoke('category:save', category),
  deleteCategory: (id) => ipcRenderer.invoke('category:delete', id),
  connectSync: (address) => ipcRenderer.invoke('sync:connect', address),
  hide: () => ipcRenderer.send('window:hide'),
  saveAndClose: (waypoint) => ipcRenderer.send('waypoint:save-and-close', waypoint),
  getPinned: () => ipcRenderer.invoke('window:get-pinned'),
  setPinned: (pinned) => ipcRenderer.invoke('window:set-pinned', pinned),
  onCoordinates: (callback) => ipcRenderer.on('clipboard-coordinates', (_event, value) => callback(value)),
  onDataUpdated: (callback) => ipcRenderer.on('data-updated', (_event, value) => callback(value)),
  onSyncStatus: (callback) => ipcRenderer.on('sync-status', (_event, value) => callback(value)),
  onSyncError: (callback) => ipcRenderer.on('sync-error', (_event, value) => callback(value)),
  onMinecraftStatus: (callback) => ipcRenderer.on('minecraft-status', (_event, value) => callback(value)),
  onRequestFocusName: (callback) => ipcRenderer.on('request-focus-name', () => callback())
});

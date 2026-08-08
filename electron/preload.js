'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clowk', {
  getSetupState: () => ipcRenderer.invoke('setup:state'),
  launch: (prefs) => ipcRenderer.invoke('setup:launch', prefs),
  quit: () => ipcRenderer.invoke('setup:quit'),
  action: (reason) => ipcRenderer.send('clowk-action', reason),
  onCompatMessage: (cb) => ipcRenderer.on('setup:compat', (_event, message) => cb(message)),
});

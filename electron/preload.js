'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clowk', {
  getSetupState: () => ipcRenderer.invoke('setup:state'),
  launch: (prefs) => ipcRenderer.invoke('setup:launch', prefs),
  action: (reason) => ipcRenderer.send('clowk-action', reason),
});

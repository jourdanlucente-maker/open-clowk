'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clowk', {
  dismiss: (reason) => ipcRenderer.send('clowk-dismiss', reason),
});

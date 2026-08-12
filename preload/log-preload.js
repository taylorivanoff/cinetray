const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onLogInit: (cb) => {
    ipcRenderer.on('log-init', (_e, entries) => cb(entries));
  },
  onLog: (cb) => {
    ipcRenderer.on('log', (_e, entry) => cb(entry));
  },
  requestLogs: () => ipcRenderer.send('log-request')
});

const { contextBridge, ipcRenderer } = require('electron');

const IPC_TIMEOUT_MS = 30_000;

function invoke(channel, ...args) {
  return Promise.race([
    ipcRenderer.invoke(channel, ...args),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`IPC timeout (${channel})`)), IPC_TIMEOUT_MS);
    })
  ]);
}

contextBridge.exposeInMainWorld('mediaRenamer', {
  getSettings: () => invoke('settings:get'),
  setSettings: (settings) => invoke('settings:set', settings),
  selectFolder: () => invoke('select-folder'),
  testApiKey: (apiKey) => invoke('test-api-key', apiKey),
  runManual: () => invoke('run-manual'),
  runStructureCheck: () => invoke('run-structure-check'),
  openConsole: () => invoke('open-console'),
  onLogInit: (cb) => {
    ipcRenderer.on('log-init', (_e, entries) => cb(entries));
  },
  onLog: (cb) => {
    ipcRenderer.on('log', (_e, entry) => cb(entry));
  },
  requestLogs: () => ipcRenderer.send('log-request')
});

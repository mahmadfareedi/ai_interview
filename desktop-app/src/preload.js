const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('app', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (patch) => ipcRenderer.invoke('save-settings', patch),
  testCall: (prompt) => ipcRenderer.invoke('test-call', prompt),
  onShowAnswer: (cb) => ipcRenderer.on('show-answer', (_e, payload) => cb(payload)),
  onHide: (cb) => ipcRenderer.on('hide', cb),
});


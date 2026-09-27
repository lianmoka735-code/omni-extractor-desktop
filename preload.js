const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  extract: (content) => ipcRenderer.invoke('api:extract', content),
  getHistory: () => ipcRenderer.invoke('api:get-history'),
  deleteHistory: (id) => ipcRenderer.invoke('api:delete-history', id),
  clearHistory: () => ipcRenderer.invoke('api:clear-history'),
  readClipboard: () => ipcRenderer.invoke('api:read-clipboard'),
  writeClipboard: (text) => ipcRenderer.invoke('api:write-clipboard', text),
  openExternal: (url) => ipcRenderer.invoke('api:open-external', url),
  downloadMedia: (options) => ipcRenderer.invoke('api:download-media', options),
  downloadBatchImages: (options) => ipcRenderer.invoke('api:download-batch-images', options),
  showInFolder: (path) => ipcRenderer.invoke('api:show-in-folder', path)
});

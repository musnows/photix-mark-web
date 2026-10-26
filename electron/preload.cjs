const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('yingqianDesktop', {
  getExportDirectory: () => ipcRenderer.invoke('export:get-directory'),
  chooseExportDirectory: () => ipcRenderer.invoke('export:choose-directory'),
  resetExportDirectory: () => ipcRenderer.invoke('export:reset-directory'),
  openExportDirectory: () => ipcRenderer.invoke('export:open-directory'),
  saveFile: (file) => ipcRenderer.invoke('export:save-file', file),
  getSavedSignature: () => ipcRenderer.invoke('signature:get'),
  saveSignature: (file) => ipcRenderer.invoke('signature:save', file),
  clearSavedSignature: () => ipcRenderer.invoke('signature:clear')
})

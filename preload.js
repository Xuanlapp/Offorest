import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('offorestPromptStore', {
  getPath: () => ipcRenderer.invoke('prompts-moi:path'),
  load: () => ipcRenderer.invoke('prompts-moi:load'),
  save: (promptKey, promptValue) =>
    ipcRenderer.invoke('prompts-moi:save', { promptKey, promptValue }),
  remove: (promptKey) => ipcRenderer.invoke('prompts-moi:remove', { promptKey }),
})

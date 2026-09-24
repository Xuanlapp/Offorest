import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('offorestPromptStore', {
  getPath: () => ipcRenderer.invoke('prompts-moi:path'),
  load: () => ipcRenderer.invoke('prompts-moi:load'),
  save: (promptKey, promptValue) =>
    ipcRenderer.invoke('prompts-moi:save', { promptKey, promptValue }),
  remove: (promptKey) => ipcRenderer.invoke('prompts-moi:remove', { promptKey }),
})

contextBridge.exposeInMainWorld('offorestMockup', {
  resolveImageDataUrl: ({ sourceUrl }) =>
    ipcRenderer.invoke('mockup:resolve-image-data-url', { sourceUrl }),
  getDefaultPsdFile: () => ipcRenderer.invoke('mockup:default-psd'),
  pickPsdFile: () => ipcRenderer.invoke('mockup:pick-psd'),
  preparePreviewOverlay: ({ psdPath }) =>
    ipcRenderer.invoke('mockup:prepare-preview-overlay', { psdPath }),
  renderFromPsd: ({ psdPath, designDataUrl, renderer }) =>
    ipcRenderer.invoke('mockup:render-psd', { psdPath, designDataUrl, renderer }),
  renderFromPsdProgressive: ({ psdPath, designDataUrl, renderer, requestId }) =>
    ipcRenderer.invoke('mockup:render-psd-progressive', { psdPath, designDataUrl, renderer, requestId }),
  renderTemplatePreview: ({ psdPath }) =>
    ipcRenderer.invoke('mockup:render-template-preview', { psdPath }),
  onRenderFromPsdProgress: (callback) => {
    const channel = 'mockup:render-psd-progress'
    const listener = (_event, payload) => {
      if (typeof callback === 'function') {
        callback(payload)
      }
    }

    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },
})

contextBridge.exposeInMainWorld('offorestLogger', {
  getLogPath: () => ipcRenderer.invoke('app-log:path'),
  append: ({ level = 'log', message = '' }) =>
    ipcRenderer.invoke('app-log:append', { level, message }),
  read: ({ maxChars = 200000 } = {}) =>
    ipcRenderer.invoke('app-log:read', { maxChars }),
  clear: () => ipcRenderer.invoke('app-log:clear'),
})

contextBridge.exposeInMainWorld('offorestExternalEditor', {
  startPhotoshopSession: ({ dataUrl, fileName = 'offorest-edit', timeoutMs = 1800000 }) =>
    ipcRenderer.invoke('external-image:start-photoshop-session', { dataUrl, fileName, timeoutMs }),
  stopPhotoshopSession: ({ sessionId }) =>
    ipcRenderer.invoke('external-image:stop-photoshop-session', { sessionId }),
  openInPhotoshop: ({ dataUrl, fileName = 'offorest-edit', timeoutMs = 1800000 }) =>
    ipcRenderer.invoke('external-image:open-in-photoshop', { dataUrl, fileName, timeoutMs }),
  onPhotoshopSessionEvent: (callback) => {
    const channel = 'external-image:photoshop-session-event'
    const listener = (_event, payload) => {
      if (typeof callback === 'function') {
        callback(payload)
      }
    }

    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },
})

contextBridge.exposeInMainWorld('offorestGeminiApp', {
  bootstrap: ({ projectUrl = 'https://gemini.google.com/app', autoLogin = false } = {}) =>
    ipcRenderer.invoke('gemini-app:bootstrap', { projectUrl, autoLogin }),
  getState: () =>
    ipcRenderer.invoke('gemini-app:get-state'),
  openLogin: ({ projectUrl = 'https://gemini.google.com/app' } = {}) =>
    ipcRenderer.invoke('gemini-app:open-login', { projectUrl }),
  openPersistentChat: ({ projectUrl = 'https://gemini.google.com/app' } = {}) =>
    ipcRenderer.invoke('gemini-app:open-persistent-chat', { projectUrl }),
  getCookies: ({ projectUrl = 'https://gemini.google.com/app' } = {}) =>
    ipcRenderer.invoke('gemini-app:get-cookies', { projectUrl }),
  checkSession: ({ projectUrl = 'https://gemini.google.com/app' } = {}) =>
    ipcRenderer.invoke('gemini-app:check-session', { projectUrl }),
  redesign: ({ imageUrl = '', prompt = '', timeoutMs = 300000, projectUrl = 'https://gemini.google.com/app' }) =>
    ipcRenderer.invoke('gemini-app:redesign', { imageUrl, prompt, timeoutMs, projectUrl }),
})

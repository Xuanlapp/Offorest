export const pickMockupPsdFile = async () => {
  if (!window?.offorestMockup?.pickPsdFile) {
    throw new Error('Tính năng PSD mockup chỉ chạy trong app desktop Electron.')
  }

  const result = await window.offorestMockup.pickPsdFile()
  return {
    canceled: !!result?.canceled,
    filePath: result?.filePath || null,
  }
}

const getLocalWorkerBridge = () => {
  if (!window?.offorestMockup?.getLocalWorkerConfig) {
    throw new Error('Local mockup worker chỉ chạy trong app desktop Electron.')
  }

  return window.offorestMockup
}

export const getLocalMockupWorkerConfig = async () => getLocalWorkerBridge().getLocalWorkerConfig()

export const pickLocalMockupWorkerStorageRoot = async () => {
  const bridge = getLocalWorkerBridge()
  if (typeof bridge.pickLocalWorkerStorageRoot !== 'function') {
    throw new Error('Không thể chọn thư mục ngoài app desktop Electron.')
  }
  return bridge.pickLocalWorkerStorageRoot()
}

export const pickLocalMockupWorkerXlapProject = async () => {
  const bridge = getLocalWorkerBridge()
  if (typeof bridge.pickLocalWorkerXlapProject !== 'function') {
    throw new Error('Không thể chọn project XLAP ngoài app desktop Electron.')
  }
  return bridge.pickLocalWorkerXlapProject()
}

export const readLocalMockupWorkerOutputImage = async (outputUrl) => {
  const bridge = getLocalWorkerBridge()
  if (typeof bridge.readLocalWorkerOutputImage !== 'function') {
    throw new Error('Không thể đọc output local ngoài app desktop Electron.')
  }
  return bridge.readLocalWorkerOutputImage({ outputUrl })
}

export const saveLocalMockupWorkerConfig = async (config) =>
  getLocalWorkerBridge().saveLocalWorkerConfig(config)

export const startLocalMockupWorker = async () => getLocalWorkerBridge().startLocalWorker()

export const stopLocalMockupWorker = async () => getLocalWorkerBridge().stopLocalWorker()

export const getLocalMockupWorkerStatus = async () => getLocalWorkerBridge().getLocalWorkerStatus()

export const getDefaultMockupPsdFile = async () => {
  if (!window?.offorestMockup?.getDefaultPsdFile) {
    return { filePath: null }
  }

  return window.offorestMockup.getDefaultPsdFile()
}

export const renderMockupsFromPsd = async ({ psdPath, designDataUrl, renderer, preferPhotoshop }) => {
  if (!window?.offorestMockup?.renderFromPsd) {
    throw new Error('Tính năng PSD mockup chỉ chạy trong app desktop Electron.')
  }

  return window.offorestMockup.renderFromPsd({ psdPath, designDataUrl, renderer, preferPhotoshop })
}

export const renderMockupsFromPsdProgressive = async ({
  psdPath,
  designDataUrl,
  renderer,
  preferPhotoshop,
  onOutput,
}) => {
  const canStream =
    typeof window?.offorestMockup?.renderFromPsdProgressive === 'function'
    && typeof window?.offorestMockup?.onRenderFromPsdProgress === 'function'

  if (!canStream) {
    const fallback = await renderMockupsFromPsd({ psdPath, designDataUrl, renderer, preferPhotoshop })
    if (typeof onOutput === 'function' && Array.isArray(fallback?.outputs)) {
      fallback.outputs.forEach((output, index) => {
        onOutput(output, { index: index + 1, total: fallback.outputs.length })
      })
    }
    return fallback
  }

  const requestId = `mockup-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const unsubscribe = window.offorestMockup.onRenderFromPsdProgress((payload) => {
    if (String(payload?.requestId || '') !== requestId) return
    if (typeof onOutput === 'function' && payload?.output) {
      onOutput(payload.output, {
        index: Number(payload?.index || 0),
        total: Number(payload?.total || 0),
      })
    }
  })

  try {
    return await window.offorestMockup.renderFromPsdProgressive({
      psdPath,
      designDataUrl,
      renderer,
      preferPhotoshop,
      requestId,
    })
  } finally {
    if (typeof unsubscribe === 'function') {
      unsubscribe()
    }
  }
}

export const renderMockupTemplatePreview = async ({ psdPath }) => {
  if (!window?.offorestMockup?.renderTemplatePreview) {
    throw new Error('Tính năng preview mockup template chỉ chạy trong app desktop Electron.')
  }

  return window.offorestMockup.renderTemplatePreview({ psdPath })
}

export const prepareMockupPreviewOverlay = async ({ psdPath }) => {
  if (!window?.offorestMockup?.preparePreviewOverlay) {
    throw new Error('Tính năng WebGL mockup chỉ chạy trong app desktop Electron.')
  }

  return window.offorestMockup.preparePreviewOverlay({ psdPath })
}

export const openImageInPhotoshop = async ({ dataUrl, fileName, timeoutMs = 1800000 }) => {
  if (!window?.offorestExternalEditor?.openInPhotoshop) {
    throw new Error('Tinh nang Photoshop chi hoat dong trong app desktop Electron.')
  }

  return window.offorestExternalEditor.openInPhotoshop({
    dataUrl,
    fileName,
    timeoutMs,
  })
}

export const startPhotoshopSession = async ({ dataUrl, fileName, timeoutMs = 1800000 }) => {
  const bridge = window?.offorestExternalEditor
  if (!bridge) {
    throw new Error('Tinh nang Photoshop chi hoat dong trong app desktop Electron.')
  }

  if (typeof bridge.startPhotoshopSession === 'function') {
    try {
      return await bridge.startPhotoshopSession({
        dataUrl,
        fileName,
        timeoutMs,
      })
    } catch (error) {
      const message = String(error?.message || '')
      const canUseLegacy = typeof bridge.openInPhotoshop === 'function'
      const isMissingHandler =
        message.includes('No handler registered') ||
        message.includes('external-image:start-photoshop-session')

      if (!canUseLegacy || !isMissingHandler) {
        throw error
      }
    }
  }

  if (typeof bridge.openInPhotoshop === 'function') {
    const legacy = await bridge.openInPhotoshop({
      dataUrl,
      fileName,
      timeoutMs,
    })

    // Compatibility response so UI can still receive the first update.
    return {
      sessionId: `legacy-${Date.now()}`,
      legacy: true,
      status: legacy?.status || 'unknown',
      dataUrl: legacy?.dataUrl || null,
    }
  }

  throw new Error('Khong tim thay bridge Photoshop trong preload.')
}

export const stopPhotoshopSession = async ({ sessionId }) => {
  if (!window?.offorestExternalEditor?.stopPhotoshopSession) {
    return { ok: false, reason: 'bridge-not-available' }
  }

  return window.offorestExternalEditor.stopPhotoshopSession({ sessionId })
}

export const subscribePhotoshopSessionEvents = (callback) => {
  if (!window?.offorestExternalEditor?.onPhotoshopSessionEvent) {
    return () => {}
  }

  return window.offorestExternalEditor.onPhotoshopSessionEvent(callback)
}

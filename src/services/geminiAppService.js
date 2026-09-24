const GEMINI_DEFAULT_URL = 'https://gemini.google.com/app'

const getBridge = () => window?.offorestGeminiApp || null

const ensureBridgeMethod = (methodName) => {
  const bridge = getBridge()
  if (!bridge || typeof bridge[methodName] !== 'function') {
    throw new Error('Tinh nang Gemini App chi hoat dong trong app desktop Electron.')
  }
  return bridge
}

export const getGeminiAppState = async () => {
  const bridge = getBridge()

  if (bridge?.getState) {
    return bridge.getState()
  }

  return {
    ready: Boolean(bridge),
    auth: {
      // Electron bridge hien tai khong expose trang thai auth chi tiet.
      isLoggedIn: true,
      mode: bridge ? 'desktop' : 'browser',
    },
    chat: {
      persistent: true,
      url: localStorage.getItem('geminiProjectUrl') || GEMINI_DEFAULT_URL,
    },
  }
}

export const bootstrapGeminiApp = async ({ projectUrl = GEMINI_DEFAULT_URL } = {}) => {
  localStorage.setItem('geminiProjectUrl', projectUrl || GEMINI_DEFAULT_URL)

  const bridge = getBridge()
  if (bridge?.bootstrap) {
    return bridge.bootstrap({
      projectUrl: projectUrl || GEMINI_DEFAULT_URL,
      autoLogin: false,
    })
  }

  return getGeminiAppState()
}

export const ensureGeminiPersistentChat = async ({ projectUrl = GEMINI_DEFAULT_URL } = {}) => {
  const normalizedUrl = projectUrl || GEMINI_DEFAULT_URL
  localStorage.setItem('geminiProjectUrl', normalizedUrl)

  const bridge = getBridge()
  if (bridge?.openPersistentChat) {
    return bridge.openPersistentChat({ projectUrl: normalizedUrl })
  }

  return {
    ok: true,
    persistent: true,
    chatUrl: normalizedUrl,
  }
}

export const openGeminiAppLogin = async () => {
  const bridge = ensureBridgeMethod('openLogin')
  const projectUrl = localStorage.getItem('geminiProjectUrl') || GEMINI_DEFAULT_URL
  return bridge.openLogin({ projectUrl })
}

export const openGeminiPersistentChat = async ({ projectUrl = GEMINI_DEFAULT_URL } = {}) => {
  const normalizedUrl = projectUrl || GEMINI_DEFAULT_URL
  const bridge = getBridge()
  if (bridge?.openPersistentChat) {
    return bridge.openPersistentChat({ projectUrl: normalizedUrl })
  }

  await openGeminiAppLogin({ projectUrl: normalizedUrl })
  return {
    ok: true,
    chatUrl: normalizedUrl,
  }
}

export const getGeminiAppCookies = async ({ projectUrl = GEMINI_DEFAULT_URL } = {}) => {
  const bridge = getBridge()
  if (bridge?.getCookies) {
    return bridge.getCookies({ projectUrl: projectUrl || GEMINI_DEFAULT_URL })
  }

  return {
    cookies: [],
    generatedAt: new Date().toISOString(),
  }
}

export const checkGeminiAppSession = async ({ projectUrl = GEMINI_DEFAULT_URL } = {}) => {
  const bridge = getBridge()
  if (bridge?.checkSession) {
    return bridge.checkSession({ projectUrl: projectUrl || GEMINI_DEFAULT_URL })
  }

  return {
    ok: true,
    projectUrl: projectUrl || GEMINI_DEFAULT_URL,
    cookies: [],
    generatedAt: new Date().toISOString(),
  }
}

export const redesignImageWithGeminiApp = async ({
  imageUrl = '',
  prompt = '',
  timeoutMs = 300000,
  projectUrl = GEMINI_DEFAULT_URL,
  context = null,
} = {}) => {
  const bridge = ensureBridgeMethod('redesign')
  const result = await bridge.redesign({
    imageUrl,
    prompt,
    timeoutMs,
    projectUrl,
  })

  return {
    ...result,
    payload: {
      projectUrl,
      prompt,
      sourceImage: imageUrl,
      sourceImageKind: context?.page === 'redesign' ? 'SOURCE_COMPETITOR' : 'UNKNOWN',
      sourceImageLabel: context?.title || context?.keyword || '',
      context,
      cookies: [],
      generatedAt: new Date().toISOString(),
    },
  }
}

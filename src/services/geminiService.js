/**
 * Gemini Service - Image Redesign & AI Generation
 * Routes all AI calls through Offorest backend APIs.
 * Frontend only sends user auth token; no client-side api_key handling.
 */

import { getCurrentUser } from './authService'
import { PROMPTS } from '../prompt/Prompts'

const BACKEND_URL ='https://nhxlap.id.vn/wp-json/offorest-api/v1'
const LOCAL_BACKEND_URL = 'http://offorest-wp.com.vn/wp-json/offorest-api/v1'

const REQUEST_CONFIG = {
  minGapMs: 1200,
  maxAttempts: 5,
  baseBackoffMs: 2000,
  maxBackoffMs: 30000,
  maxConcurrent: 2,
}

let lastRequestTime = 0

// Queue variables for concurrency-limited request handling
let _requestQueue = []
let _activeCount = 0

// ==================== CORE REQUEST ====================

const getAuthHeaders = () => {
  const user = getCurrentUser()
  const authToken = user?.token || user?.access_token

  return {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const randomJitter = (baseMs, ratio = 0.35) => {
  const min = Math.max(0, 1 - ratio)
  const max = 1 + ratio
  return baseMs * (min + Math.random() * (max - min))
}

const parseRetryAfterMs = (response) => {
  const retryAfter = response.headers.get('retry-after')
  if (!retryAfter) return 0

  const numeric = Number(retryAfter)
  if (!Number.isNaN(numeric) && numeric > 0) {
    return numeric * 1000
  }

  const dateMs = Date.parse(retryAfter)
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now())
  }

  return 0
}

const isRetryableStatus = (status) => [429, 500, 502, 503, 504].includes(status)

const isRetryableError = (error) => {
  return !!(
    error && (error.isNetworkError || (typeof error.status === 'number' && isRetryableStatus(error.status)))
  )
}

const getRetryDelayMs = (attempt, retryAfterMs = 0) => {
  if (retryAfterMs > 0) {
    return Math.min(REQUEST_CONFIG.maxBackoffMs, Math.round(randomJitter(retryAfterMs, 0.2)))
  }

  const exponent = Math.max(0, attempt - 1)
  const baseDelay = REQUEST_CONFIG.baseBackoffMs * (2 ** exponent)
  const jittered = Math.round(randomJitter(baseDelay))
  return Math.min(REQUEST_CONFIG.maxBackoffMs, jittered)
}

const processQueue = async () => {
  if (_activeCount >= REQUEST_CONFIG.maxConcurrent) return
  const item = _requestQueue.shift()
  if (!item) return

  _activeCount += 1

  const run = async () => {
    try {
      const elapsed = Date.now() - lastRequestTime
      const waitMs = Math.max(0, REQUEST_CONFIG.minGapMs - elapsed)
      if (waitMs > 0) await sleep(waitMs)

      lastRequestTime = Date.now()
      const result = await item.task()
      item.resolve(result)
    } catch (err) {
      item.reject(err)
    } finally {
      _activeCount -= 1
      // continue processing next items
      // small timeout to avoid tight loop
      setTimeout(processQueue, 0)
    }
  }

  run()
}

const enqueueSequentialRequest = (task) => {
  return new Promise((resolve, reject) => {
    _requestQueue.push({ task, resolve, reject })
    // try to process immediately
    processQueue()
  })
}

const performBackendRequest = async (baseUrl, endpoint, payload, headers) => {
  let response
  const normalizedEndpoint = String(endpoint || '').replace(/^\/+/, '')
  const url = new URL(normalizedEndpoint, `${baseUrl}/`).toString()

  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
  } catch (error) {
    console.error('Backend Network Error:', error)
    const networkError = new Error('Không thể kết nối backend (network/CORS). Kiểm tra lại API URL và CORS server.')
    networkError.isNetworkError = true
    throw networkError
  }

  const contentType = response.headers.get('content-type') || ''
  const retryAfterMs = parseRetryAfterMs(response)
  let data = null

  try {
    if (contentType.includes('application/json')) {
      data = await response.json()
    } else {
      const text = await response.text()
      try {
        data = JSON.parse(text)
      } catch {
        data = { message: text }
      }
    }
  } catch (parseError) {
    console.error('Backend Parse Error:', parseError)
    throw new Error(`Backend trả về dữ liệu không hợp lệ (status ${response.status}).`)
  }

  if (!response.ok) {
    console.error('Backend API Error:', {
      endpoint,
      status: response.status,
      data,
    })

    const apiError = new Error(data?.message || data?.error?.message || `API lỗi: ${response.status}`)
    apiError.status = response.status
    apiError.retryAfterMs = retryAfterMs
    throw apiError
  }

  return data
}

const requestWithRetry = async (baseUrl, endpoint, payload) => {
  const headers = getAuthHeaders()

  for (let attempt = 1; attempt <= REQUEST_CONFIG.maxAttempts; attempt += 1) {
    try {
      return await enqueueSequentialRequest(() => performBackendRequest(baseUrl, endpoint, payload, headers))
    } catch (error) {
      const shouldRetry = attempt < REQUEST_CONFIG.maxAttempts && isRetryableError(error)
      if (!shouldRetry) {
        throw error
      }

      const retryDelayMs = getRetryDelayMs(attempt, error.retryAfterMs)
      console.warn(
        `[geminiService] Retry ${attempt}/${REQUEST_CONFIG.maxAttempts - 1} for ${endpoint} after ${retryDelayMs}ms`,
        { status: error.status }
      )
      await sleep(retryDelayMs)
    }
  }

  throw new Error('Đã vượt quá số lần thử lại request backend.')
}

const callBackend = async (endpoint, payload) => {
  return requestWithRetry(BACKEND_URL, endpoint, payload)
}


const callLocalBackend = async (endpoint, payload) => {
  return requestWithRetry(LOCAL_BACKEND_URL, endpoint, payload)
}

const logOutgoingPrompt = (label, promptText) => {
  const normalizedPrompt = String(promptText || '')

  if (typeof window !== 'undefined') {
    window.__OFFOREST_LAST_PROMPT__ = {
      label,
      prompt: normalizedPrompt,
      at: new Date().toISOString(),
    }
  }
}

// ==================== IMAGE HELPER ====================

/**
 * Fetch image from URL → base64, thử qua proxy nếu bị CORS
 */
const imageBlobToDataUrl = async (blob) => {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Không thể chuyển ảnh sang data URL'))
        return
      }
      resolve(reader.result)
    }
    reader.onerror = () => reject(new Error('Không thể chuyển ảnh sang base64'))
    reader.readAsDataURL(blob)
  })
}

const imageFileToBase64 = async (file) => {
  const mimeType = file?.type || 'image/jpeg'
  const dataUrl = await imageBlobToDataUrl(file)
  const rawBase64 = dataUrl.split(',')[1]

  if (!rawBase64) {
    throw new Error('Không lấy được chuỗi base64 từ file ảnh')
  }

  return { base64: rawBase64, mimeType, dataUrl }
}

const imageUrlToBase64 = async (imageUrl) => {
  const protocolRemoved = imageUrl.replace(/^https?:\/\//i, '')
  const candidates = [
    imageUrl,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(imageUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(imageUrl)}`,
    `https://images.weserv.nl/?url=${encodeURIComponent(protocolRemoved)}`,
  ]

  let lastError = null

  for (const url of candidates) {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status}`)
        continue
      }

      const blob = await response.blob()
      const mimeType = blob.type || 'image/jpeg'
      const dataUrl = await imageBlobToDataUrl(blob)
      const rawBase64 = dataUrl.split(',')[1]

      if (!rawBase64) {
        lastError = new Error('Không lấy được chuỗi base64 từ data URL')
        continue
      }

      return { base64: rawBase64, mimeType, dataUrl }
    } catch (err) {
      lastError = err
    }
  }

  throw new Error(`Không thể tải ảnh: ${lastError?.message || 'unknown'}`)
}

export const sourceImageToBase64 = async ({ file = null, imageUrl = '' } = {}) => {
  if (file) {
    return imageFileToBase64(file)
  }

  if (imageUrl) {
    return imageUrlToBase64(imageUrl)
  }

  throw new Error('Không có nguồn ảnh để xử lý')
}

const extractImageResult = (responseData) => {
  const result = responseData?.data || responseData

  if (result?.base64) {
    return {
      base64: result.base64,
      mimeType: result.mimeType || 'image/png',
    }
  }

  const firstImage = Array.isArray(result?.images) ? result.images[0] : null
  if (firstImage) {
    return {
      base64: firstImage.base64 || firstImage.data || firstImage.image_data || null,
      mimeType: firstImage.mimeType || firstImage.mime_type || 'image/png',
    }
  }

  const firstMockupImage = Array.isArray(result?.mockup?.images) ? result.mockup.images[0] : null
  if (firstMockupImage) {
    return {
      base64:
        firstMockupImage.base64 ||
        firstMockupImage.data ||
        firstMockupImage.image_data ||
        firstMockupImage.inline_data ||
        null,
      mimeType: firstMockupImage.mimeType || firstMockupImage.mime_type || 'image/png',
    }
  }

  return null
}

const extractStructuredData = (responseData) => {
  const result = responseData?.data || responseData

  if (result && typeof result === 'object' && Array.isArray(result.objects)) {
    return result
  }

  if (result?.analysis && typeof result.analysis === 'object') {
    return result.analysis
  }

  if (result?.structured && typeof result.structured === 'object') {
    return result.structured
  }

  if (result?.json && typeof result.json === 'object') {
    return result.json
  }

  const textCandidate = result?.response_text || result?.text || result?.message
  if (typeof textCandidate === 'string') {
    try {
      return JSON.parse(textCandidate)
    } catch {
      return null
    }
  }

  return null
}

const extractLifestyleResult = (responseData) => {
  const result = responseData?.data || responseData

  const collectImageCandidates = (value) => {
    if (!value) return []
    if (Array.isArray(value)) {
      return value.flatMap((item) => collectImageCandidates(item))
    }

    if (typeof value !== 'object') {
      return []
    }

    const nested = [
      value.images,
      value.image,
      value.generated_image,
      value.generatedImage,
      value.inlineData,
      value.inline_data,
      value.output,
      value.result,
    ]

    return [value, ...nested.flatMap((item) => collectImageCandidates(item))]
  }

  const normalizeImage = (image) => {
    const inlineData = image?.inlineData || image?.inline_data || null
    const base64 =
      image?.base64 ||
      image?.data ||
      image?.image_data ||
      image?.imageData ||
      inlineData?.data ||
      null

    if (!base64 || typeof base64 !== 'string') {
      return null
    }

    return {
      base64,
      mimeType:
        image?.mimeType || image?.mime_type || inlineData?.mimeType || inlineData?.mime_type || 'image/png',
    }
  }

  const rawCandidates = [
    ...(Array.isArray(result?.images) ? result.images : []),
    ...(Array.isArray(result?.mockup?.images) ? result.mockup.images : []),
    ...(Array.isArray(result?.mockup?.variants) ? result.mockup.variants : []),
  ]

  const seen = new Set()
  const images = rawCandidates
    .flatMap((item) => collectImageCandidates(item))
    .map(normalizeImage)
    .filter(Boolean)
    .filter((image) => {
      const key = `${image.mimeType}:${image.base64.slice(0, 32)}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })

  const firstImage = images[0] || null

  return {
    base64: firstImage?.base64 || null,
    mimeType: firstImage?.mimeType || 'image/png',
    images,
    analysis: result?.analysis && typeof result.analysis === 'object' ? result.analysis : null,
    mockup: result?.mockup && typeof result.mockup === 'object' ? result.mockup : null,
    raw: result,
  }
}

const buildUserPayload = () => {
  const user = getCurrentUser()

  if (!user?.id) {
    throw new Error('Chưa đăng nhập. Vui lòng đăng nhập lại.')
  }

  return { user, userId: user.id }
}

// ==================== IMAGE REDESIGN (PRIMARY) ====================

/**
 * Redesign image: frontend build Gemini format → gửi backend → backend forward Gemini
 * Backend không cần API key từ client nữa (backend tự quản lý)
 *
 * @param {string} imageUrl  - Source image URL
 * @param {string} prompt    - Design prompt (lấy từ PROMPTS)
 * @returns {Promise<{base64: string, mimeType: string}>}
 */
export const redesignImage = async (imageUrl, prompt) => {

  if (!imageUrl) throw new Error('Không có ảnh nguồn.')
  if (!prompt) throw new Error('Không có prompt redesign.')

  logOutgoingPrompt('redesignImage', prompt)

  // Fetch ảnh và convert base64
  const { base64, mimeType } = await imageUrlToBase64(imageUrl)

  // Build đúng format Gemini API
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: {
        aspectRatio: '1:1',
        image_size: '1K',
      },
    },
  }
  console.log('Payload gửi backend redesign:', payload)
  // const headers = getAuthHeaders()
  const data = await callBackend('/vertex/ornament', payload)

  const extracted = extractImageResult(data)
  if (!extracted?.base64) {
    console.error('❌ [geminiService] Backend response without usable image:', data)
    throw new Error('Backend không trả về ảnh. Thử lại hoặc kiểm tra quota API.')
  }

  return {
    base64: extracted.base64,
    mimeType: extracted.mimeType,
  }
}

/**
 * Custom edit image từ dataUrl (ảnh đã chỉnh sửa) + prompt
 * Gửi ảnh hiện tại + ý kiến chỉnh sửa của user tới Gemini
 *
 * @param {string} dataUrl   - Ảnh dạng data URL (đã được chỉnh sửa)
 * @param {string} prompt    - Ý kiến/hướng dẫn chỉnh sửa từ user
 * @returns {Promise<{base64: string, mimeType: string}>}
 */
export const customEditImageFromDataUrl = async (dataUrl, prompt) => {
  if (!dataUrl) throw new Error('Không có ảnh để chỉnh sửa.')
  if (!prompt || !prompt.trim()) throw new Error('Vui lòng nhập ý kiến chỉnh sửa ảnh.')

  logOutgoingPrompt('customEditImageFromDataUrl', prompt)

  // Extract base64 và mimeType từ dataUrl
  const parts = dataUrlToParts(dataUrl)
  const { data: base64, mimeType } = parts.inlineData

  // Build Gemini format payload
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: {
        aspectRatio: '1:1',
        image_size: '1K',
      },
    },
  }

  const data = await callBackend('/vertex/ornament', payload)

  const extracted = extractImageResult(data)
  if (!extracted?.base64) {
    console.error('❌ [geminiService] Backend response without usable image:', data)
    throw new Error('Backend không trả về ảnh. Thử lại hoặc kiểm tra quota API.')
  }

  return {
    base64: extracted.base64,
    mimeType: extracted.mimeType,
  }
}

export const createStickerMaster = async ({ file = null, imageUrl = '', prompt = '' }) => {
  if (!prompt) throw new Error('Không có prompt tạo Sticker Master.')

  logOutgoingPrompt('createStickerMaster', prompt)

  // Read source image (support file or URL) — previous code referenced undefined `mimeType`/`base64`
  const { base64, mimeType } = await sourceImageToBase64({ file, imageUrl })

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: {
        aspectRatio: '1:1',
        image_size: '1K',
      },
    },
  }

  const data = await callBackend('/vertex/ornament', payload)
  const extracted = extractImageResult(data)

  if (!extracted?.base64) {
    console.error('❌ [geminiService] Sticker master response missing base64:', data)
    throw new Error('Backend không trả về ảnh base64 hợp lệ cho Sticker Master.')
  }

  return {
    base64: extracted.base64,
    mimeType: extracted.mimeType || 'image/png',
  }
}

export const analyzeStickerImage = async ({ file = null, imageUrl = '', prompt = '' }) => {
  if (!prompt) throw new Error('Không có prompt để analyze Sticker.')

  // logOutgoingPrompt('analyzeStickerImage', prompt)

  const { base64 } = await sourceImageToBase64({ file, imageUrl })

  const payload = {
   "inlineData": {
    "mimeType": "image/jpeg",
    "data":  base64
  },
    "text": prompt,
  }

  console.log('Payload gửi backend sticker analyze:', payload)
  const data = await callBackend('/vertex/sticker/analyze', payload)

  const extracted = extractImageResult(data)
  if (!extracted?.base64) {
    console.error('❌ [geminiService] Sticker analyze response missing base64:', data)
    throw new Error('Backend không trả về ảnh base64 hợp lệ cho Sticker Analyze.')
  }

  return {
    base64: extracted.base64,
    mimeType: extracted.mimeType || 'image/png',
  }
}

export const analyzeComboImage = async ({ file = null, imageUrl = '', targetOutput = 10, prompt = '' }) => {
  const { userId } = buildUserPayload()
  const { base64, mimeType } = await sourceImageToBase64({ file, imageUrl })
  const analysisPrompt = [
    prompt,
    `Return exactly ${targetOutput} objects in the objects array whenever possible.`,
    'Each object must be one individual sticker subject only.',
    'Do not return sticker sheets, bundles, or grouped objects.',
  ]
    .filter(Boolean)
    .join('\n')

  logOutgoingPrompt('analyzeComboImage', analysisPrompt)

  const payload = {
    user_id: userId,
    target_output: targetOutput,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64,
            },
          },
          {
            text: analysisPrompt,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['TEXT'],
    },
  }
  const data = await callBackend('/vertex/combosticker/analyze', payload)
  const analysis = extractStructuredData(data)

  if (!analysis?.objects || !Array.isArray(analysis.objects)) {
    console.error('❌ [geminiService] Invalid combo analysis response:', data)
    throw new Error('Backend không trả về phân tích hợp lệ cho combo sticker.')
  }

  return {
    theme: analysis.theme || '',
    style: analysis.style || '',
    colorPalette: Array.isArray(analysis.colorPalette) ? analysis.colorPalette : [],
    objects: analysis.objects,
    raw: data,
  }
}

export const generateComboStickerImage = async ({
  file = null,
  imageUrl = '',
  objectName,
  keyword = '',
  theme = '',
  style = '',
  colorPalette = [],
  prompt = '',
}) => {
  const { userId } = buildUserPayload()
  const { base64, mimeType } = await sourceImageToBase64({ file, imageUrl })

  const fullPrompt = [
    prompt,
    `Object: ${objectName}`,
    'Generate exactly one isolated sticker for this object only.',
    'Ignore all other objects in the source image.',
    'Do not create collage, sheet, bundle, or multiple stickers.',
    theme ? `Theme: ${theme}` : '',
    style ? `Style: ${style}` : '',
    colorPalette.length ? `Color palette: ${colorPalette.join(', ')}` : '',
    keyword ? `Keyword/context: ${keyword}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  logOutgoingPrompt('generateComboStickerImage', fullPrompt)

  const payload = {
    user_id: userId,
    object_name: objectName,
    keyword,
    theme,
    style,
    color_palette: colorPalette,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64,
            },
          },
          {
            text: fullPrompt,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: {
        aspectRatio: '1:1',
        image_size: '2K',
      },
    },
  }


  const data = await callBackend('/vertex/combosticker/generate', payload)
  const extracted = extractImageResult(data)

  if (!extracted?.base64) {
    console.error('❌ [geminiService] Invalid combo generation response:', data)
    throw new Error(`Backend không trả về ảnh cho object ${objectName}.`)
  }

  return extracted
}

// ==================== LIFESTYLE IMAGE ====================

/**
 * Trích xuất insight từ 1 analysis object (hỗ trợ cả snake_case & tiếng Việt)
 */
const extractInsightFromAnalysis = (analysis) => {
  if (!analysis || typeof analysis !== 'object') return {}

  // snake_case format: { insight_san_pham: { doi_tuong, boi_canh_mong_muon, mood_vibe, props } }
  const snake = analysis?.insight_san_pham
  if (snake && typeof snake === 'object') {
    return {
      doi_tuong: snake.doi_tuong || '',
      boi_canh: snake.boi_canh_mong_muon || '',
      mood_vibe: snake.mood_vibe || '',
      props: snake.props || '',
    }
  }

  // Vietnamese key format — find the "Insight sản phẩm" object
  const insightKey = Object.keys(analysis).find((k) =>
    k.toLowerCase().includes('insight')
  )
  const insightObj =
    insightKey && typeof analysis[insightKey] === 'object' ? analysis[insightKey] : analysis

  const findField = (obj, keywords) => {
    const key = Object.keys(obj).find((k) =>
      keywords.some((kw) => k.toLowerCase().includes(kw.toLowerCase()))
    )
    return key ? String(obj[key] || '') : ''
  }

  return {
    doi_tuong: findField(insightObj, ['đối tượng', 'doi tuong', 'target', 'audience']),
    boi_canh: findField(insightObj, ['bối cảnh', 'boi canh', 'context', 'background']),
    mood_vibe: findField(insightObj, ['mood', 'vibe']),
    props: findField(insightObj, ['props', 'đạo cụ']),
  }
}

/**
 * Build generate prompt từ PROMPTS.lifestyleGenerate bằng cách thay thế placeholders
 */
const buildLifestyleGeneratePrompt = (keyword, insight) => {
  return PROMPTS.lifestyleGenerate
    .replace('{{keyword}}', keyword || '')
    .replace('{{boi_canh}}', insight.boi_canh || '')
    .replace('{{doi_tuong}}', insight.doi_tuong || '')
    .replace('{{mood_vibe}}', insight.mood_vibe || '')
    .replace('{{props}}', insight.props || '')
}

/**
 * Parse danh sách analyses từ backend response
 * Hỗ trợ: { analyses: [...] } hoặc { data: { analyses: [...] } }
 */
const extractAnalysesFromResponse = (responseData) => {
  const result = responseData?.data || responseData
  if (Array.isArray(result?.analyses)) {
    return result.analyses
  }
  return []
}

export const generateLifestyleImage = async ({
  file = null,
  imageUrl = '',
  keyword = '',
  analysisCount = 3,
  maxGenerateCount = 3,
  onImageGenerated = null,
} = {}) => {
  const { userId } = buildUserPayload()
  const { base64, mimeType } = await sourceImageToBase64({ file, imageUrl })

  // ── STEP 1: Analyze image → nhận insights ──
  const analyzePayload = {
    inlineData: { mimeType, data: base64 },
    analysis_prompt: PROMPTS.lifestyleAnalyze,
    analysis_count: Math.max(1, Math.min(5, Number(analysisCount) || 3)),
  }

  logOutgoingPrompt('generateLifestyleImage.analyze', PROMPTS.lifestyleAnalyze)

  const analyzeData = await callBackend('/vertex/lifestyle/analyze', analyzePayload)
  const analyses = extractAnalysesFromResponse(analyzeData)


  if (!analyses.length) {
    throw new Error('Backend không trả về analyses lifestyle hợp lệ.')
  }

  // ── STEP 2: Generate ảnh lifestyle, ưu tiên đủ số lượng target ──
  const targetCount = Math.max(1, Number(maxGenerateCount) || 1)
  const baseAnalyses = analyses.length ? analyses : [{}]
  const generationQueue = Array.from({ length: targetCount }).map((_, index) => {
    return baseAnalyses[index % baseAnalyses.length]
  })

  const generateResults = []

  for (let index = 0; index < generationQueue.length; index += 1) {
    const analysisItem = generationQueue[index]
    const insight = extractInsightFromAnalysis(analysisItem?.analysis || analysisItem)
    const generatePrompt = buildLifestyleGeneratePrompt(keyword, insight)

    logOutgoingPrompt('generateLifestyleImage.generate', generatePrompt)

    const genPayload = {
      user_id: userId,
      inlineData: { mimeType, data: base64 },
      mockup_prompt: generatePrompt,
    }

    const genData = await callBackend('/vertex/lifestyle/generate', genPayload)
    const extracted = extractLifestyleResult(genData)

    const nextResult = {
      base64: extracted?.base64 || null,
      mimeType: extracted?.mimeType || 'image/png',
      insight,
      generatePrompt,
      raw: genData,
    }

    generateResults.push(nextResult)

    if (typeof onImageGenerated === 'function' && nextResult.base64) {
      onImageGenerated({
        image: nextResult,
        imageIndex: index,
        images: generateResults.filter((item) => item?.base64),
        total: generationQueue.length,
      })
    }
  }

  const images = generateResults.filter((r) => r.base64)

  return {
    base64: images[0]?.base64 || null,
    mimeType: images[0]?.mimeType || 'image/png',
    images,
    analyses: generationQueue,
    raw: { analyzeData, generateResults },
  }
}

export const generateMockupImage = async ({
  file = null,
  imageUrl = '',
  prompt = '',
} = {}) => {
  if (!prompt || !prompt.trim()) {
    throw new Error('Missing mockup prompt')
  }

  const { userId } = buildUserPayload()
  const { base64, mimeType } = await sourceImageToBase64({ file, imageUrl })

  logOutgoingPrompt('generateMockupImage', prompt)

  const payload = {
    user_id: userId,
    inlineData: { mimeType, data: base64 },
    mockup_prompt: prompt,
  }

  const result = await callBackend('/vertex/mockup', payload)
  const extracted = extractLifestyleResult(result)

  if (!extracted?.base64) {
    console.error('❌ [geminiService] Invalid mockup response:', result)
    throw new Error('Backend không trả về ảnh mockup hợp lệ.')
  }

  return {
    base64: extracted.base64,
    mimeType: extracted.mimeType || 'image/png',
    images: extracted.images || [],
    mockup: result?.mockup && typeof result.mockup === 'object' ? result.mockup : null,
    raw: result,
  }
}

const normalizeTags = (tags) => {
  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag || '').trim()).filter(Boolean)
  }

  if (typeof tags === 'string') {
    return tags
      .split(',')
      .map((tag) => String(tag || '').trim())
      .filter(Boolean)
  }

  return []
}

const buildEtsyListingPrompt = ({ prompt, keyword, productType }) => {
  const basePrompt = String(prompt || PROMPTS.EtsyTitle || PROMPTS.title || '').trim()
  const safeKeyword = String(keyword || '').trim() || 'Personalized Pet Ornament Using Pet\'s Photo + Name'
  const safeProductType = String(productType || '').trim() || 'Ceramic Ornament'

  const inputBlock = [
    '======================================== INPUT ========================================',
    `Keyword chính: "${safeKeyword}"`,
    `Sản phẩm: "${safeProductType}"`,
    'Ảnh sản phẩm: Hãy phân tích trực tiếp từ ảnh được cung cấp.',
  ].join('\n')

  return `${inputBlock}\n${basePrompt}`.trim()
}

const buildAmazonListingPrompt = ({ prompt, keyword }) => {
  const basePrompt = String(prompt || PROMPTS.AmazonTitle || '').trim()
  const safeKeyword = String(keyword || '').trim() || 'Personalized pet ornament'

  const inputBlock = [
    '======================================== INPUT ========================================',
    `Keyword chính: "${safeKeyword}"`,
    'Ảnh sản phẩm: Hãy phân tích trực tiếp từ ảnh được cung cấp.',
  ].join('\n')

  return `${inputBlock}\n${basePrompt}`.trim()
}

const pickFirstValue = (source, keys = []) => {
  for (const key of keys) {
    const value = source?.[key]
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim()
    }
  }

  return ''
}

const pickFirstObject = (sources = []) => {
  for (const source of sources) {
    if (source && typeof source === 'object' && !Array.isArray(source)) {
      return source
    }
  }
  return {}
}

export const generateMarketplaceListingFromRedesign = async ({
  marketplace = 'etsy',
  base64,
  mimeType = 'image/png',
  prompt = '',
  keyword = '',
  productType = '',
}) => {
  if (!base64) {
    throw new Error('Thiếu ảnh redesign để tạo metadata marketplace.')
  }

  const normalizedMarketplace = String(marketplace || '').trim().toLowerCase()
  const isAmazonMarketplace = normalizedMarketplace === 'amazon'
  const endpoint = isAmazonMarketplace ? '/vertex/amazon/title' : '/vertex/etsy/title'
  const finalPrompt = isAmazonMarketplace
    ? buildAmazonListingPrompt({ prompt, keyword })
    : buildEtsyListingPrompt({ prompt, keyword, productType })

  if (!finalPrompt) {
    throw new Error('Thiếu prompt tạo listing marketplace.')
  }

  logOutgoingPrompt(`generateMarketplaceListingFromRedesign.${normalizedMarketplace || 'etsy'}`, finalPrompt)

  const payload = {
    inlineData: {
      mimeType: mimeType || 'image/png',
      data: base64,
    },
    keyword: String(keyword || '').trim(),
    product_type: String(productType || '').trim(),
    productType: String(productType || '').trim(),
    text: finalPrompt,
  }

  const data = await callBackend(endpoint, payload)
  const result = pickFirstObject([
    data?.data?.data,
    data?.data,
    data?.result,
    data,
  ])

  if (isAmazonMarketplace) {
    const bulletCandidates = [
      result?.bullet_points,
      result?.bulletPoints,
      result?.bullets,
      result?.highlights,
    ]
    const bulletArray = bulletCandidates.find((item) => Array.isArray(item) && item.length) || []

    const title = pickFirstValue(result, ['title', 'TITLE'])
    const productDescription = pickFirstValue(result, [
      'product_description',
      'productDescription',
      'PRODUCT_DESCRIPTION',
      'PRODUCT DESCRIPTION',
      'description',
      'DESCRIPTION',
    ])
    const bulletPoint1 = pickFirstValue(result, ['bullet_point_1', 'BULLET POINT 1', 'bulletPoint1']) || String(bulletArray[0] || '').trim()
    const bulletPoint2 = pickFirstValue(result, ['bullet_point_2', 'BULLET POINT 2', 'bulletPoint2']) || String(bulletArray[1] || '').trim()
    const bulletPoint3 = pickFirstValue(result, ['bullet_point_3', 'BULLET POINT 3', 'bulletPoint3']) || String(bulletArray[2] || '').trim()
    const bulletPoint4 = pickFirstValue(result, ['bullet_point_4', 'BULLET POINT 4', 'bulletPoint4']) || String(bulletArray[3] || '').trim()
    const bulletPoint5 = pickFirstValue(result, ['bullet_point_5', 'BULLET POINT 5', 'bulletPoint5']) || String(bulletArray[4] || '').trim()
    const genericKeyword = pickFirstValue(result, [
      'getneric_keyword',
      'GETNERIC KEYWORD',
      'generic_keyword',
      'GENERIC KEYWORD',
      'genericKeyword',
      'search_terms',
      'searchTerms',
    ])

    if (!title) {
      console.error('❌ [geminiService] Invalid /vertex/amazon/title response:', data)
      throw new Error('Backend /vertex/amazon/title không trả về TITLE hợp lệ.')
    }

    if (!productDescription || !bulletPoint1 || !genericKeyword) {
      console.warn('⚠️ [geminiService] Amazon response is partial, continue with fallback values.', {
        hasProductDescription: !!productDescription,
        hasBulletPoint1: !!bulletPoint1,
        hasGenericKeyword: !!genericKeyword,
      })
    }

    return {
      marketplace: 'amazon',
      success: !!result?.success,
      provider: result?.provider || '',
      model: result?.model || '',
      title,
      productDescription,
      bulletPoint1,
      bulletPoint2,
      bulletPoint3,
      bulletPoint4,
      bulletPoint5,
      genericKeyword,
    }
  }

  const etsyResult = pickFirstObject([
    result?.etsy,
    result?.listing,
    result?.metadata,
    result,
  ])

  const title = pickFirstValue(etsyResult, ['title', 'TITLE'])
  const description = pickFirstValue(etsyResult, ['description', 'DESCRIPTION', 'Description'])
  const normalizedTags = normalizeTags(
    etsyResult?.tags
    || etsyResult?.normalized_tags
    || etsyResult?.tag
    || etsyResult?.Tag
  )

  if (!title || !description || !normalizedTags.length) {
    console.error('❌ [geminiService] Invalid /vertex/etsy/title response:', data)
    throw new Error('Backend /vertex/etsy/title không trả về đầy đủ title, description, tags.')
  }

  return {
    marketplace: 'etsy',
    success: !!(etsyResult?.success ?? result?.success),
    provider: etsyResult?.provider || result?.provider || '',
    model: etsyResult?.model || result?.model || '',
    title,
    description,
    tags: normalizedTags,
    tagsText: normalizedTags.join(', '),
    title_character_count: Number(etsyResult?.title_character_count || title.length),
    description_character_count: Number(etsyResult?.description_character_count || description.length),
  }
}

export const generateEtsyListingFromRedesign = async ({
  base64,
  mimeType = 'image/png',
  prompt = PROMPTS.title,
  keyword = '',
  productType = '',
}) => {
  return generateMarketplaceListingFromRedesign({
    marketplace: 'etsy',
    base64,
    mimeType,
    prompt,
    keyword,
    productType,
  })
}

// ==================== BATCH IMAGE REDESIGN ====================

export const redesignImageBatch = async (imageUrls, prompt) => {
  return Promise.all(imageUrls.map((url) => redesignImage(url, prompt)))
}

// ==================== UTILITY EXPORTS ====================

export const dataUrlToParts = (dataUrl) => ({
  inlineData: {
    data: dataUrl.split(',')[1],
    mimeType: dataUrl.split(':')[1].split(';')[0],
  },
})

export default {
  analyzeComboImage,
  generateComboStickerImage,
  generateMarketplaceListingFromRedesign,
  generateEtsyListingFromRedesign,
  generateLifestyleImage,
  generateMockupImage,
  redesignImage,
  redesignImageBatch,
  customEditImageFromDataUrl,
  sourceImageToBase64,
  dataUrlToParts,
}
import { useMemo, useState, useEffect, useRef } from 'react'
import { generateLifestyleImage, generateMockupImage, generateMarketplaceListingFromRedesign } from '../services/geminiService'
import {
  bootstrapGeminiApp,
  checkGeminiAppSession,
  ensureGeminiPersistentChat,
  getGeminiAppCookies,
  getGeminiAppState,
  openGeminiAppLogin,
  openGeminiPersistentChat,
  redesignImageWithGeminiApp,
} from '../services/geminiAppService'
import { getSheetUrlForPage } from '../services/sheetConfigService'
import { updateDesignPageImages } from '../services/googleDriveService'
import { getCurrentUser, isAmazonRole, isEtsyRole } from '../services/authService'
import { PROMPTS, PROMPT_DEFAULTS } from '../prompt/Prompts'
import {
  getPromptsMoiPath,
  removePromptFromPromptsMoi,
  savePromptToPromptsMoi,
} from '../prompt/PromptsMoiService'
import ImagePreviewEditorModal from '../modals/ImagePreviewEditorModal'
import PatchPromptModal from '../modals/PatchPromptModal'
import ListedItemsModal from '../modals/ListedItemsModal'
import { useSheetAutoRefresh } from '../hooks/useSheetAutoRefresh'

// ────── Helper functions ──────
const downloadAsset = (url, filename) => {
  const link = document.createElement('a')
  link.download = filename
  link.href = url
  link.click()
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ────── Component ──────
export default function RedesignPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [data, setData] = useState([])
  const [autoRefreshCsvUrl, setAutoRefreshCsvUrl] = useState('')
  const [newRowsNotice, setNewRowsNotice] = useState(0)
  const dataRef = useRef([])
  const [pageSize, setPageSize] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [redesignResults, setRedesignResults] = useState({})
  const [selectedItems, setSelectedItems] = useState(new Set())
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState({})
  const [lifestyleResults, setLifestyleResults] = useState({})
  const [editorState, setEditorState] = useState(null)
  const [editorPreviewHistory, setEditorPreviewHistory] = useState({})
  const [editingPromptType, setEditingPromptType] = useState(null)
  const [showPromptModal, setShowPromptModal] = useState(false)
  const [isListedItemsModalOpen, setIsListedItemsModalOpen] = useState(false)
  const [redesignPrompt, setRedesignPrompt] = useState(() => PROMPTS.redesign || PROMPTS.patch)
  const [mockupPatch1, setMockupPatch1] = useState(() => PROMPTS.MockupPatch1)
  const [mockupPatch2, setMockupPatch2] = useState(() => PROMPTS.MockupPatch2)
  const [mockupPatch3, setMockupPatch3] = useState(() => PROMPTS.MockupPatch3)
  const [isGeminiLoginBusy, setIsGeminiLoginBusy] = useState(false)
  const [geminiCookies, setGeminiCookies] = useState([])
  const [geminiCookieTime, setGeminiCookieTime] = useState('')
  const [geminiRuntimeState, setGeminiRuntimeState] = useState(null)
  const [geminiProjectUrl, setGeminiProjectUrl] = useState(() =>
    localStorage.getItem('geminiProjectUrl') || 'https://gemini.google.com/app'
  )

  const totalPages = Math.max(1, Math.ceil(data.length / pageSize))

  // Sync dataRef để hook polling luôn đọc được data mới nhất
  useEffect(() => { dataRef.current = data }, [data])

  // Parse CSV text → pending rows (cùng logic với handleGetData)
  // Không cần useCallback vì hook tự sync qua ref mỗi render
  const parseRowsForAutoRefresh = (csvText) => {
    const rows = parseCSV(csvText)
    const isInputKey = (key) => {
      const norm = normalizeHeader(key)
      return norm.includes('stt') || norm.includes('keyword') || norm.includes('chude')
        || norm.includes('tieude') || norm.includes('sanpham') || norm.includes('description')
        || norm.includes('linkanh') || norm.includes('linknguon') || norm.includes('producttype')
    }
    return rows
      .filter((row) => {
        const kw = getValueByAliases(row, ['KEYWORD'])
        if (!String(kw || '').trim()) return false

        const stt = getValueByAliases(row, ['STT'])
        const sttValue = String(stt || '').trim()
        const sttNum = Number(sttValue)
        const isValidStt = sttValue !== '' && Number.isInteger(sttNum) && sttNum > 0
        if (!isValidStt) return false
        const sanPham = getValueByAliases(row, ['SẢN PHẨM'])
        if (sanPham && normalizeHeader(sanPham) !== 'redesign') return false
        const hasOutput = Object.entries(row).some(([key, val]) => {
          if (isInputKey(key)) return false
          return String(val || '').trim().length > 0
        })
        return !hasOutput
      })
      .map((row) => ({
        stt: getValueByAliases(row, ['STT']),
        keyword: getValueByAliases(row, ['KEYWORD']),
        chuDe: getValueByAliases(row, ['CHỦ ĐỀ']),
        tieuDe: getValueByAliases(row, ['TIÊU ĐỀ']),
        description: getValueByAliases(row, ['DESCRIPTION', 'Description', 'PRODUCT DESCRIPTION', 'Product Description']),
        sanPham: getValueByAliases(row, ['SẢN PHẨM', 'SAN PHAM', 'Product type']),
        imageLink: getValueByAliases(row, ['LINK ẢNH']),
        linkNguon: getValueByAliases(row, ['LINK NGUỒN']),
      }))
  }

  // Tự động polling 90s — chỉ append dòng mới, không reset state
  useSheetAutoRefresh({
    csvUrl: autoRefreshCsvUrl,
    enabled: Boolean(autoRefreshCsvUrl),
    isBusy: isLoading || isUploading
      || Object.values(redesignResults).some((r) => r?.loading),
    parseRows: parseRowsForAutoRefresh,
    getCurrentData: () => dataRef.current,
    getRowKey: (row) => row.stt || row.keyword || '',
    onNewRows: (newRows) => {
      setData((prev) => [...prev, ...newRows])
      setNewRowsNotice((prev) => prev + newRows.length)
      setTimeout(() => setNewRowsNotice(0), 5000)
    },
    intervalMs: 90_000,
  })

  // Tự động get data lần đầu nếu đã có sheet URL lưu sẵn
  useEffect(() => {
    const savedUrl = localStorage.getItem('redesignSheetUrl') || localStorage.getItem('ornamentSheetUrl') || ''
    if (savedUrl) {
      handleGetData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handleGetDataEvent = () => {
      handleGetData()
    }

    window.addEventListener('redesignGetData', handleGetDataEvent)
    return () => {
      window.removeEventListener('redesignGetData', handleGetDataEvent)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let intervalId = null

    const syncGeminiState = async () => {
      try {
        const state = await getGeminiAppState()
        if (!cancelled) {
          setGeminiRuntimeState(state)
        }
      } catch {
        // Gemini IPC may be temporarily unavailable during startup.
      }
    }

    const bootstrap = async () => {
      try {
        const bootstrapState = await bootstrapGeminiApp({
          projectUrl: geminiProjectUrl,
          autoLogin: false,
        })
        if (!cancelled) {
          setGeminiRuntimeState(bootstrapState)
        }
      } catch {
        // Keep UI usable even if bootstrap has not completed.
      }

      await syncGeminiState()
      intervalId = window.setInterval(syncGeminiState, 2000)
    }

    bootstrap()

    return () => {
      cancelled = true
      if (intervalId) {
        window.clearInterval(intervalId)
      }
    }
  }, [geminiProjectUrl])

  const paginatedData = useMemo(
    () => data.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [data, currentPage, pageSize]
  )

  const selectedReadyCount = useMemo(
    () => Array.from(selectedItems).filter((index) => redesignResults[index]?.base64).length,
    [selectedItems, redesignResults]
  )

  const totalReadyCount = useMemo(
    () => data.reduce((count, _, index) => (redesignResults[index]?.base64 ? count + 1 : count), 0),
    [data, redesignResults]
  )

  const extractSheetInfo = (url) => {
    const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/)
    const gidMatch = url.match(/#gid=(\d+)/)

    return {
      id: idMatch ? idMatch[1] : null,
      gid: gidMatch ? gidMatch[1] : '0',
    }
  }

  const normalizeHeader = (text) =>
    String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, '')

  const getValueByAliases = (row, aliases = []) => {
    const keys = Object.keys(row)
    const aliasSet = new Set(aliases.map(normalizeHeader))
    const foundKey = keys.find((key) => aliasSet.has(normalizeHeader(key)))

    return foundKey ? String(row[foundKey] || '').trim() : ''
  }

  const parseCSVLine = (line) => {
    const values = []
    let current = ''
    let inQuotes = false

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index]

      if (character === '"') {
        if (inQuotes && line[index + 1] === '"') {
          current += '"'
          index += 1
        } else {
          inQuotes = !inQuotes
        }
      } else if (character === ',' && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += character
      }
    }

    values.push(current.trim())
    return values
  }

  const parseCSV = (csvText) => {
    const lines = csvText
      .split('\n')
      .map((line) => line.replace(/\r$/, ''))
      .filter((line) => line.trim())

    if (lines.length < 2) return []

    const headers = parseCSVLine(lines[0])

    return lines.slice(1).map((line) => {
      const values = parseCSVLine(line)
      const row = {}

      headers.forEach((header, index) => {
        row[header] = values[index] || ''
      })

      return row
    })
  }

  const isValidImageUrl = (url) =>
    /^data:image\//i.test(url) || /^https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url)

  const dataUrlToImagePayload = (dataUrl) => {
    const match = dataUrl.match(/^data:(.*?);base64,(.*)$/)
    if (!match) {
      throw new Error('Dữ liệu ảnh không hợp lệ')
    }

    return {
      mimeType: match[1] || 'image/png',
      base64: match[2],
    }
  }

  const getLifestylePreviewImages = (lifestyle) =>
    Array.isArray(lifestyle?.images) && lifestyle.images.length
      ? lifestyle.images
      : lifestyle?.base64
        ? [{ base64: lifestyle.base64, mimeType: lifestyle.mimeType || 'image/png' }]
        : []

  const summarizeFileForLog = (file) => ({
    name: file?.name || null,
    size: file?.size || 0,
    type: file?.type || null,
    lastModified: file?.lastModified || null,
  })

  const generateMarketplaceMetadataIfNeeded = async (redesign, row) => {
    const user = getCurrentUser()
    const isEtsy = isEtsyRole(user)
    const isAmazon = isAmazonRole(user)

    if (!isEtsy && !isAmazon) {
      return null
    }

    try {
      return await generateMarketplaceListingFromRedesign({
        marketplace: isAmazon ? 'amazon' : 'etsy',
        base64: redesign?.base64,
        mimeType: redesign?.mimeType || 'image/png',
        prompt: isAmazon ? PROMPTS.AmazonTitle : PROMPTS.EtsyTitle,
        keyword: row?.keyword || row?.tieuDe || '',
        productType: row?.sanPham || 'Redesign Design',
      })
    } catch (err) {
      console.warn('⚠️ [Redesign] Marketplace metadata generation failed, uploading without metadata:', err?.message)
      return null
    }
  }

  const buildEditorPreviewKey = (kind, globalIndex, imageIndex = 'root') =>
    `${kind}:${globalIndex}:${imageIndex}`

  const mergePreviewOptions = (baseOptions = [], historyOptions = []) => {
    const seen = new Set()
    return [...baseOptions, ...historyOptions]
      .filter((option) => option?.src)
      .filter((option) => {
        if (seen.has(option.src)) return false
        seen.add(option.src)
        return true
      })
      .map((option, index) => ({
        id: `${String(option.id || 'preview').replace(/\s+/g, '-')}-${index + 1}`,
        label: option.label || `Preview ${index + 1}`,
        src: option.src,
      }))
  }

  const clearEditorPreviewHistoryForItem = (globalIndex) => {
    setEditorPreviewHistory((prev) => {
      const next = { ...prev }
      Object.keys(next).forEach((key) => {
        if (key.includes(`:${globalIndex}:`)) {
          delete next[key]
        }
      })
      return next
    })
  }

  const handleApplyEditorChanges = async ({ dataUrl, previewOptions = [], selectedPreviewId = '' }) => {
    if (!editorState) {
      return
    }

    const currentEditorKey = buildEditorPreviewKey(
      editorState.kind,
      editorState.globalIndex,
      editorState.imageIndex
    )
    setEditorPreviewHistory((prev) => ({
      ...prev,
      [currentEditorKey]: previewOptions,
    }))

    const payload = dataUrlToImagePayload(dataUrl)

    if (editorState.kind === 'source') {
      setData((prev) =>
        prev.map((row, index) =>
          index === editorState.globalIndex ? { ...row, imageLink: dataUrl } : row
        )
      )
      setRedesignResults((prev) => {
        const next = { ...prev }
        delete next[editorState.globalIndex]
        return next
      })
      setLifestyleResults((prev) => {
        const next = { ...prev }
        delete next[editorState.globalIndex]
        return next
      })
      clearEditorPreviewHistoryForItem(editorState.globalIndex)
      return
    }

    if (editorState.kind === 'redesign') {
      setRedesignResults((prev) => ({
        ...prev,
        [editorState.globalIndex]: {
          ...prev[editorState.globalIndex],
          loading: false,
          error: null,
          base64: payload.base64,
          mimeType: payload.mimeType,
        },
      }))
      setLifestyleResults((prev) => {
        const next = { ...prev }
        delete next[editorState.globalIndex]
        return next
      })
      return
    }

    if (editorState.kind === 'lifestyle') {
      setLifestyleResults((prev) => {
        const current = prev[editorState.globalIndex] || {}
        const currentImages = getLifestylePreviewImages(current)

        if (currentImages.length) {
          const nextImages = currentImages.map((image, index) =>
            index === editorState.imageIndex
              ? { ...image, base64: payload.base64, mimeType: payload.mimeType }
              : image
          )
          return {
            ...prev,
            [editorState.globalIndex]: {
              ...current,
              images: nextImages,
              base64: nextImages[0]?.base64 || payload.base64,
              mimeType: nextImages[0]?.mimeType || payload.mimeType,
            },
          }
        }

        return {
          ...prev,
          [editorState.globalIndex]: {
            ...current,
            base64: payload.base64,
            mimeType: payload.mimeType,
          },
        }
      })
      return
    }
  }

  const handlePersistEditorPreviewOptions = (previewOptions = []) => {
    if (!editorState) {
      return
    }

    const currentEditorKey = buildEditorPreviewKey(
      editorState.kind,
      editorState.globalIndex,
      editorState.imageIndex
    )
    setEditorPreviewHistory((prev) => ({
      ...prev,
      [currentEditorKey]: previewOptions,
    }))
  }

  const handleCreateMaster = async (globalIndex, imageLink) => {
    if (!imageLink) {
      setRedesignResults((prev) => ({
        ...prev,
        [globalIndex]: { loading: false, base64: null, mimeType: null, error: 'Không có ảnh nguồn' },
      }))
      return
    }

    setRedesignResults((prev) => ({
      ...prev,
      [globalIndex]: { loading: true, base64: null, mimeType: null, error: null },
    }))

    try {
      const row = data[globalIndex] || {}

      const bootstrapState = await bootstrapGeminiApp({
        projectUrl: geminiProjectUrl,
        autoLogin: true,
      })
      setGeminiRuntimeState(bootstrapState)

      if (!bootstrapState?.auth?.isLoggedIn) {
        throw new Error('Chua dang nhap Google/Gemini. Hay dang nhap xong roi bam Create Master lai.')
      }

      const chatState = await ensureGeminiPersistentChat({ projectUrl: geminiProjectUrl })
      setGeminiRuntimeState((prev) => ({
        ...(prev || {}),
        auth: bootstrapState.auth,
        chat: {
          ...(prev?.chat || {}),
          ...chatState,
        },
      }))

      const sessionResult = await checkGeminiAppSession({
        projectUrl: chatState?.chatUrl || geminiProjectUrl,
      })

      const activeCookies = Array.isArray(sessionResult?.cookies) ? sessionResult.cookies : []
      if (activeCookies.length) {
        setGeminiCookies(activeCookies)
        setGeminiCookieTime(sessionResult?.generatedAt || new Date().toISOString())
      }

      const result = await redesignImageWithGeminiApp({
        imageUrl: imageLink,
        prompt: redesignPrompt,
        timeoutMs: 420000,
        projectUrl: chatState?.chatUrl || geminiProjectUrl,
        context: {
          page: 'redesign',
          stt: row.stt || '',
          keyword: row.keyword || '',
          title: row.tieuDe || '',
          sourceImage: imageLink,
          projectUrl: geminiProjectUrl,
        },
      })

      const responseCookies = Array.isArray(result?.payload?.cookies) ? result.payload.cookies : []
      if (responseCookies.length) {
        setGeminiCookies(responseCookies)
      }
      if (result?.payload?.generatedAt) {
        setGeminiCookieTime(result.payload.generatedAt)
      }

      setRedesignResults((prev) => ({
        ...prev,
        [globalIndex]: {
          loading: false,
          base64: result.base64,
          mimeType: result.mimeType || 'image/png',
          requestPayload: result?.payload || null,
          error: null,
        },
      }))
    } catch (err) {
      setRedesignResults((prev) => ({
        ...prev,
        [globalIndex]: { loading: false, base64: null, mimeType: null, error: err.message },
      }))
    }
  }


  const handleOpenGeminiGoogleLogin = async () => {
    setIsGeminiLoginBusy(true)
    try {
      await openGeminiAppLogin({ projectUrl: geminiProjectUrl })
      const state = await getGeminiAppState()
      setGeminiRuntimeState(state)
      alert('Da login Gemini va gan chat co dinh. Tu gio app se dung lai chat nay cho moi request.')
    } catch (err) {
      alert(`Khong the mo dang nhap Gemini: ${err.message}`)
    } finally {
      setIsGeminiLoginBusy(false)
    }
  }

  const handleOpenPersistentChat = async () => {
    try {
      await openGeminiPersistentChat()
    } catch (err) {
      alert(`Khong the mo persistent chat: ${err.message}`)
    }
  }

  const handleGetGeminiCookiesOnly = async () => {
    setIsGeminiLoginBusy(true)
    try {
      const cookieResult = await getGeminiAppCookies({ projectUrl: geminiProjectUrl })
      const cookies = Array.isArray(cookieResult?.cookies) ? cookieResult.cookies : []
      setGeminiCookies(cookies)
      setGeminiCookieTime(cookieResult?.generatedAt || new Date().toISOString())
      const state = await getGeminiAppState()
      setGeminiRuntimeState(state)
      alert(`Da dong bo ${cookies.length} cookie/phien tu browser hien tai.`)
    } catch (err) {
      alert(`Khong the dang nhap/lay cookie Gemini: ${err.message}`)
    } finally {
      setIsGeminiLoginBusy(false)
    }
  }

  const handleGeminiProjectUrlChange = (value) => {
    setGeminiProjectUrl(value)
    localStorage.setItem('geminiProjectUrl', value)
  }
  const startItemIndex = data.length ? (currentPage - 1) * pageSize + 1 : 0
  const endItemIndex = Math.min(currentPage * pageSize, data.length)

  const handleGetData = async () => {
    let interval

    try {
      let sheetUrl = localStorage.getItem('redesignSheetUrl') || localStorage.getItem('ornamentSheetUrl')

      if (!sheetUrl) {
        sheetUrl = await getSheetUrlForPage('redesign')
      }

      const { id: sheetId, gid } = extractSheetInfo(sheetUrl)

      if (!sheetId) {
        setError('Link sheet từ config không hợp lệ')
        return
      }

      // Xóa sạch kết quả cũ
      setRedesignResults({})
      setLifestyleResults({})
      setUploadStatus({})
      setSelectedItems(new Set())
      setEditorState(null)
      setEditorPreviewHistory({})

      setIsLoading(true)
      setProgress(0)
      setError('')
      setData([])
      setCurrentPage(1)

      interval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90))
      }, 200)

      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
      const response = await fetch(csvUrl)

      if (!response.ok) {
        throw new Error('Không thể truy cập sheet. Đảm bảo sheet được chia sẻ công khai.')
      }

      const csvData = await response.text()
      const rows = parseCSV(csvData)


      const isInputKeyPatch = (key) => {
        const norm = normalizeHeader(key)
        return norm.includes('stt') || norm.includes('keyword') || norm.includes('chude')
          || norm.includes('tieude') || norm.includes('sanpham') || norm.includes('description')
          || norm.includes('linkanh') || norm.includes('linknguon') || norm.includes('producttype')
      }
      const filteredRows = rows
        .filter((row) => {
          const kw = getValueByAliases(row, ['KEYWORD'])
          if (!String(kw || '').trim()) return false

          const stt = getValueByAliases(row, ['STT'])
          const sttValue = String(stt || '').trim()
          const sttNum = Number(sttValue)
          const isValidStt = sttValue !== '' && Number.isInteger(sttNum) && sttNum > 0
          if (!isValidStt) return false
          
          const sanPham = getValueByAliases(row, ['SẢN PHẨM'])
          if (sanPham && normalizeHeader(sanPham) !== 'redesign') return false

          const linkAnh = getValueByAliases(row, ['LINK ẢNH', 'Link ảnh', 'LINK ANH', 'LINK NGUỒN', 'Link nguồn', 'LINK NGUON', 'Image', 'Image Link', 'IMAGE LINK'])
          if (!String(linkAnh || '').trim()) return false

          const redesign = getValueByAliases(row, ['REDESIGN', 'Redesign', 'FINAL CONCEPT REDESIGN'])
          if (String(redesign || '').trim()) return false

          const hasOutput = Object.entries(row).some(([key, val]) => {
            if (isInputKeyPatch(key)) return false
            return String(val || '').trim().length > 0
          })
          return !hasOutput
        })
        .map((row) => ({
          stt: getValueByAliases(row, ['STT']),
          keyword: getValueByAliases(row, ['KEYWORD']),
          chuDe: getValueByAliases(row, ['CHỦ ĐỀ']),
          tieuDe: getValueByAliases(row, ['TIÊU ĐỀ']),
          description: getValueByAliases(row, ['DESCRIPTION', 'Description', 'PRODUCT DESCRIPTION', 'Product Description']),
          sanPham: getValueByAliases(row, ['SẢN PHẨM', 'SAN PHAM', 'Product type']),
          imageLink: getValueByAliases(row, ['LINK ẢNH']),
          linkNguon: getValueByAliases(row, ['LINK NGUỒN']),
        }))

      clearInterval(interval)
      setProgress(100)
      setData(filteredRows)
      dataRef.current = filteredRows
      setNewRowsNotice(0)
      // Bật polling sau khi load xong
      setAutoRefreshCsvUrl(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`)
    } catch (err) {
      if (interval) clearInterval(interval)
      setError(err.message || 'Không thể lấy dữ liệu từ sheet')
    } finally {
      setIsLoading(false)
      setProgress(0)
    }
  }

  const toggleItemSelection = (globalIndex) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(globalIndex)) {
      newSelected.delete(globalIndex)
    } else {
      newSelected.add(globalIndex)
    }
    setSelectedItems(newSelected)
  }

  const getPromptDetails = (promptType) => {
    switch (promptType) {
      case 'redesign':
        return { prompt: redesignPrompt, setter: setRedesignPrompt, default: PROMPT_DEFAULTS.redesign || PROMPT_DEFAULTS.patch, label: 'Redesign Prompt' }
      case 'MockupPatch1':
        return { prompt: mockupPatch1, setter: setMockupPatch1, default: PROMPT_DEFAULTS.MockupPatch1, label: 'Mockup Patch 1' }
      case 'MockupPatch2':
        return { prompt: mockupPatch2, setter: setMockupPatch2, default: PROMPT_DEFAULTS.MockupPatch2, label: 'Mockup Patch 2' }
      case 'MockupPatch3':
        return { prompt: mockupPatch3, setter: setMockupPatch3, default: PROMPT_DEFAULTS.MockupPatch3, label: 'Mockup Patch 3' }
      default:
        return null
    }
  }

  const handleGenerateLifestyle = async (globalIndex) => {
    const redesign = redesignResults[globalIndex]
    if (!redesign?.base64) {
      alert('Vui lòng tạo ✨ Create Master trước')
      return
    }

    setLifestyleResults((prev) => ({
      ...prev,
      [globalIndex]: {
        loading: true,
        base64: null,
        mimeType: null,
        images: [],
        analysis: null,
        mockup: null,
        raw: null,
        error: null,
      },
    }))

    try {
      const sourceDataUrl = `data:${redesign.mimeType};base64,${redesign.base64}`

      const patchMockup1 = await generateMockupImage({
        imageUrl: sourceDataUrl,
        prompt: mockupPatch1,
      })

      setLifestyleResults((prev) => ({
        ...prev,
        [globalIndex]: {
          loading: true,
          base64: patchMockup1.base64,
          mimeType: patchMockup1.mimeType,
          images: [patchMockup1],
          analysis: null,
          mockup: null,
          raw: {
            patchMockup1: patchMockup1.raw,
            patchMockup2: null,
            patchMockup3: null,
          },
          error: null,
        },
      }))

      const patchMockup2 = await generateMockupImage({
        imageUrl: `data:${patchMockup1.mimeType};base64,${patchMockup1.base64}`,
        prompt: mockupPatch2,
      })

      setLifestyleResults((prev) => ({
        ...prev,
        [globalIndex]: {
          loading: true,
          base64: patchMockup1.base64,
          mimeType: patchMockup1.mimeType,
          images: [patchMockup1, patchMockup2],
          analysis: null,
          mockup: null,
          raw: {
            patchMockup1: patchMockup1.raw,
            patchMockup2: patchMockup2.raw,
            patchMockup3: null,
          },
          error: null,
        },
      }))

      const patchMockup3 = await generateMockupImage({
        imageUrl: `data:${patchMockup2.mimeType};base64,${patchMockup2.base64}`,
        prompt: mockupPatch3,
      })

      const images = [patchMockup1, patchMockup2, patchMockup3]

      setLifestyleResults((prev) => ({
        ...prev,
        [globalIndex]: {
          loading: false,
          base64: patchMockup1.base64,
          mimeType: patchMockup1.mimeType,
          images,
          analyses: [],
          analysis: null,
          mockup: null,
          raw: {
            patchMockup1: patchMockup1.raw,
            patchMockup2: patchMockup2.raw,
            patchMockup3: patchMockup3.raw,
          },
          error: null,
        },
      }))
    } catch (err) {
      setLifestyleResults((prev) => ({
        ...prev,
        [globalIndex]: {
          loading: false,
          base64: null,
          mimeType: null,
          images: [],
          analysis: null,
          mockup: null,
          raw: null,
          error: err.message,
        },
      }))
    }
  }

  const handleDownloadAllLifestyle = async (globalIndex) => {
    const lifestyle = lifestyleResults[globalIndex]
    const lifestylePreviewImages = getLifestylePreviewImages(lifestyle)

    if (!lifestylePreviewImages.length) {
      alert('Không có ảnh lifestyle để tải')
      return
    }

    const row = data[globalIndex]
    const keyword = row?.keyword || `item-${globalIndex + 1}`
    const sanitizedKeyword = String(keyword).replace(/[/\\?%*:|"<>]/g, '-')

    for (let i = 0; i < lifestylePreviewImages.length; i += 1) {
      const lifestyleImage = lifestylePreviewImages[i]
      if (!lifestyleImage?.base64) continue
      const lifestyleSrc = `data:${lifestyleImage.mimeType || 'image/png'};base64,${lifestyleImage.base64}`
      downloadAsset(lifestyleSrc, `redesign-${sanitizedKeyword}-lifestyle-${i + 1}.png`)
      await sleep(150)
    }
  }

  const handleUploadSingle = async (globalIndex) => {
    const redesign = redesignResults[globalIndex]
    if (!redesign?.base64) {
      alert('Không có ảnh redesign để upload')
      return
    }

    setIsUploading(true)
    setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'uploading' }))

    try {
      let sheetUrl = localStorage.getItem('redesignSheetUrl') || localStorage.getItem('ornamentSheetUrl')
      if (!sheetUrl) {
        sheetUrl = await getSheetUrlForPage('redesign')
      }

      const sheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)
      if (!sheetIdMatch) {
        throw new Error('Sheet URL không hợp lệ')
      }

      const sheetId = sheetIdMatch[1]
      const gidMatch = sheetUrl.match(/[?&]gid=([0-9]+)/)
      const gid = gidMatch ? gidMatch[1] : '0'

      const accessToken = localStorage.getItem('googleDriveAccessToken')
      const stt = data[globalIndex]?.stt ?? (globalIndex + 1)
      const row = data[globalIndex]

      const src = `data:${redesign.mimeType};base64,${redesign.base64}`
      const blob = await fetch(src).then((r) => r.blob())
      const redesignFile = new File([blob], `redesign-master-${globalIndex}.png`, { type: 'image/png' })
      const marketplaceMetadata = await generateMarketplaceMetadataIfNeeded(redesign, row)

      const lifestyleFiles = []
      const lifestylePreviewImages = getLifestylePreviewImages(lifestyleResults[globalIndex])
      for (let i = 0; i < lifestylePreviewImages.length; i += 1) {
        const lifestyleImage = lifestylePreviewImages[i]
        if (!lifestyleImage?.base64) continue
        const lifestyleSrc = `data:${lifestyleImage.mimeType || 'image/png'};base64,${lifestyleImage.base64}`
        const lifestyleBlob = await fetch(lifestyleSrc).then((r) => r.blob())
        const lifestyleFile = new File(
          [lifestyleBlob],
          `redesign-lifestyle-${globalIndex}-${i + 1}.png`,
          { type: lifestyleImage.mimeType || 'image/png' }
        )
        lifestyleFiles.push(lifestyleFile)
      }

      const optionalFiles = lifestyleFiles
      await updateDesignPageImages({
        sheetId,
        gid,
        accessToken,
        stt,
        redesignImageFile: redesignFile,
        lifestyleImageFiles: optionalFiles.length > 0 ? optionalFiles : null,
        requireLifestyleImage: false,
        title: marketplaceMetadata?.title || '',
        description: marketplaceMetadata?.description || '',
        tags: marketplaceMetadata?.tags || null,
        marketplace: marketplaceMetadata?.marketplace === 'amazon' ? 'Amazon' : marketplaceMetadata?.marketplace === 'etsy' ? 'Etsy' : '',
        productDescription: marketplaceMetadata?.productDescription || '',
        bulletPoint1: marketplaceMetadata?.bulletPoint1 || '',
        bulletPoint2: marketplaceMetadata?.bulletPoint2 || '',
        bulletPoint3: marketplaceMetadata?.bulletPoint3 || '',
        bulletPoint4: marketplaceMetadata?.bulletPoint4 || '',
        bulletPoint5: marketplaceMetadata?.bulletPoint5 || '',
        genericKeyword: marketplaceMetadata?.genericKeyword || '',
        pageKey: 'redesign',
      })
      setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'done' }))
    } catch (err) {
      console.error('Upload error:', err)
      setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'error' }))
      alert('Upload lỗi: ' + err.message)
    } finally {
      setIsUploading(false)
    }
  }

  const handleUploadBatch = async () => {
    const selectedIndices = Array.from(selectedItems)
    const candidateIndices = selectedIndices.length
      ? selectedIndices
      : data.map((_, index) => index)
    const validIndices = candidateIndices.filter((index) => redesignResults[index]?.base64)

    if (!validIndices.length) {
      alert('Chưa có item nào có ảnh bước 2 (Create Master) để upload')
      return
    }

    setIsUploading(true)

    let sheetUrl = localStorage.getItem('redesignSheetUrl') || localStorage.getItem('ornamentSheetUrl')
    if (!sheetUrl) {
      sheetUrl = await getSheetUrlForPage('redesign')
    }

    const sheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)
    if (!sheetIdMatch) {
      alert('Sheet URL không hợp lệ')
      setIsUploading(false)
      return
    }

    const sheetId = sheetIdMatch[1]
    const gidMatch = sheetUrl.match(/[?&]gid=([0-9]+)/)
    const gid = gidMatch ? gidMatch[1] : '0'

    const accessToken = localStorage.getItem('googleDriveAccessToken')

    const newStatus = {}
    validIndices.forEach((idx) => {
      newStatus[idx] = 'uploading'
    })
    setUploadStatus((prev) => ({ ...prev, ...newStatus }))

    let successCount = 0
    let errorCount = 0

    for (const globalIndex of validIndices) {
      try {
        const redesign = redesignResults[globalIndex]

        const stt = data[globalIndex]?.stt ?? (globalIndex + 1)
        const row = data[globalIndex]

        const src = `data:${redesign.mimeType};base64,${redesign.base64}`
        const blob = await fetch(src).then((r) => r.blob())
        const redesignFile = new File([blob], `redesign-master-${globalIndex}.png`, { type: 'image/png' })
        const marketplaceMetadata = await generateMarketplaceMetadataIfNeeded(redesign, row)

        const lifestyleFiles = []
        const lifestylePreviewImages = getLifestylePreviewImages(lifestyleResults[globalIndex])
        for (let i = 0; i < lifestylePreviewImages.length; i += 1) {
          const lifestyleImage = lifestylePreviewImages[i]
          if (!lifestyleImage?.base64) continue
          const lifestyleSrc = `data:${lifestyleImage.mimeType || 'image/png'};base64,${lifestyleImage.base64}`
          const lifestyleBlob = await fetch(lifestyleSrc).then((r) => r.blob())
          const lifestyleFile = new File(
            [lifestyleBlob],
            `redesign-lifestyle-${globalIndex}-${i + 1}.png`,
            { type: lifestyleImage.mimeType || 'image/png' }
          )
          lifestyleFiles.push(lifestyleFile)
        }

        const optionalFiles = lifestyleFiles
        await updateDesignPageImages({
          sheetId,
          gid,
          accessToken,
          stt,
          redesignImageFile: redesignFile,
          lifestyleImageFiles: optionalFiles.length > 0 ? optionalFiles : null,
          requireLifestyleImage: false,
          title: marketplaceMetadata?.title || '',
          description: marketplaceMetadata?.description || '',
          tags: marketplaceMetadata?.tags || null,
          marketplace: marketplaceMetadata?.marketplace === 'amazon' ? 'Amazon' : marketplaceMetadata?.marketplace === 'etsy' ? 'Etsy' : '',
          productDescription: marketplaceMetadata?.productDescription || '',
          bulletPoint1: marketplaceMetadata?.bulletPoint1 || '',
          bulletPoint2: marketplaceMetadata?.bulletPoint2 || '',
          bulletPoint3: marketplaceMetadata?.bulletPoint3 || '',
          bulletPoint4: marketplaceMetadata?.bulletPoint4 || '',
          bulletPoint5: marketplaceMetadata?.bulletPoint5 || '',
          genericKeyword: marketplaceMetadata?.genericKeyword || '',
          pageKey: 'redesign',
        })
        successCount += 1
        setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'done' }))
      } catch (err) {
        console.error(`Upload error for index ${globalIndex}:`, err)
        errorCount += 1
        setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'error' }))
      }
    }

    setIsUploading(false)
    alert(`Upload hoàn tất: ${successCount} thành công, ${errorCount} lỗi.`)
    setSelectedItems(new Set())
  }


  return (
    <section className="rounded-2xl border border-zinc-200 bg-zinc-100/95 p-6 text-zinc-800">
      <PatchPromptModal
        isOpen={showPromptModal}
        initialTab={editingPromptType || 'redesign'}
        prompts={{
          redesign: redesignPrompt,
          MockupPatch1: mockupPatch1,
          MockupPatch2: mockupPatch2,
          MockupPatch3: mockupPatch3,
        }}
        defaults={{
          redesign: PROMPT_DEFAULTS.redesign || PROMPT_DEFAULTS.patch,
          MockupPatch1: PROMPT_DEFAULTS.MockupPatch1,
          MockupPatch2: PROMPT_DEFAULTS.MockupPatch2,
          MockupPatch3: PROMPT_DEFAULTS.MockupPatch3,
        }}
        onClose={() => { setShowPromptModal(false); setEditingPromptType(null) }}
        onSave={async (key, value) => {
          const details = getPromptDetails(key)
          if (!details) return
          details.setter(value)
          try {
            await savePromptToPromptsMoi(key, value)
            const filePath = await getPromptsMoiPath()
            if (filePath) alert(`Da luu prompt vao:\n${filePath}`)
          } catch (error) {
            alert(error?.message || 'Khong the luu prompt')
          }
        }}
        onReset={async (key) => {
          const details = getPromptDetails(key)
          if (!details) return
          details.setter(details.default)
          PROMPTS[key] = details.default
          try {
            await removePromptFromPromptsMoi(key)
          } catch (error) {
            alert(error?.message || 'Khong the reset prompt')
          }
        }}
      />
      {editorState ? (
        <ImagePreviewEditorModal
          asset={{
            src: editorState.src,
            title: editorState.title,
            description: editorState.description,
            previewOptions: editorState.previewOptions,
          }}
          onClose={() => setEditorState(null)}
          onApply={handleApplyEditorChanges}
          onPreviewOptionsChange={handlePersistEditorPreviewOptions}
        />
      ) : null}
      {isLoading && (
        <div className="mt-3">
          <div className="h-2 w-full rounded-full bg-zinc-200">
            <div
              className="h-2 rounded-full bg-indigo-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl font-semibold tracking-tight text-zinc-900">
          Redesign Workspace ({data.length} Items)
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsListedItemsModalOpen(true)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Listed
          </button>
          <button
            onClick={() => { setEditingPromptType('redesign'); setShowPromptModal(true) }}
            className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
          >
            📝 Prompt
          </button>

          <span className="rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-xs font-medium text-zinc-600">
            B2 sẵn sàng: {selectedReadyCount} đã chọn | Toàn bộ: {totalReadyCount}
          </span>
          <div className="flex w-full flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <button
              onClick={handleOpenGeminiGoogleLogin}
              disabled={isGeminiLoginBusy}
              className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
                {isGeminiLoginBusy ? '⏳ Đang mở browser...' : '🔐 B1: Đăng nhập Google thật'}
            </button>
            <button
              onClick={handleGetGeminiCookiesOnly}
              disabled={isGeminiLoginBusy}
              className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
                {isGeminiLoginBusy ? '⏳ Đang lấy phiên...' : `🍪 B2: Dùng phiên này cho Gemini (${geminiCookies.length})`}
            </button>
            <span className="text-[11px] font-medium leading-5 text-emerald-700">
              B1 mo Chrome that voi profile rieng, dang nhap Google trong cua so do. B2 dong bo phien de Gemini su dung.
            </span>
          </div>
          <button
            onClick={handleUploadBatch}
            disabled={isUploading || !(selectedReadyCount || totalReadyCount)}
            className="rounded-lg bg-blue-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {isUploading
              ? '⏳ Uploading...'
              : selectedItems.size > 0
                ? `📤 Upload ${selectedItems.size} Selected (ưu tiên)`
                : '📤 Upload toàn bộ có bước 2'}
          </button>
        </div>
        {geminiCookieTime ? (
          <p className="w-full text-xs text-zinc-500">
            Gemini Project: {geminiProjectUrl} | Cookies cap nhat luc: {new Date(geminiCookieTime).toLocaleString()} ({geminiCookies.length} cookies)
          </p>
        ) : (
          <p className="w-full text-xs text-zinc-500">
            Huong dan: B1 mo Chrome that voi profile rieng, dang nhap Google xong roi bam B2 de dong bo phien cho Gemini.
          </p>
        )}
      </div>

      {data.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
          Chưa có dữ liệu. Hãy nhập link sheet và bấm Get Dữ Liệu.
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-5">
            {paginatedData.map((row, index) => {
              const itemNumber = (currentPage - 1) * pageSize + index + 1
              const globalIndex = (currentPage - 1) * pageSize + index
              const hasImage = isValidImageUrl(row.imageLink)
              const redesign = redesignResults[globalIndex]
              const lifestyle = lifestyleResults[globalIndex]
              const lifestylePreviewImages = getLifestylePreviewImages(lifestyle)
              const redesignDataUrl = redesign?.base64
                ? `data:${redesign.mimeType || 'image/png'};base64,${redesign.base64}`
                : ''
              const editorPreviewOptions = [
                ...(redesignDataUrl ? [{ id: 'redesign', label: 'Redesign', src: redesignDataUrl }] : []),
                ...lifestylePreviewImages
                  .filter((image) => image?.base64)
                  .map((image, imageIndex) => ({
                    id: `lifestyle-${imageIndex}`,
                    label: `Lifestyle ${imageIndex + 1}`,
                    src: `data:${image.mimeType || 'image/png'};base64,${image.base64}`,
                  })),
              ]
              const sourceEditorPreviewOptions = mergePreviewOptions(
                editorPreviewOptions,
                editorPreviewHistory[buildEditorPreviewKey('source', globalIndex)] || []
              )
              const redesignEditorPreviewOptions = mergePreviewOptions(
                editorPreviewOptions,
                editorPreviewHistory[buildEditorPreviewKey('redesign', globalIndex)] || []
              )
              const getLifestyleEditorPreviewOptions = (imageIndex) =>
                mergePreviewOptions(
                  editorPreviewOptions,
                  editorPreviewHistory[
                  buildEditorPreviewKey('lifestyle', globalIndex, imageIndex)
                  ] || []
                )

              return (
                <article
                  key={`${row.keyword}-${itemNumber}`}
                  className="rounded-2xl border border-zinc-300 bg-white p-5 shadow-sm"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-indigo-100 px-3 py-2 text-center font-mono text-sm font-semibold text-indigo-700">
                        STT: {row.stt}
                      </div>
                      <div className="text-xl font-semibold text-zinc-900">
                        {row.keyword || `Patch ${itemNumber}`}
                      </div>
                    </div>
                    {redesign?.base64 && (
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(globalIndex)}
                          onChange={() => toggleItemSelection(globalIndex)}
                          className="h-5 w-5 cursor-pointer rounded border-zinc-300 text-blue-500"
                        />
                        {selectedItems.size === 0 && (
                          <button
                            onClick={() => handleUploadSingle(globalIndex)}
                            disabled={isUploading}
                            className={`px-2 py-1 text-xs font-semibold rounded transition ${uploadStatus[globalIndex] === 'done'
                              ? 'bg-green-500 text-white'
                              : uploadStatus[globalIndex] === 'uploading'
                                ? 'bg-yellow-500 text-white'
                                : uploadStatus[globalIndex] === 'error'
                                  ? 'bg-red-500 text-white'
                                  : 'bg-blue-500 text-white hover:bg-blue-600'
                              }`}
                          >
                            {uploadStatus[globalIndex] === 'done'
                              ? '✅ Done'
                              : uploadStatus[globalIndex] === 'uploading'
                                ? '⏳ Uploading'
                                : uploadStatus[globalIndex] === 'error'
                                  ? '❌ Error'
                                  : '📤 Upload'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 items-stretch">
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        1. SOURCE COMPETITOR
                      </div>
                      <div className="flex h-96 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100">
                        {hasImage ? (
                          <img
                            src={row.imageLink}
                            alt={row.keyword || 'competitor'}
                            className="h-full w-full cursor-zoom-in rounded-xl object-cover"
                            loading="lazy"
                            onClick={() =>
                              setEditorState({
                                kind: 'source',
                                globalIndex,
                                src: row.imageLink,
                                title: row.keyword || `Source ${itemNumber}`,
                                description: 'Ảnh gốc sau khi lưu sẽ thay thế nguồn hiện tại và reset các ảnh đã tạo từ nguồn cũ.',
                                previewOptions: sourceEditorPreviewOptions,
                              })
                            }
                          />
                        ) : (
                          <span className="text-sm text-zinc-400">Drag image here</span>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-zinc-500">
                        Item #{itemNumber}
                      </p>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                          2. FINAL CONCEPT REDESIGN
                        </span>
                        <button
                          onClick={() => handleCreateMaster(globalIndex, row.imageLink)}
                          disabled={redesign?.loading || !hasImage}
                          className="text-xs font-medium text-indigo-500 hover:text-indigo-700 disabled:opacity-40"
                        >
                          {redesign?.loading ? '⏳ Đang tạo...' : '✨ Create Master'}
                        </button>
                      </div>
                      <div className="flex h-96 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100 overflow-hidden">
                        {redesign?.loading ? (
                          <div className="flex flex-col items-center gap-2 text-zinc-400">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
                            <span className="text-xs">Đang redesign với AI...</span>
                          </div>
                        ) : redesign?.base64 ? (
                          <img
                            src={`data:${redesign.mimeType};base64,${redesign.base64}`}
                            alt={`redesign-${row.keyword}`}
                            className="h-full w-full cursor-zoom-in rounded-xl object-cover"
                            onClick={() =>
                              setEditorState({
                                kind: 'redesign',
                                globalIndex,
                                src: redesignDataUrl,
                                title: `${row.keyword || `Item ${itemNumber}`} redesign`,
                                description: 'Lưu chỉnh sửa sẽ cập nhật ảnh redesign hiện tại và reset lifestyle để tránh lệch dữ liệu.',
                                previewOptions: redesignEditorPreviewOptions,
                              })
                            }
                          />
                        ) : redesign?.error ? (
                          <div className="flex flex-col items-center gap-1 px-4 text-center">
                            <span className="text-2xl">⚠️</span>
                            <span className="text-xs text-red-500">{redesign.error}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-zinc-400">Bấm ✨ Create Master để tạo ảnh</span>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-zinc-500 italic">
                        Focus: {row.keyword || '2D Holographic Acrylic Patch style.'}
                      </p>
                      {redesign?.requestPayload ? (
                        <p className="mt-1 text-[11px] text-zinc-500">
                          Da gui kem payload: project URL + prompt + source image + {Array.isArray(redesign.requestPayload.cookies) ? redesign.requestPayload.cookies.length : 0} cookies.
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                          3. LIFESTYLE IMAGE
                        </span>
                        <button
                          onClick={() => handleGenerateLifestyle(globalIndex)}
                          disabled={lifestyle?.loading || !redesignDataUrl}
                          className="text-xs font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-40"
                        >
                          {lifestyle?.loading ? '⏳ Đang tạo...' : '✨ Generate Lifestyle'}
                        </button>
                      </div>
                      <div className="flex h-96 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100 overflow-hidden">
                        {lifestyle?.loading || lifestylePreviewImages.length > 0 ? (
                          <div className="h-full w-full overflow-auto p-2">
                            {lifestyle?.loading && (
                              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                                <div className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                                Đang tạo thêm ảnh lifestyle...
                              </div>
                            )}
                            {lifestylePreviewImages.length > 0 ? (
                              <div className="grid grid-cols-2 gap-2">
                                {lifestylePreviewImages.map((image, imageIndex) => {
                                  const lifestyleSrc = `data:${image.mimeType || 'image/png'};base64,${image.base64}`
                                  return (
                                    <img
                                      key={`${globalIndex}-lifestyle-${imageIndex}`}
                                      src={lifestyleSrc}
                                      alt={`lifestyle-${row.keyword || itemNumber}-${imageIndex + 1}`}
                                      className="h-44 w-full cursor-zoom-in rounded-lg object-cover"
                                      loading="lazy"
                                      onClick={() =>
                                        setEditorState({
                                          kind: 'lifestyle',
                                          globalIndex,
                                          imageIndex,
                                          src: lifestyleSrc,
                                          title: `${row.keyword || `Item ${itemNumber}`} lifestyle ${imageIndex + 1}`,
                                          description: 'Lifestyle sẽ được gửi kèm khi update sheet nếu có.',
                                          previewOptions: getLifestyleEditorPreviewOptions(imageIndex),
                                        })
                                      }
                                    />
                                  )
                                })}
                              </div>
                            ) : lifestyle?.loading ? (
                              <div className="flex flex-col items-center gap-2 text-zinc-400">
                                <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                                <span className="text-xs">Đang tạo lifestyle...</span>
                              </div>
                            ) : null}
                          </div>
                        ) : lifestyle?.error ? (
                          <div className="flex flex-col items-center gap-1 px-4 text-center">
                            <span className="text-2xl">⚠️</span>
                            <span className="text-xs text-red-500">{lifestyle.error}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-zinc-400">Bấm Generate để tạo lifestyle</span>
                        )}
                      </div>
                      {lifestylePreviewImages.length > 0 ? (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleDownloadAllLifestyle(globalIndex)}
                            className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                          >
                            📥 Tải toàn bộ
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setLifestyleResults((prev) => ({
                                ...prev,
                                [globalIndex]: {
                                  ...(prev[globalIndex] || {}),
                                  loading: false,
                                  base64: null,
                                  mimeType: null,
                                  images: [],
                                  analysis: null,
                                  mockup: null,
                                  raw: null,
                                  error: null,
                                },
                              }))
                            }
                            className="flex-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                          >
                            Xóa toàn bộ lifestyle
                          </button>
                        </div>
                      ) : null}
                      <p className="mt-2 text-xs text-zinc-500 italic">
                        Lifestyle có thì upload, không có thì bỏ qua.
                      </p>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-300 bg-white px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-zinc-600">
              <span>Hiển thị</span>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value))
                  setCurrentPage(1)
                }}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700"
              >
                <option value={2}>2</option>
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
              <span>items/trang</span>
            </div>

            <div className="text-sm text-zinc-600">
              Hiển thị {startItemIndex}-{endItemIndex} / {data.length}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 disabled:opacity-50"
              >
                Trước
              </button>
              <span className="text-sm text-zinc-600">
                Trang {currentPage}/{totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 disabled:opacity-50"
              >
                Sau
              </button>
            </div>
          </div>
        </>
      )}
      <ListedItemsModal
        isOpen={isListedItemsModalOpen}
        onClose={() => setIsListedItemsModalOpen(false)}
        sheetUrl={localStorage.getItem('redesignSheetUrl') || localStorage.getItem('ornamentSheetUrl') || ''}
      />
    </section>
  )
}
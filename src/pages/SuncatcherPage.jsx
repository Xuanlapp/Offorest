import { useMemo, useState, useEffect, useRef, startTransition } from 'react'
import { redesignImage, generateMockupImage, generateMarketplaceListingFromRedesign, sourceImageToBase64 } from '../services/geminiService'
import { getSheetUrlForPage } from '../services/sheetConfigService'
import { updateDesignPageImages } from '../services/googleDriveService'
import {
  getDefaultMockupPsdFile,
  pickMockupPsdFile,
  renderMockupTemplatePreview,
  renderMockupsFromPsd,
} from '../services/mockupService'
import { getCurrentUser, isAmazonRole, isEtsyRole } from '../services/authService'
import { PROMPTS, PROMPT_DEFAULTS } from '../prompt/Prompts'
import {
  getPromptsMoiPath,
  removePromptFromPromptsMoi,
  savePromptToPromptsMoi,
} from '../prompt/PromptsMoiService'
import ImagePreviewEditorModal from '../modals/ImagePreviewEditorModal'
import PromptEditorModal from '../modals/PromptEditorModal'
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
export default function SuncatcherPage() {
  const PSD_RENDERER = 'ag-psd'
  const PREFER_PHOTOSHOP_ENGINE = false
  const MOCKUP_TEMPLATE_STORAGE_KEY = 'suncatcherMockupTemplatePath'
  const MOCKUP_TEMPLATE_HISTORY_KEY = 'suncatcherMockupTemplateHistory'
  const MOCKUP_TEMPLATE_PREVIEWS_KEY = 'suncatcherMockupTemplatePreviews'
  const CUSTOM_MOCKUPS_STORAGE_KEY = 'suncatcherCustomMockups'

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
  const [customMockups, setCustomMockups] = useState({})
  const [renderedMockupImagesCount, setRenderedMockupImagesCount] = useState({})
  const [mockupTemplatePath, setMockupTemplatePath] = useState('')
  const [mockupTemplateHistory, setMockupTemplateHistory] = useState([])
  const [mockupTemplatePreviews, setMockupTemplatePreviews] = useState({})
  const [showMockupPicker, setShowMockupPicker] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [previewMockupTemplatePath, setPreviewMockupTemplatePath] = useState('')
  const [mockupTemplatePreviewLoadingPath, setMockupTemplatePreviewLoadingPath] = useState('')
  const [mockupRenderStatus, setMockupRenderStatus] = useState({})
  const [isElectronMockupAvailable, setIsElectronMockupAvailable] = useState(false)
  const [isElectronRuntime, setIsElectronRuntime] = useState(false)
  const [editorState, setEditorState] = useState(null)
  const [editorPreviewHistory, setEditorPreviewHistory] = useState({})
  const [showPromptEditor, setShowPromptEditor] = useState(false)
  const [isListedItemsModalOpen, setIsListedItemsModalOpen] = useState(false)
  const [suncatcherPrompt, setSuncatcherPrompt] = useState(() => PROMPTS.suncatcher)
  const [mockupSuncatcher1, setMockupSuncatcher1] = useState(() => PROMPTS.MockupSuncatcher1)
  const [mockupSuncatcher2, setMockupSuncatcher2] = useState(() => PROMPTS.MockupSuncatcher2)
  const [mockupSuncatcher3, setMockupSuncatcher3] = useState(() => PROMPTS.MockupSuncatcher3)
  const persistCustomMockupsTimerRef = useRef(null)
  const mockupImagesRef = useRef({})
  const lifestyleQueueRef = useRef(Promise.resolve())

  const mockupBridgeStatus = isElectronRuntime
    ? isElectronMockupAvailable
      ? 'Electron bridge: ready'
      : 'Electron bridge: missing'
    : 'Web mode (no Electron bridge)'

  const getTemplatePreviewImages = (templatePath) => {
    const normalizedPath = String(templatePath || '').trim()
    if (!normalizedPath) return []

    const cachedPreviews = mockupTemplatePreviews[normalizedPath]
    if (Array.isArray(cachedPreviews) && cachedPreviews.length) {
      return cachedPreviews
    }

    return []
  }

  const activeMockupPreviewImages =
    getTemplatePreviewImages(previewMockupTemplatePath)
    || []

  const readStoredJson = (storageKey, fallbackValue) => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return fallbackValue
      return JSON.parse(raw)
    } catch {
      return fallbackValue
    }
  }

  const writeStoredJson = (storageKey, value) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value))
      return true
    } catch {
      return false
    }
  }

  const syncMockupTemplateSelection = (nextTemplatePath, { announceChange = false } = {}) => {
    const normalizedPath = String(nextTemplatePath || '').trim()
    if (!normalizedPath) return

    const previousTemplatePath = String(localStorage.getItem(MOCKUP_TEMPLATE_STORAGE_KEY) || '').trim()
    setMockupTemplatePath(normalizedPath)
    localStorage.setItem(MOCKUP_TEMPLATE_STORAGE_KEY, normalizedPath)

    setMockupTemplateHistory((prev) => {
      const nextHistory = [normalizedPath, ...prev.filter((item) => item !== normalizedPath)].slice(0, 12)
      writeStoredJson(MOCKUP_TEMPLATE_HISTORY_KEY, nextHistory)
      return nextHistory
    })

    if (announceChange && previousTemplatePath && previousTemplatePath !== normalizedPath) {
      alert(`Đã đổi mockup mặc định sang file mới. Lần sau app sẽ tự dùng file này.\n\nCũ: ${previousTemplatePath}\nMới: ${normalizedPath}`)
    }
  }

  const persistMockupTemplatePreview = (templatePath, outputs = []) => {
    const normalizedPath = String(templatePath || '').trim()
    if (!normalizedPath) return

    // Only store first preview in state to avoid bloating it with all base64 data
    const firstPreview = Array.isArray(outputs) && outputs.length
      ? outputs[0]
      : null

    if (!firstPreview?.dataUrl) {
      return
    }

    const previewOutput = {
      name: firstPreview?.name || 'MOCKUP.png',
      dataUrl: String(firstPreview.dataUrl),
    }

    setMockupTemplatePreviews((prev) => {
      const next = {
        ...prev,
        [normalizedPath]: [previewOutput],
      }
      return next
    })
  }

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
        if (sanPham && normalizeHeader(sanPham) !== 'suncatcher') return false

        const linkAnh = getValueByAliases(row, ['LINK ẢNH', 'Link ảnh', 'LINK ANH', 'LINK NGUỒN', 'Link nguồn', 'LINK NGUON', 'Image', 'Image Link', 'IMAGE LINK'])
        if (!String(linkAnh || '').trim()) return false

        const redesign = getValueByAliases(row, ['REDESIGN', 'Redesign', 'FINAL CONCEPT REDESIGN'])
        if (String(redesign || '').trim()) return false

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

  // Tự động polling 30s — chỉ append dòng mới, không reset state
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
    const savedUrl = localStorage.getItem('suncatcherSheetUrl') || localStorage.getItem('ornamentSheetUrl') || ''
    if (savedUrl) {
      handleGetData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handleGetDataEvent = () => {
      handleGetData()
    }

    window.addEventListener('suncatcherGetData', handleGetDataEvent)
    return () => window.removeEventListener('suncatcherGetData', handleGetDataEvent)
  }, [])

  useEffect(() => {
    setIsElectronRuntime(Boolean(window?.navigator?.userAgent?.includes('Electron')))
    setIsElectronMockupAvailable(
      Boolean(
        window?.offorestMockup?.pickPsdFile
        && (window?.offorestMockup?.preparePreviewOverlay || window?.offorestMockup?.renderFromPsd)
      )
    )

    const savedMockupTemplatePath = String(localStorage.getItem(MOCKUP_TEMPLATE_STORAGE_KEY) || '').trim()
    const savedMockupTemplateHistory = readStoredJson(MOCKUP_TEMPLATE_HISTORY_KEY, [])
    const savedMockupTemplatePreviews = readStoredJson(MOCKUP_TEMPLATE_PREVIEWS_KEY, {})
    const savedCustomMockups = readStoredJson(CUSTOM_MOCKUPS_STORAGE_KEY, {})

    if (savedMockupTemplatePath) {
      setMockupTemplatePath(savedMockupTemplatePath)
      setPreviewMockupTemplatePath(savedMockupTemplatePath)
    }

    if (Array.isArray(savedMockupTemplateHistory) && savedMockupTemplateHistory.length) {
      setMockupTemplateHistory(savedMockupTemplateHistory)
    }

    if (savedMockupTemplatePreviews && typeof savedMockupTemplatePreviews === 'object') {
      setMockupTemplatePreviews(savedMockupTemplatePreviews)
    }

    if (savedCustomMockups && typeof savedCustomMockups === 'object') {
      setCustomMockups(savedCustomMockups)
    }

    const bootstrapMockupTemplate = async () => {
      if (savedMockupTemplatePath) {
        return
      }

      try {
        const result = await getDefaultMockupPsdFile()
        if (result?.filePath) {
          setMockupTemplatePath(result.filePath)
          localStorage.setItem(MOCKUP_TEMPLATE_STORAGE_KEY, result.filePath)
        }
      } catch {
        // Ignore default template lookup errors.
      }
    }

    bootstrapMockupTemplate()
  }, [])

  useEffect(() => {
    if (persistCustomMockupsTimerRef.current) {
      clearTimeout(persistCustomMockupsTimerRef.current)
    }

    persistCustomMockupsTimerRef.current = setTimeout(() => {
      writeStoredJson(CUSTOM_MOCKUPS_STORAGE_KEY, customMockups)
    }, 400)

    return () => {
      if (persistCustomMockupsTimerRef.current) {
        clearTimeout(persistCustomMockupsTimerRef.current)
      }
    }
  }, [customMockups])

  useEffect(() => {
    // Progressive rendering: render images one by one to avoid freezing
    const timeoutHandles = []

    Object.keys(customMockups).forEach((key) => {
      const globalIndex = Number(key)
      if (!Number.isNaN(globalIndex)) {
        const allImages = mockupImagesRef.current[globalIndex]
        const currentCount = renderedMockupImagesCount[globalIndex] || 0

        if (Array.isArray(allImages) && allImages.length > currentCount) {
          // Progressive rendering: add next image after small delay
          const nextImageIndex = currentCount
          const handle = setTimeout(() => {
            setRenderedMockupImagesCount((prev) => ({
              ...prev,
              [globalIndex]: Math.min(currentCount + 1, allImages.length),
            }))
          }, nextImageIndex * 100) // 100ms between each image

          timeoutHandles.push(handle)
        }
      }
    })

    return () => {
      timeoutHandles.forEach((handle) => clearTimeout(handle))
    }
  }, [customMockups, renderedMockupImagesCount])

  const filteredData = data.filter(item => {
    const term = searchTerm.toLowerCase()
    return item.keyword.toLowerCase().includes(term) || item.stt.toString().includes(term)
  })

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize))
  const paginatedData = useMemo(
    () => filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredData, currentPage, pageSize]
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

  const getItemMockupTemplatePath = (globalIndex) => {
    const itemTemplatePath = customMockups?.[globalIndex]?.templatePath
    return String(itemTemplatePath || mockupTemplatePath || '').trim()
  }

  const setItemMockupTemplatePath = (globalIndex, templatePath) => {
    const normalizedPath = String(templatePath || '').trim()
    if (!normalizedPath) {
      return
    }

    setCustomMockups((prev) => ({
      ...prev,
      [globalIndex]: {
        ...(prev[globalIndex] || {}),
        templatePath: normalizedPath,
      },
    }))
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
        productType: row?.sanPham || 'Suncatcher Ornament',
      })
    } catch (err) {
      console.warn('⚠️ [Suncatcher] Marketplace metadata generation failed, uploading without metadata:', err?.message)
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

    if (editorState.kind === 'customMockup') {
      const selectedMockupPreviewOptions = Array.isArray(previewOptions)
        ? previewOptions.filter((option) => option?.src)
        : []
      const activeMockupPreviewOption =
        selectedMockupPreviewOptions.find((option) => option.id === selectedPreviewId) ||
        selectedMockupPreviewOptions[0] ||
        null
      setCustomMockups((prev) => ({
        ...prev,
        [editorState.globalIndex]: {
          ...prev[editorState.globalIndex],
          dataUrl: activeMockupPreviewOption?.src || '',
          name:
            activeMockupPreviewOption?.label ||
            prev[editorState.globalIndex]?.name ||
            `custom-mockup-${editorState.globalIndex + 1}.png`,
          images: selectedMockupPreviewOptions.map((option, index) => ({
            name: option.label || `mockup-${index + 1}.png`,
            dataUrl: option.src,
          })),
        },
      }))
    }
  }

  const handleCustomMockupUpload = async (globalIndex, file) => {
    if (!file) return

    if (!String(file.type || '').startsWith('image/')) {
      alert('Vui lòng chọn file ảnh hợp lệ')
      return
    }

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Không thể đọc file ảnh'))
      reader.readAsDataURL(file)
    })

    setCustomMockups((prev) => ({
      ...prev,
      [globalIndex]: {
        source: 'manual',
        name: file.name,
        dataUrl: String(dataUrl || ''),
        images: [
          {
            name: file.name,
            dataUrl: String(dataUrl || ''),
          },
        ],
      },
    }))
  }

  const getMockupPreviewImages = (globalIndex) => {
    // Progressive rendering: only show images that have been rendered
    const allImages = mockupImagesRef.current[globalIndex] || []
    const renderedCount = renderedMockupImagesCount[globalIndex] || 0

    // Show rendered images from ref
    if (Array.isArray(allImages) && allImages.length > 0) {
      return allImages.slice(0, renderedCount)
    }

    // Fallback if ref is empty
    const item = customMockups[globalIndex]
    if (item?.dataUrl) {
      return [
        {
          name: item?.name || `mockup-${globalIndex + 1}.png`,
          dataUrl: item.dataUrl,
        },
      ]
    }
    return []
  }

  const getAllMockupImages = (globalIndex) => {
    const allImages = mockupImagesRef.current[globalIndex] || []
    if (Array.isArray(allImages) && allImages.length) {
      return allImages
    }

    const item = customMockups[globalIndex]
    if (item?.dataUrl) {
      return [
        {
          name: item?.name || `mockup-${globalIndex + 1}.png`,
          dataUrl: item.dataUrl,
        },
      ]
    }

    return []
  }

  const handlePickMockupTemplate = async () => {
    if (!isElectronMockupAvailable) {
      if (isElectronRuntime) {
        alert('Đang chạy Electron nhưng preload bridge PSD chưa nạp. Hãy đóng toàn bộ cửa sổ app và mở lại bằng npm.cmd run electron:dev.')
      } else {
        alert('Không chọn được PSD vì bạn đang chạy web mode. Hãy mở app bằng Electron desktop (npm.cmd run start hoặc npm.cmd run electron:dev).')
      }
      return
    }

    try {
      const result = await pickMockupPsdFile()
      if (!result?.canceled && result?.filePath) {
        syncMockupTemplateSelection(result.filePath, { announceChange: true })
      }
    } catch (err) {
      alert(err?.message || 'Không thể chọn file MOCKUP.psd')
    }
  }

  const handleGenerateMockupFromTemplate = async (globalIndex, designImageInput) => {
    if (!designImageInput) {
      alert('Vui lòng tạo FINAL CONCEPT REDESIGN trước')
      return
    }

    const effectiveTemplatePath = getItemMockupTemplatePath(globalIndex)
    if (!effectiveTemplatePath) {
      alert('Vui lòng chọn file MOCKUP.psd trước')
      return
    }

    setMockupRenderStatus((prev) => ({ ...prev, [globalIndex]: 'loading' }))

    try {
      const designDataUrl = String(designImageInput).startsWith('data:image/')
        ? designImageInput
        : await (async () => {
          const converted = await sourceImageToBase64({ imageUrl: designImageInput })
          return `data:${converted.mimeType || 'image/png'};base64,${converted.base64}`
        })()

      const result = await renderMockupsFromPsd({
        psdPath: effectiveTemplatePath,
        designDataUrl,
        renderer: PSD_RENDERER,
        preferPhotoshop: PREFER_PHOTOSHOP_ENGINE,
      })

      if (result?.warning) {
        console.warn(result.warning)
      }

      const images = Array.isArray(result?.outputs)
        ? result.outputs
          .filter((output) => output?.dataUrl && String(output.dataUrl).startsWith('data:image/'))
          .map((output, index) => ({
            name: output?.name || `MOCKUP ${index + 1}.png`,
            dataUrl: String(output.dataUrl),
          }))
        : []

      if (!images.length) {
        throw new Error('Không render được ảnh PNG nào từ PSD')
      }

      // Use startTransition to prevent UI freeze during state updates
      startTransition(() => {
        // Store all images in ref for progressive rendering
        if (!mockupImagesRef.current) {
          mockupImagesRef.current = {}
        }
        mockupImagesRef.current[globalIndex] = images

        // Update state with only the first image + metadata
        setCustomMockups((prev) => ({
          ...prev,
          [globalIndex]: {
            source: 'psd',
            templatePath: result?.templatePath || effectiveTemplatePath,
            name: images[0]?.name || `mockup-${globalIndex + 1}.png`,
            dataUrl: images[0]?.dataUrl || '',
            imageCount: images.length,
          },
        }))

        // Start progressive rendering: show first image immediately
        setRenderedMockupImagesCount((prev) => ({
          ...prev,
          [globalIndex]: 1,
        }))

        persistMockupTemplatePreview(result?.templatePath || effectiveTemplatePath, result?.outputs || [])
      })

      setMockupRenderStatus((prev) => ({ ...prev, [globalIndex]: 'done' }))
    } catch (err) {
      console.error('Render mockup PSD error:', err)
      setMockupRenderStatus((prev) => ({ ...prev, [globalIndex]: 'error' }))
      alert(err?.message || 'Không thể render mockup từ PSD')
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

  const getFileNameFromPath = (filePath) => {
    const value = String(filePath || '').trim()
    if (!value) return 'Unknown mockup'
    return value.split(/[\\/]/).filter(Boolean).pop() || value
  }

  const openMockupPicker = () => {
    const initialPreviewPath = mockupTemplatePath || mockupTemplateHistory[0] || ''
    setPreviewMockupTemplatePath(initialPreviewPath)
    setShowMockupPicker(true)
  }

  const ensureMockupTemplatePreview = async (templatePath) => {
    const normalizedPath = String(templatePath || '').trim()
    if (!normalizedPath) return []

    // Check if in ref first
    if (mockupImagesRef.current[normalizedPath]) {
      return mockupImagesRef.current[normalizedPath]
    }

    // Check cached state (used for initial load)
    const cachedPreviews = mockupTemplatePreviews[normalizedPath]
    if (Array.isArray(cachedPreviews) && cachedPreviews.length) {
      // Need to rebuild full array from ref if available, fall back to cached
      return cachedPreviews
    }

    const result = await renderMockupTemplatePreview({ psdPath: normalizedPath })
    const previewImages = Array.isArray(result?.outputs)
      ? result.outputs
        .filter((output) => output?.dataUrl && String(output.dataUrl).startsWith('data:image/'))
        .map((output, index) => ({
          name: output?.name || `MOCKUP ${index + 1}.png`,
          dataUrl: String(output.dataUrl),
        }))
      : []

    // Store full array in ref to avoid state bloat
    mockupImagesRef.current[normalizedPath] = previewImages

    // Store only first preview in state
    setMockupTemplatePreviews((prev) => {
      const next = {
        ...prev,
        [normalizedPath]: previewImages.length ? [previewImages[0]] : [],
      }
      return next
    })

    return previewImages
  }

  const selectMockupTemplateFromHistory = (filePath) => {
    syncMockupTemplateSelection(filePath, { announceChange: false })
    setPreviewMockupTemplatePath(filePath)
    setShowMockupPicker(false)
  }

  const removeMockupTemplateFromHistory = (filePath) => {
    const normalizedPath = String(filePath || '').trim()
    if (!normalizedPath) return

    const nextHistory = mockupTemplateHistory.filter((item) => item !== normalizedPath)
    const nextPreviews = { ...mockupTemplatePreviews }
    delete nextPreviews[normalizedPath]

    // Clean up ref storage
    delete mockupImagesRef.current[normalizedPath]

    setMockupTemplateHistory(nextHistory)
    setMockupTemplatePreviews(nextPreviews)
    writeStoredJson(MOCKUP_TEMPLATE_HISTORY_KEY, nextHistory)
    writeStoredJson(MOCKUP_TEMPLATE_PREVIEWS_KEY, nextPreviews)

    if (mockupTemplatePath === normalizedPath) {
      const nextSelected = nextHistory[0] || ''
      setMockupTemplatePath(nextSelected)
      if (nextSelected) {
        localStorage.setItem(MOCKUP_TEMPLATE_STORAGE_KEY, nextSelected)
      } else {
        localStorage.removeItem(MOCKUP_TEMPLATE_STORAGE_KEY)
      }
    }

    if (previewMockupTemplatePath === normalizedPath) {
      setPreviewMockupTemplatePath(nextHistory[0] || '')
    }
  }

  const handleShowMockupTemplate = async (filePath) => {
    const normalizedPath = String(filePath || '').trim()
    if (!normalizedPath) return

    setPreviewMockupTemplatePath(normalizedPath)
    setShowMockupPicker(true)
    setMockupTemplatePreviewLoadingPath(normalizedPath)

    try {
      await ensureMockupTemplatePreview(normalizedPath)
    } catch (error) {
      console.error('Render template preview error:', error)
      alert(error?.message || 'Không thể xuất PNG từ mockup template')
    } finally {
      setMockupTemplatePreviewLoadingPath((prev) => (prev === normalizedPath ? '' : prev))
    }
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
      const result = await redesignImage(imageLink, suncatcherPrompt)

      setRedesignResults((prev) => ({
        ...prev,
        [globalIndex]: {
          loading: false,
          base64: result.base64,
          mimeType: result.mimeType || 'image/png',
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

  const startItemIndex = data.length ? (currentPage - 1) * pageSize + 1 : 0
  const endItemIndex = Math.min(currentPage * pageSize, data.length)

  const handleGetData = async () => {
    let interval

    try {
      let sheetUrl = localStorage.getItem('suncatcherSheetUrl') || localStorage.getItem('ornamentSheetUrl')

      if (!sheetUrl) {
        sheetUrl = await getSheetUrlForPage('suncatcher')
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
      setCustomMockups({})
      setRenderedMockupImagesCount({})
      setMockupRenderStatus({})
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
        if (response.status === 403) {
          throw new Error(`Không thể truy cập sheet (HTTP ${response.status}). Hãy publish sheet to web: File > Share > Publish to web > Publish.`);
        }
        throw new Error(`Không thể truy cập sheet (HTTP ${response.status})`);
      }

      const csvData = await response.text()
      const rows = parseCSV(csvData)


      const usableRows = rows
        .filter((row) => {
          const sanPham = getValueByAliases(row, ['SẢN PHẨM', 'SAN PHAM', 'Product type'])
          const isSuncatcher = normalizeHeader(String(sanPham || '').trim()) === normalizeHeader('Suncatcher')
          if (!isSuncatcher) return false

          const stt = getValueByAliases(row, ['STT'])
          const sttValue = String(stt || '').trim()
          const sttNum = Number(sttValue)
          const isValidStt = sttValue !== '' && Number.isInteger(sttNum) && sttNum > 0
          if (!isValidStt) return false

          const linkAnh = getValueByAliases(row, ['LINK ẢNH', 'Link ảnh', 'LINK ANH', 'LINK NGUỒN', 'Link nguồn', 'LINK NGUON', 'Image', 'Image Link', 'IMAGE LINK'])
          const hasLinkAnh = String(linkAnh || '').trim()
          const redesign = getValueByAliases(row, ['REDESIGN', 'Redesign', 'FINAL CONCEPT REDESIGN'])
          const isRedesignEmpty = String(redesign || '').trim() === ''
          return Boolean(hasLinkAnh && isRedesignEmpty)
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

      if (usableRows.length === 0) {
        setError('Không tìm thấy hàng nào có SẢN PHẨM = Suncatcher, LINK ẢNH có dữ liệu và REDESIGN trống.')
      }

      clearInterval(interval)
      setProgress(100)
      setData(usableRows)
      dataRef.current = usableRows
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

  const enqueueLifestyleJob = (job) => {
    const nextRun = lifestyleQueueRef.current.then(job, job)
    lifestyleQueueRef.current = nextRun.catch(() => {})
    return nextRun
  }

  const isRateLimitError = (error) => {
    const message = String(error?.message || '').toLowerCase()
    return message.includes('429') || message.includes('rate limit') || message.includes('too many')
  }

  const generateMockupStepWithFallback = async ({ imageUrl, prompt }) => {
    try {
      return await generateMockupImage({ imageUrl, prompt })
    } catch (error) {
      if (!isRateLimitError(error)) {
        throw error
      }

      // Extra one-shot fallback in case backend retries just exhausted a burst window.
      await sleep(1200)
      return generateMockupImage({ imageUrl, prompt })
    }
  }

  const handleGenerateLifestyle = async (globalIndex) => {
    const redesign = redesignResults[globalIndex]
    if (!redesign?.base64) {
      alert('Vui lòng tạo ✨ Create Master trước')
      return
    }
    if (lifestyleResults[globalIndex]?.loading) {
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
      await enqueueLifestyleJob(async () => {
      const sourceDataUrl = `data:${redesign.mimeType};base64,${redesign.base64}`

      const suncatcherMockup1 = await generateMockupStepWithFallback({
        imageUrl: sourceDataUrl,
        prompt: mockupSuncatcher1,
      })

      setLifestyleResults((prev) => ({
        ...prev,
        [globalIndex]: {
          loading: true,
          base64: suncatcherMockup1.base64,
          mimeType: suncatcherMockup1.mimeType,
          images: [suncatcherMockup1],
          analysis: null,
          mockup: null,
          raw: {
            suncatcherMockup1: suncatcherMockup1.raw,
            suncatcherMockup2: null,
            suncatcherMockup3: null,
          },
          error: null,
        },
      }))

      const suncatcherMockup2 = await generateMockupStepWithFallback({
        imageUrl: `data:${suncatcherMockup1.mimeType};base64,${suncatcherMockup1.base64}`,
        prompt: mockupSuncatcher2,
      })

      setLifestyleResults((prev) => ({
        ...prev,
        [globalIndex]: {
          loading: true,
          base64: suncatcherMockup1.base64,
          mimeType: suncatcherMockup1.mimeType,
          images: [suncatcherMockup1, suncatcherMockup2],
          analysis: null,
          mockup: null,
          raw: {
            suncatcherMockup1: suncatcherMockup1.raw,
            suncatcherMockup2: suncatcherMockup2.raw,
            suncatcherMockup3: null,
          },
          error: null,
        },
      }))

      const suncatcherMockup3 = await generateMockupStepWithFallback({
        imageUrl: `data:${suncatcherMockup2.mimeType};base64,${suncatcherMockup2.base64}`,
        prompt: mockupSuncatcher3,
      })

      const images = [suncatcherMockup1, suncatcherMockup2, suncatcherMockup3]

      setLifestyleResults((prev) => ({
        ...prev,
        [globalIndex]: {
          loading: false,
          base64: suncatcherMockup1.base64,
          mimeType: suncatcherMockup1.mimeType,
          images,
          analyses: [],
          analysis: null,
          mockup: null,
          raw: {
            suncatcherMockup1: suncatcherMockup1.raw,
            suncatcherMockup2: suncatcherMockup2.raw,
            suncatcherMockup3: suncatcherMockup3.raw,
          },
          error: null,
        },
      }))
      })
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
      downloadAsset(lifestyleSrc, `suncatcher-${sanitizedKeyword}-lifestyle-${i + 1}.png`)
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
      let sheetUrl = localStorage.getItem('suncatcherSheetUrl') || localStorage.getItem('ornamentSheetUrl')
      if (!sheetUrl) {
        sheetUrl = await getSheetUrlForPage('suncatcher')
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
      const redesignFile = new File([blob], `suncatcher-redesign-${globalIndex}.png`, { type: 'image/png' })
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
          `suncatcher-lifestyle-${globalIndex}-${i + 1}.png`,
          { type: lifestyleImage.mimeType || 'image/png' }
        )
        lifestyleFiles.push(lifestyleFile)
      }

      // Collect mockup images (section 4) if available
      const mockupFiles = []
      const mockupData = customMockups[globalIndex]
      if (mockupData?.images && Array.isArray(mockupData.images)) {
        for (let i = 0; i < mockupData.images.length; i++) {
          const mockup = mockupData.images[i]
          if (mockup?.dataUrl && String(mockup.dataUrl).startsWith('data:')) {
            const mockupBlob = await fetch(mockup.dataUrl).then((r) => r.blob())
            const mockupFile = new File(
              [mockupBlob],
              `suncatcher-mockup-${globalIndex}-${i + 1}.png`,
              { type: 'image/png' }
            )
            mockupFiles.push(mockupFile)
          }
        }
      }

      const optionalFiles = [...lifestyleFiles, ...mockupFiles]
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
        pageKey: 'suncatcher',
      })
      setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'done' }))
      setData(prevData => prevData.filter((_, idx) => idx !== globalIndex))
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

    let sheetUrl = localStorage.getItem('suncatcherSheetUrl') || localStorage.getItem('ornamentSheetUrl')
    if (!sheetUrl) {
      sheetUrl = await getSheetUrlForPage('suncatcher')
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
    const successfulIndices = []

    for (const globalIndex of validIndices) {
      try {
        const redesign = redesignResults[globalIndex]

        const stt = data[globalIndex]?.stt ?? (globalIndex + 1)
        const row = data[globalIndex]

        const src = `data:${redesign.mimeType};base64,${redesign.base64}`
        const blob = await fetch(src).then((r) => r.blob())
        const redesignFile = new File([blob], `suncatcher-redesign-${globalIndex}.png`, { type: 'image/png' })
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
            `suncatcher-lifestyle-${globalIndex}-${i + 1}.png`,
            { type: lifestyleImage.mimeType || 'image/png' }
          )
          lifestyleFiles.push(lifestyleFile)
        }

        // Collect mockup images (section 4) if available
        const mockupFiles = []
        const mockupData = customMockups[globalIndex]
        if (mockupData?.images && Array.isArray(mockupData.images)) {
          for (let i = 0; i < mockupData.images.length; i++) {
            const mockup = mockupData.images[i]
            if (mockup?.dataUrl && String(mockup.dataUrl).startsWith('data:')) {
              const mockupBlob = await fetch(mockup.dataUrl).then((r) => r.blob())
              const mockupFile = new File(
                [mockupBlob],
                `suncatcher-mockup-${globalIndex}-${i + 1}.png`,
                { type: 'image/png' }
              )
              mockupFiles.push(mockupFile)
            }
          }
        }

        const optionalFiles = [...lifestyleFiles, ...mockupFiles]
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
          pageKey: 'suncatcher',
        })
        successCount += 1
        successfulIndices.push(globalIndex)
        setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'done' }))
      } catch (err) {
        console.error(`Upload error for index ${globalIndex}:`, err)
        errorCount += 1
        setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'error' }))
      }
    }

    setIsUploading(false)
    setData(prevData => prevData.filter((_, idx) => !successfulIndices.includes(idx)))
    alert(`Upload hoàn tất: ${successCount} thành công, ${errorCount} lỗi.`)
    setSelectedItems(new Set())
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-zinc-100/95 p-6 text-zinc-800">
      <PromptEditorModal
        isOpen={showPromptEditor}
        title="Change Prompt - Suncatcher"
        description="Chinh sua prompt dang dung cho Suncatcher page. Save de ap dung ngay cho lan tao tiep theo."
        tabbed
        initialTabKey="suncatcherPrompt"
        fields={[
          {
            key: 'suncatcherPrompt',
            label: 'Suncatcher Prompt',
            tabLabel: 'Design',
            value: suncatcherPrompt,
            oldValue: PROMPT_DEFAULTS.suncatcher,
            rows: 14,
          },
          {
            key: 'mockupSuncatcher1',
            label: 'Mockup Suncatcher 1',
            tabLabel: 'Mockup1',
            value: mockupSuncatcher1,
            oldValue: PROMPT_DEFAULTS.MockupSuncatcher1,
            rows: 8,
          },
          {
            key: 'mockupSuncatcher2',
            label: 'Mockup Suncatcher 2',
            tabLabel: 'Mockup2',
            value: mockupSuncatcher2,
            oldValue: PROMPT_DEFAULTS.MockupSuncatcher2,
            rows: 8,
          },
          {
            key: 'mockupSuncatcher3',
            label: 'Mockup Suncatcher 3',
            tabLabel: 'Mockup3',
            value: mockupSuncatcher3,
            oldValue: PROMPT_DEFAULTS.MockupSuncatcher3,
            rows: 8,
          },
        ]}
        onClose={() => setShowPromptEditor(false)}
        onSave={async (values) => {
          const updates = [
            { key: 'suncatcher', value: String(values.suncatcherPrompt ?? ''), setter: setSuncatcherPrompt },
            { key: 'MockupSuncatcher1', value: String(values.mockupSuncatcher1 ?? ''), setter: setMockupSuncatcher1 },
            { key: 'MockupSuncatcher2', value: String(values.mockupSuncatcher2 ?? ''), setter: setMockupSuncatcher2 },
            { key: 'MockupSuncatcher3', value: String(values.mockupSuncatcher3 ?? ''), setter: setMockupSuncatcher3 },
          ]

          updates.forEach(({ setter, value }) => setter(value))

          try {
            for (const { key, value } of updates) {
              await savePromptToPromptsMoi(key, value)
            }
            const filePath = await getPromptsMoiPath()
            if (filePath) {
              alert(`Da luu prompt vao:\n${filePath}`)
            }
          } catch (error) {
            alert(error?.message || 'Khong the luu prompt vao PromptsMoi.ts')
          }
        }}
        onReset={async () => {
          setSuncatcherPrompt(PROMPT_DEFAULTS.suncatcher)
          setMockupSuncatcher1(PROMPT_DEFAULTS.MockupSuncatcher1)
          setMockupSuncatcher2(PROMPT_DEFAULTS.MockupSuncatcher2)
          setMockupSuncatcher3(PROMPT_DEFAULTS.MockupSuncatcher3)
          PROMPTS.suncatcher = PROMPT_DEFAULTS.suncatcher
          PROMPTS.MockupSuncatcher1 = PROMPT_DEFAULTS.MockupSuncatcher1
          PROMPTS.MockupSuncatcher2 = PROMPT_DEFAULTS.MockupSuncatcher2
          PROMPTS.MockupSuncatcher3 = PROMPT_DEFAULTS.MockupSuncatcher3
          try {
            await removePromptFromPromptsMoi('suncatcher')
            await removePromptFromPromptsMoi('MockupSuncatcher1')
            await removePromptFromPromptsMoi('MockupSuncatcher2')
            await removePromptFromPromptsMoi('MockupSuncatcher3')
          } catch (error) {
            alert(error?.message || 'Khong the reset prompt trong PromptsMoi.ts')
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
      {showMockupPicker ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-5xl rounded-3xl border border-zinc-200 bg-white p-5 shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 pb-4">
              <div>
                <h3 className="text-xl font-semibold text-zinc-900">Chọn mockup</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  Chọn file đã nhớ trước đó hoặc bấm dấu + để thêm mockup mới. Hover vào item cũ sẽ hiện chú thích chọn / show mockup.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePickMockupTemplate}
                  disabled={!isElectronMockupAvailable}
                  className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                  title={isElectronMockupAvailable ? 'Chọn file mockup mới' : 'Tính năng chỉ hoạt động trong Electron'}
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setShowMockupPicker(false)}
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
                >
                  Đóng
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-zinc-600">Mockup đã chọn trước đó</h4>
                  <span className="text-xs text-zinc-500">{mockupTemplateHistory.length} file</span>
                </div>

                <div className="max-h-[460px] space-y-2 overflow-auto pr-1">
                  {mockupTemplateHistory.length ? (
                    mockupTemplateHistory.map((filePath) => {
                      const isActive = filePath === mockupTemplatePath
                      const isPreviewActive = filePath === previewMockupTemplatePath
                      const isTemplatePreviewLoading = filePath === mockupTemplatePreviewLoadingPath
                      return (
                        <div
                          key={filePath}
                          className={`rounded-xl border px-3 py-3 transition ${isPreviewActive
                              ? 'border-amber-400 bg-amber-50'
                              : 'border-zinc-200 bg-white hover:border-amber-300 hover:bg-amber-50/60'
                            }`}
                          title="Chọn / show mockup"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => handleShowMockupTemplate(filePath)}
                              className="min-w-0 flex-1 text-left"
                              title="Show mockup"
                              disabled={isTemplatePreviewLoading}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex h-2.5 w-2.5 rounded-full ${isActive ? 'bg-amber-500' : 'bg-zinc-300'}`} />
                                <span className="truncate text-sm font-semibold text-zinc-900">
                                  {getFileNameFromPath(filePath)}
                                </span>
                                {isTemplatePreviewLoading ? (
                                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                                ) : null}
                              </div>
                              <div className="mt-1 truncate text-xs text-zinc-500">{filePath}</div>
                            </button>

                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                type="button"
                                onClick={() => selectMockupTemplateFromHistory(filePath)}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${isActive
                                    ? 'bg-amber-600 text-white'
                                    : 'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'
                                  }`}
                                title="Chọn mockup"
                                disabled={isTemplatePreviewLoading}
                              >
                                Chọn
                              </button>
                              <button
                                type="button"
                                onClick={() => removeMockupTemplateFromHistory(filePath)}
                                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                                title="Xóa mockup khỏi danh sách đã nhớ"
                              >
                                Xóa
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-500">
                      Chưa có mockup nào được chọn trước đó.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-zinc-600">Show mockup</h4>
                    <p className="mt-1 text-xs text-zinc-500">
                      {previewMockupTemplatePath ? getFileNameFromPath(previewMockupTemplatePath) : 'Chọn một mockup để xem preview.'}
                    </p>
                  </div>
                  <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">
                    {activeMockupPreviewImages.length
                      ? `${activeMockupPreviewImages.length} MOCKUP *`
                      : '0 MOCKUP *'}
                  </div>
                </div>

                <div className="max-h-[460px] overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  {mockupTemplatePreviewLoadingPath && mockupTemplatePreviewLoadingPath === previewMockupTemplatePath ? (
                    <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 text-zinc-500">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                      <span className="text-xs">Đang tải mockup từ PSD...</span>
                    </div>
                  ) : activeMockupPreviewImages.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {activeMockupPreviewImages.map((preview, index) => (
                        <div key={`${previewMockupTemplatePath || mockupTemplatePath}-${index}`} className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                          <div className="border-b border-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-600">
                            {preview?.name || `MOCKUP ${index + 1}.png`}
                          </div>
                          <img
                            src={preview.dataUrl}
                            alt={preview?.name || `mockup-preview-${index + 1}`}
                            className="h-44 w-full cursor-zoom-in rounded-lg object-cover bg-white"
                            loading="lazy"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-zinc-500">
                      Chưa có PNG preview cho mockup này. Hãy render PSD một lần để lưu toàn bộ MOCKUP * vào popup.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
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
          Design Workspace ({filteredData.length} Items)
        </h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search by STT or Keyword..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={openMockupPicker}
            disabled={!isElectronMockupAvailable}
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            title={
              isElectronMockupAvailable
                ? 'Chọn / show mockup đã nhớ trước đó'
                : 'Tính năng PSD chỉ hoạt động trong Electron desktop app'
            }
          >
            Chọn mockup
          </button>
          <button
            onClick={() => setIsListedItemsModalOpen(true)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Listed
          </button>
          <button
            onClick={() => setShowPromptEditor(true)}
            className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
          >
           📝 Prompt
          </button>
          <span className="rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-xs font-medium text-zinc-600">
            B2 sẵn sàng: {selectedReadyCount} đã chọn | Toàn bộ: {totalReadyCount}
          </span>
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
      </div>
      {mockupTemplatePath && (
        <p className="mt-2 text-xs text-amber-700">
          PSD template: {mockupTemplatePath}
        </p>
      )}
      <p className={`mt-2 text-xs ${isElectronMockupAvailable ? 'text-emerald-700' : 'text-red-600'}`}>
        {mockupBridgeStatus}
      </p>
      {!isElectronMockupAvailable && (
        <p className="mt-2 text-xs text-red-600">
          {isElectronRuntime
            ? 'Electron đang mở nhưng preload bridge PSD chưa sẵn sàng. Đóng app và chạy lại npm.cmd run electron:dev.'
            : 'PSD mockup không khả dụng trong web mode. Vui lòng chạy desktop app bằng Electron để chọn file PSD.'}
        </p>
      )}

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
                        {row.keyword || `Suncatcher ${itemNumber}`}
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

                  <div className="grid gap-5 xl:grid-cols-4">
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
                        Focus: {row.keyword || '2D Holographic Acrylic Suncatcher style.'}
                      </p>
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

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                          4. MOCKUP TỰ CHỌN
                        </span>
                        {redesignDataUrl ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleGenerateMockupFromTemplate(
                                globalIndex,
                                redesignDataUrl
                              )
                            }
                            disabled={mockupRenderStatus[globalIndex] === 'loading'}
                            title="Generate mockup từ FINAL CONCEPT REDESIGN"
                            className="text-xs font-medium text-amber-600 hover:text-amber-800 disabled:opacity-40"
                          >
                            {mockupRenderStatus[globalIndex] === 'loading'
                              ? '⏳ Đang render PSD...'
                              : '✨ Generate từ PSD'}
                          </button>
                        ) : null}
                      </div>
                      <div className="flex h-96 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100 overflow-hidden">
                        {mockupRenderStatus[globalIndex] === 'loading' ? (
                          <div className="flex flex-col items-center gap-2 text-zinc-400">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                            <span className="text-xs">Đang render mockup từ PSD...</span>
                          </div>
                        ) : getMockupPreviewImages(globalIndex).length > 0 ? (
                          <div className="h-full w-full overflow-auto p-2">
                            <div className="grid grid-cols-2 gap-2">
                              {getMockupPreviewImages(globalIndex).map((image, imageIndex) => (
                                <img
                                  key={`${globalIndex}-custom-mockup-${imageIndex}`}
                                  src={image.dataUrl}
                                  alt={`custom-mockup-${row.keyword || itemNumber}-${imageIndex + 1}`}
                                  className="h-44 w-full cursor-zoom-in rounded-lg object-cover"
                                  loading="lazy"
                                  onClick={() =>
                                    setEditorState({
                                      kind: 'customMockup',
                                      globalIndex,
                                      src: image.dataUrl,
                                      title: `${row.keyword || `Item ${itemNumber}`} custom mockup ${imageIndex + 1}`,
                                      description:
                                        'Mockup tự chọn để tham khảo nội bộ, có thể từ upload tay hoặc render PSD template.',
                                      previewOptions: getAllMockupImages(globalIndex).map((preview, idx) => ({
                                        id: `custom-mockup-${idx}`,
                                        label: preview?.name || `Mockup ${idx + 1}`,
                                        src: preview.dataUrl,
                                      })),
                                    })
                                  }
                                />
                              ))}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-zinc-400">Chọn ảnh mockup của bạn</span>
                        )}
                      </div>
                      <div className="mb-2 mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-zinc-500">Template riêng:</span>
                        {mockupTemplateHistory.slice(0, 6).map((filePath) => {
                          const isActiveTemplate = filePath === getItemMockupTemplatePath(globalIndex)
                          return (
                            <button
                              key={`${globalIndex}-${filePath}`}
                              type="button"
                              onClick={() => setItemMockupTemplatePath(globalIndex, filePath)}
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${isActiveTemplate
                                  ? 'border-amber-400 bg-amber-50 text-amber-700'
                                  : 'border-zinc-300 bg-white text-zinc-600 hover:border-amber-300 hover:text-amber-700'
                                }`}
                            >
                              {getFileNameFromPath(filePath)}
                            </button>
                          )
                        })}
                        {!mockupTemplateHistory.length ? (
                          <span className="text-[11px] text-zinc-500">Đang dùng template mặc định.</span>
                        ) : null}
                      </div>
                      {getMockupPreviewImages(globalIndex).length > 0 ? (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => {
                              // Clean up: remove from state, ref, and localStorage
                              delete mockupImagesRef.current[globalIndex]
                              setRenderedMockupImagesCount((prev) => {
                                const next = { ...prev }
                                delete next[globalIndex]
                                return next
                              })
                              setCustomMockups((prev) => {
                                const next = { ...prev }
                                delete next[globalIndex]
                                // Force localStorage update immediately
                                writeStoredJson(CUSTOM_MOCKUPS_STORAGE_KEY, next)
                                return next
                              })
                            }}
                            className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                          >
                            Xóa toàn bộ mockup
                          </button>
                        </div>
                      ) : null}
                      {/* <div className="mt-2 flex items-center gap-2">
                        <label className="inline-flex cursor-pointer items-center rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">
                          Upload Mockup
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => {
                              const file = event.target.files?.[0]
                              handleCustomMockupUpload(globalIndex, file)
                              event.target.value = ''
                            }}
                          />
                        </label>
                        {customMockups[globalIndex]?.dataUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              setCustomMockups((prev) => {
                                const next = { ...prev }
                                delete next[globalIndex]
                                return next
                              })
                            }
                            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                          >
                            Remove
                          </button>
                        )}
                      </div> */}

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
        sheetUrl={localStorage.getItem('suncatcherSheetUrl') || localStorage.getItem('ornamentSheetUrl') || ''}
      />
    </section>
  )
}
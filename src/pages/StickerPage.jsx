import { useEffect, useMemo, useRef, useState, startTransition } from 'react'
import { getSheetUrlForPage } from '../services/sheetConfigService'
import { updateRecordInSheet } from '../services/googleDriveService'
import { removeBackgroundSmart, REMOVAL_MODES } from '../services/backgroundRemovalService'
import { analyzeStickerImage, generateLifestyleImage, generateMarketplaceListingFromRedesign } from '../services/geminiService'
import { getCurrentUser, isAmazonRole, isEtsyRole } from '../services/authService'
import {
	getDefaultMockupPsdFile,
	pickMockupPsdFile,
	renderMockupTemplatePreview,
	renderMockupsFromPsd,
	renderMockupsFromPsdProgressive,
} from '../services/mockupService'
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
export default function StickerPage() {
	const PSD_RENDERER = 'ag-psd'
	const PREFER_PHOTOSHOP_ENGINE = false
	const MOCKUP_TEMPLATE_STORAGE_KEY = 'stickerMockupTemplatePath'
	const MOCKUP_TEMPLATE_HISTORY_KEY = 'stickerMockupTemplateHistory'
	const MOCKUP_TEMPLATE_PREVIEWS_KEY = 'stickerMockupTemplatePreviews'
	const CUSTOM_MOCKUPS_STORAGE_KEY = 'stickerCustomMockups'
	const [isLoading, setIsLoading] = useState(false)
	const [progress, setProgress] = useState(0)
	const [error, setError] = useState('')
	const [sheetUrl, setSheetUrl] = useState(() => localStorage.getItem('stickerSheetUrl') || '')
	const [autoRefreshCsvUrl, setAutoRefreshCsvUrl] = useState('')
	const [newRowsNotice, setNewRowsNotice] = useState(0)
	const [data, setData] = useState([])
	const dataRef = useRef([])
	const [pageSize, setPageSize] = useState(10)
	const [currentPage, setCurrentPage] = useState(1)
	const [masterResults, setMasterResults] = useState({})
	const [lifestyleResults, setLifestyleResults] = useState({})
	const [customMockups, setCustomMockups] = useState({})
	const [renderedMockupImagesCount, setRenderedMockupImagesCount] = useState({})
	const [mockupTemplatePath, setMockupTemplatePath] = useState('')
	const [mockupTemplateHistory, setMockupTemplateHistory] = useState([])
	const [mockupTemplatePreviews, setMockupTemplatePreviews] = useState({})
	const [showMockupPicker, setShowMockupPicker] = useState(false)
	const [previewMockupTemplatePath, setPreviewMockupTemplatePath] = useState('')
	const [mockupTemplatePreviewLoadingPath, setMockupTemplatePreviewLoadingPath] = useState('')
	const [mockupRenderStatus, setMockupRenderStatus] = useState({})
	const [isElectronMockupAvailable, setIsElectronMockupAvailable] = useState(false)
	const [isElectronRuntime, setIsElectronRuntime] = useState(false)
	const [uploadStatus, setUploadStatus] = useState({})
	const [selectedMasterItems, setSelectedMasterItems] = useState({})
	const [selectedUpdateItems, setSelectedUpdateItems] = useState({})
	const [isBatchUploading, setIsBatchUploading] = useState(false)
	const [isBatchCreating, setIsBatchCreating] = useState(false)
	const [editorState, setEditorState] = useState(null)
	const [editorPreviewHistory, setEditorPreviewHistory] = useState({})
	const [showPromptEditor, setShowPromptEditor] = useState(false)
	const [isListedItemsModalOpen, setIsListedItemsModalOpen] = useState(false)
	const [stickerPrompt, setStickerPrompt] = useState(() => PROMPTS.sticker)
	const [searchTerm, setSearchTerm] = useState('')
	const persistCustomMockupsTimerRef = useRef(null)
	const mockupImagesRef = useRef({})

	const mockupBridgeStatus = isElectronRuntime
		? isElectronMockupAvailable
			? 'Electron bridge: ready'
			: 'Electron bridge: missing'
		: 'Web mode (no Electron bridge)'

	const filteredData = data.filter(item => {
		const term = searchTerm.toLowerCase()
		return item.keyword.toLowerCase().includes(term) || item.stt.toString().includes(term)
	})

	const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize))
	const paginatedData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize)

	const getTemplatePreviewImages = (templatePath) => {
		const normalizedPath = String(templatePath || '').trim()
		if (!normalizedPath) return []

		const cachedPreviews = mockupTemplatePreviews[normalizedPath]
		if (Array.isArray(cachedPreviews) && cachedPreviews.length) {
			return cachedPreviews
		}

		return []
	}

	const activeMockupPreviewImages = getTemplatePreviewImages(previewMockupTemplatePath)

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

	const toLightweightCustomMockups = (value) => {
		if (!value || typeof value !== 'object') return {}

		const entries = Object.entries(value).map(([key, item]) => {
			if (!item || typeof item !== 'object') {
				return [key, {}]
			}

			return [
				key,
				{
					source: item.source || '',
					name: item.name || '',
					templatePath: item.templatePath || '',
					updatedAt: Date.now(),
				},
			]
		})

		return Object.fromEntries(entries)
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
			alert(`Đã đổi mockup mặc định sang file mới.\n\nCũ: ${previousTemplatePath}\nMới: ${normalizedPath}`)
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

	// Sync dataRef để hook polling luôn đọc được data mới nhất mà không cần closure
	useEffect(() => { dataRef.current = data }, [data])

	// Parse CSV text → pending rows (cùng logic với handleGetData)
	// Không cần useCallback vì hook tự sync qua ref mỗi render
	const parseRowsForAutoRefresh = (csvText) => {
		const rows = parseCSV(csvText)
		const isInputKey = (key) => {
			const norm = normalizeHeader(key)
			return norm.includes('stt') || norm.includes('keyword') || norm.includes('sanpham')
				|| norm.includes('producttype') || norm.includes('description')
				|| norm.includes('linkanh') || norm.includes('linklink')
		}
		return rows
			.filter((row) => {
				const kw = getValueByAliases(row, ['KEYWORD', 'keyword', 'Keyword'])
				if (!String(kw || '').trim()) return false

				const stt = getValueByAliases(row, ['STT'])
			const sttValue = String(stt || '').trim()
			const sttNum = Number(sttValue)
			const isValidStt = sttValue !== '' && Number.isInteger(sttNum) && sttNum > 0

				const linkAnh = getValueByAliases(row, ['LINK ẢNH', 'Link ảnh', 'LINK ANH', 'LINK NGUỒN', 'Link nguồn', 'LINK NGUON', 'Image', 'Image Link', 'IMAGE LINK', 'LINK ẢNH'])
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
				keyword: getValueByAliases(row, ['KEYWORD', 'keyword', 'Keyword']),
				sanPham: getValueByAliases(row, ['SẢN PHẨM', 'SAN PHAM', 'Product type']),
				description: getValueByAliases(row, ['DESCRIPTION', 'Description', 'PRODUCT DESCRIPTION', 'Product Description']),
				imageLink: getValueByAliases(row, ['LINK ẢNH', 'Link ảnh', 'LINK ANH']),
				redesign: getValueByAliases(row, ['REDESIGN', 'Redesign']),
				status: getValueByAliases(row, ['Status', 'TRẠNG THÁI', 'TRANG THAI']),
			}))
	}

	// Tự động polling 30s background — chỉ append dòng mới, không reset state
	useSheetAutoRefresh({
		csvUrl: autoRefreshCsvUrl,
		enabled: Boolean(autoRefreshCsvUrl),
		isBusy: isLoading || isBatchUploading || isBatchCreating
			|| Object.values(masterResults).some((r) => r?.loading),
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
		const savedUrl = localStorage.getItem('stickerSheetUrl') || ''
		if (savedUrl) {
			handleGetData()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	useEffect(() => {
		const handleGetDataEvent = () => {
			handleGetData()
		}

		window.addEventListener('stickerGetData', handleGetDataEvent)
		return () => window.removeEventListener('stickerGetData', handleGetDataEvent)
		// eslint-disable-next-line react-hooks/exhaustive-deps
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
		const savedCustomMockups = readStoredJson(CUSTOM_MOCKUPS_STORAGE_KEY, {})
		if (savedCustomMockups && typeof savedCustomMockups === 'object') {
			setCustomMockups(savedCustomMockups)
		}

		// Clear legacy cache because large data URLs can block the UI on weak machines.
		localStorage.removeItem(MOCKUP_TEMPLATE_PREVIEWS_KEY)

		if (savedMockupTemplatePath) {
			setMockupTemplatePath(savedMockupTemplatePath)
			setPreviewMockupTemplatePath(savedMockupTemplatePath)
		}

		if (Array.isArray(savedMockupTemplateHistory) && savedMockupTemplateHistory.length) {
			setMockupTemplateHistory(savedMockupTemplateHistory)
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
			writeStoredJson(CUSTOM_MOCKUPS_STORAGE_KEY, toLightweightCustomMockups(customMockups))
		}, 400)

		return () => {
			if (persistCustomMockupsTimerRef.current) {
				clearTimeout(persistCustomMockupsTimerRef.current)
			}
		}
	}, [customMockups])

	// Progressive rendering: render images one by one to avoid freezing
	useEffect(() => {
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

	const selectedMasterCount = useMemo(
		() => Object.values(selectedMasterItems).filter(Boolean).length,
		[selectedMasterItems]
	)

	const selectedUpdateReadyCount = useMemo(() => {
		return Object.keys(selectedUpdateItems).filter((index) => {
			if (!selectedUpdateItems[index]) return false
			return !!masterResults[Number(index)]?.base64
		}).length
	}, [selectedUpdateItems, masterResults])

	const totalReadyCount = useMemo(() => {
		return data.reduce((count, _, index) => {
			return masterResults[index]?.base64 ? count + 1 : count
		}, 0)
	}, [data, masterResults])

	const currentPageSelectedMasterCount = useMemo(() => {
		return paginatedData.filter((_, idx) => {
			const globalIndex = (currentPage - 1) * pageSize + idx
			return !!selectedMasterItems[globalIndex]
		}).length
	}, [paginatedData, currentPage, pageSize, selectedMasterItems])

	const currentPageSelectedUpdateCount = useMemo(() => {
		return paginatedData.filter((_, idx) => {
			const globalIndex = (currentPage - 1) * pageSize + idx
			return !!selectedUpdateItems[globalIndex]
		}).length
	}, [paginatedData, currentPage, pageSize, selectedUpdateItems])

	const isCurrentPageFullySelectedForMaster =
		paginatedData.length > 0 && currentPageSelectedMasterCount === paginatedData.length
	const isCurrentPageFullySelectedForUpdate =
		paginatedData.length > 0 && currentPageSelectedUpdateCount === paginatedData.length

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

	const extractSheetInfo = (url) => {
		const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/)
		const gidMatch = url.match(/[?#&]gid=(\d+)/)

		return {
			id: idMatch ? idMatch[1] : null,
			gid: gidMatch ? gidMatch[1] : '0',
		}
	}

	const isValidImageUrl = (url) =>
		/^data:image\//i.test(url) || /^https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url)

	const dataUrlToFile = async (dataUrl, fileName, fallbackMimeType = 'image/png') => {
		const response = await fetch(dataUrl)
		const blob = await response.blob()
		return new File([blob], fileName, { type: blob.type || fallbackMimeType })
	}

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

	const runStickerBackgroundRemoval = async (globalIndex, row, created, options = {}) => {
		const { throwOnError = false } = options

		try {
			const transparentDataUrl = await removeBackgroundSmart(
				created.base64,
				created.mimeType || 'image/png',
				REMOVAL_MODES.PIXEL_THRESHOLD
			)
			const transparentBase64 = String(transparentDataUrl).split(',')[1] || ''
			const transparentMimeMatch = String(transparentDataUrl).match(/^data:(.*?);base64,/i)
			const transparentMimeType = transparentMimeMatch?.[1] || 'image/png'

			if (!transparentBase64) {
				throw new Error('Không thể tách nền cho ảnh sticker master')
			}

			setMasterResults((prev) => ({
				...prev,
				[globalIndex]: {
					loading: false,
					base64: transparentBase64,
					mimeType: transparentMimeType,
					error: null,
				},
			}))

			setSelectedMasterItems((prev) => {
				if (!prev[globalIndex]) return prev
				const next = { ...prev }
				next[globalIndex] = false
				return next
			})

			return true
		} catch (err) {
			setMasterResults((prev) => ({
				...prev,
				[globalIndex]: {
					loading: false,
					base64: null,
					mimeType: null,
					error: err.message || 'Không tạo được Sticker Master',
				},
			}))

			if (throwOnError) {
				throw err
			}

			return false
		}
	}

	const createStickerMaster = async (globalIndex, row, options = {}) => {
		const { throwOnError = false } = options
		if (!row.imageLink) {
			setMasterResults((prev) => ({
				...prev,
				[globalIndex]: { loading: false, base64: null, mimeType: null, error: 'Không có LINK ẢNH' },
			}))
			if (throwOnError) {
				throw new Error('Không có LINK ẢNH')
			}
			return false
		}

		setMasterResults((prev) => ({
			...prev,
			[globalIndex]: { loading: true, base64: null, mimeType: null, error: null },
		}))

		try {
			const created = await analyzeStickerImage({
				imageUrl: row.imageLink,
				prompt: stickerPrompt,
			})

			return await runStickerBackgroundRemoval(globalIndex, row, created, { throwOnError })
		} catch (err) {
			setMasterResults((prev) => ({
				...prev,
				[globalIndex]: {
					loading: false,
					base64: null,
					mimeType: null,
					error: err.message || 'Không tạo được Sticker Master',
				},
			}))
			if (throwOnError) {
				throw err
			}
			return false
		}
	}

	const createStickerMasterWithRetry = async (globalIndex, row, maxAttempts = 2) => {
		let lastError = null

		for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
			try {
				const result = await createStickerMaster(globalIndex, row, { throwOnError: true })
				return result
			} catch (error) {
				lastError = error
				if (attempt < maxAttempts) {
					console.warn(
						`[StickerPage] Retry ${attempt}/${maxAttempts} STT ${row?.stt || globalIndex + 1}: ${error?.message || 'Lỗi không xác định'}`
					)
				}
			}
		}

		console.warn(
			`[StickerPage] Skip STT ${row?.stt || globalIndex + 1} after ${maxAttempts} attempts: ${lastError?.message || 'Lỗi không xác định'}`
		)
		return false
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
			delete mockupImagesRef.current[editorState.globalIndex]
			setRenderedMockupImagesCount((prev) => {
				const next = { ...prev }
				delete next[editorState.globalIndex]
				return next
			})
			setData((prev) =>
				prev.map((row, index) =>
					index === editorState.globalIndex ? { ...row, imageLink: dataUrl } : row
				)
			)
			setMasterResults((prev) => {
				const next = { ...prev }
				delete next[editorState.globalIndex]
				return next
			})
			setUploadStatus((prev) => {
				const next = { ...prev }
				delete next[editorState.globalIndex]
				return next
			})
			setLifestyleResults((prev) => {
				const next = { ...prev }
				delete next[editorState.globalIndex]
				return next
			})
			setCustomMockups((prev) => {
				const next = { ...prev }
				delete next[editorState.globalIndex]
				return next
			})
			clearEditorPreviewHistoryForItem(editorState.globalIndex)
			return
		}

		if (editorState.kind === 'master') {
			setMasterResults((prev) => ({
				...prev,
				[editorState.globalIndex]: {
					...(prev[editorState.globalIndex] || {}),
					loading: false,
					error: null,
					base64: payload.base64,
					mimeType: payload.mimeType,
				},
			}))
			setUploadStatus((prev) => {
				const next = { ...prev }
				delete next[editorState.globalIndex]
				return next
			})
			setLifestyleResults((prev) => {
				const next = { ...prev }
				delete next[editorState.globalIndex]
				return next
			})
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
		}
	}

	const getMockupPreviewImages = (globalIndex) => {
		// Progressive rendering: only show images that have been rendered
		const allImages = mockupImagesRef.current[globalIndex] || []
		const renderedCount = renderedMockupImagesCount[globalIndex] || 0
		const normalizeImage = (image, index = 0) => {
			const dataUrl = String(image?.dataUrl || image?.src || '')
			if (!dataUrl.startsWith('data:image/')) return null
			return {
				name: image?.name || `mockup-${globalIndex + 1}-${index + 1}.png`,
				dataUrl,
			}
		}

		// Show rendered images from ref
		if (Array.isArray(allImages) && allImages.length > 0) {
			const validImages = allImages
				.map((image, index) => normalizeImage(image, index))
				.filter(Boolean)
			if (validImages.length > 0) {
				const limit = renderedCount > 0 ? renderedCount : validImages.length
				return validImages.slice(0, limit)
			}
		}

		// Fallback if ref is empty
		const item = customMockups[globalIndex]
		if (Array.isArray(item?.images) && item.images.length) {
			return item.images
				.map((image, index) => normalizeImage(image, index))
				.filter(Boolean)
		}
		if (item?.dataUrl) {
			const single = normalizeImage({ name: item?.name, dataUrl: item.dataUrl }, 0)
			return single ? [single] : []
		}
		return []
	}

	const getAllMockupImages = (globalIndex) => {
		const allImages = mockupImagesRef.current[globalIndex] || []
		if (Array.isArray(allImages) && allImages.length) {
			return allImages
		}

		const item = customMockups[globalIndex]
		if (Array.isArray(item?.images) && item.images.length) {
			return item.images
				.map((image, index) => {
					const dataUrl = String(image?.dataUrl || image?.src || '')
					if (!dataUrl.startsWith('data:image/')) return null
					return {
						name: image?.name || `mockup-${globalIndex + 1}-${index + 1}.png`,
						dataUrl,
					}
				})
				.filter(Boolean)
		}

		if (item?.dataUrl) {
			return [
				{
					name: item?.name || `mockup-${globalIndex + 1}.png`,
					dataUrl: String(item.dataUrl),
				},
			]
		}

		return []
	}

	const clearLifestylePreviewImages = (globalIndex) => {
		setLifestyleResults((prev) => {
			const current = prev[globalIndex] || {}
			const currentImages = getLifestylePreviewImages(current)
			if (!currentImages.length) {
				return prev
			}

			return {
				...prev,
				[globalIndex]: {
					...current,
					loading: false,
					base64: null,
					mimeType: null,
					images: [],
					analysis: null,
					mockup: null,
					raw: null,
					error: null,
				},
			}
		})
	}

	const clearCustomMockupPreviewImages = (globalIndex) => {
		// Clean up: remove from state, ref, renderedCount, and localStorage
		delete mockupImagesRef.current[globalIndex]
		setRenderedMockupImagesCount((prev) => {
			const next = { ...prev }
			delete next[globalIndex]
			return next
		})
		setCustomMockups((prev) => {
			const current = prev[globalIndex]
			if (!current) {
				return prev
			}
			const next = { ...prev }
			delete next[globalIndex]
			// Force localStorage update immediately
			writeStoredJson(CUSTOM_MOCKUPS_STORAGE_KEY, next)
			return next
		})
	}

	const getLifestylePreviewImages = (lifestyle) =>
		Array.isArray(lifestyle?.images) && lifestyle.images.length
			? lifestyle.images
			: lifestyle?.base64
				? [{ base64: lifestyle.base64, mimeType: lifestyle.mimeType || 'image/png' }]
				: []

	const handleGenerateLifestyle = async (globalIndex) => {
		const master = masterResults[globalIndex]
		if (!master?.base64) {
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
			const imageUrl = `data:${master.mimeType || 'image/png'};base64,${master.base64}`
			const keyword = data[globalIndex]?.keyword || ''
			const result = await generateLifestyleImage({
				file: null,
				imageUrl,
				keyword,
				analysisCount: 3,
				maxGenerateCount: 3,
				onImageGenerated: ({ images }) => {
					setLifestyleResults((prev) => ({
						...prev,
						[globalIndex]: {
							...(prev[globalIndex] || {}),
							loading: true,
							images,
							base64: images[0]?.base64 || null,
							mimeType: images[0]?.mimeType || 'image/png',
							error: null,
						},
					}))
				},
			})

			setLifestyleResults((prev) => ({
				...prev,
				[globalIndex]: {
					loading: false,
					base64: result.base64,
					mimeType: result.mimeType,
					images: Array.isArray(result.images) ? result.images : [],
					analyses: Array.isArray(result.analyses) ? result.analyses : [],
					analysis: result.analysis || null,
					mockup: result.mockup || null,
					raw: result.raw || null,
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
			downloadAsset(lifestyleSrc, `sticker-${sanitizedKeyword}-lifestyle-${i + 1}.png`)
			await sleep(150)
		}
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

	const handleGenerateMockupFromTemplate = async (globalIndex, designDataUrl) => {
		if (!designDataUrl) {
			alert('Vui lòng tạo CREATE MASTER trước')
			return
		}

		const effectiveTemplatePath = String(mockupTemplatePath || '').trim()
		if (!effectiveTemplatePath) {
			alert('Vui lòng chọn file MOCKUP.psd trước')
			return
		}

		setMockupRenderStatus((prev) => ({ ...prev, [globalIndex]: 'loading' }))

		try {
			const streamedImages = []
			let lastUiUpdateAt = 0
			const result = await renderMockupsFromPsdProgressive({
				psdPath: effectiveTemplatePath,
				designDataUrl,
				renderer: PSD_RENDERER,
				preferPhotoshop: PREFER_PHOTOSHOP_ENGINE,
				onOutput: (output, progress = {}) => {
					const normalizedDataUrl = String(output?.dataUrl || output?.src || '')
					if (!normalizedDataUrl.startsWith('data:image/')) return

					streamedImages.push({
						name: output?.name || `MOCKUP ${streamedImages.length + 1}.png`,
						dataUrl: normalizedDataUrl,
					})

					if (!mockupImagesRef.current) {
						mockupImagesRef.current = {}
					}
					mockupImagesRef.current[globalIndex] = streamedImages

					if (streamedImages.length === 1) {
						startTransition(() => {
							setCustomMockups((prev) => ({
								...prev,
								[globalIndex]: {
									...(prev[globalIndex] || {}),
									source: 'psd',
									name: streamedImages[0]?.name || `mockup-${globalIndex + 1}.png`,
									dataUrl: streamedImages[0]?.dataUrl || '',
									imageCount: Number(progress?.total || 1),
								},
							}))
						})
					}

					const now = Date.now()
					const shouldUpdateUi =
						streamedImages.length <= 2
						|| streamedImages.length === Number(progress?.total || 0)
						|| now - lastUiUpdateAt >= 150

					if (shouldUpdateUi) {
						lastUiUpdateAt = now
						startTransition(() => {
							setRenderedMockupImagesCount((prev) => ({
								...prev,
								[globalIndex]: streamedImages.length,
							}))
						})
					}
				},
			})

			if (result?.warning) {
				console.warn(result.warning)
			}

			const images = streamedImages.length
				? streamedImages
				: Array.isArray(result?.outputs)
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
				// Store all images in ref for deferred loading (avoid bloating state)
				if (!mockupImagesRef.current) {
					mockupImagesRef.current = {}
				}
				mockupImagesRef.current[globalIndex] = images

				// Update state with only the first image + metadata
				setCustomMockups((prev) => ({
					...prev,
					[globalIndex]: {
						...(prev[globalIndex] || {}),
						source: 'psd',
						name: images[0]?.name || `mockup-${globalIndex + 1}.png`,
						dataUrl: images[0]?.dataUrl || '',
						imageCount: images.length,
					},
				}))

				// Start progressive rendering: show first image immediately
				setRenderedMockupImagesCount((prev) => ({
					...prev,
					[globalIndex]: images.length,
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

		const cachedPreviews = mockupTemplatePreviews[normalizedPath]
		if (Array.isArray(cachedPreviews) && cachedPreviews.length) {
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

		// Only store the first preview to avoid state bloat
		if (previewImages.length > 0) {
			setMockupTemplatePreviews((prev) => {
				const next = {
					...prev,
					[normalizedPath]: [previewImages[0]],
				}
				return next
			})
		}

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

		const nextMockupImagesRef = { ...mockupImagesRef.current }
		delete nextMockupImagesRef[normalizedPath]
		mockupImagesRef.current = nextMockupImagesRef

		setMockupTemplateHistory(nextHistory)
		setMockupTemplatePreviews(nextPreviews)
		writeStoredJson(MOCKUP_TEMPLATE_HISTORY_KEY, nextHistory)

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

	const handleGetData = async () => {
		let interval

		try {
			let effectiveSheetUrl = String(sheetUrl || '').trim()

			if (!effectiveSheetUrl) {
				effectiveSheetUrl = localStorage.getItem('stickerSheetUrl') || ''
			}

			if (!effectiveSheetUrl) {
				effectiveSheetUrl = await getSheetUrlForPage('sticker')
			}

			if (effectiveSheetUrl) {
				setSheetUrl(effectiveSheetUrl)
				localStorage.setItem('stickerSheetUrl', effectiveSheetUrl)
			}

			const { id: sheetId, gid } = extractSheetInfo(effectiveSheetUrl)

			if (!sheetId) {
				setError('Link sheet từ config không hợp lệ')
				return
			}

			setIsLoading(true)
			setProgress(0)
			setError('')
			setData([])
			setCurrentPage(1)
			setMasterResults({})
			setLifestyleResults({})
			setUploadStatus({})
			setSelectedMasterItems({})
			setSelectedUpdateItems({})
			setEditorPreviewHistory({})

			interval = setInterval(() => {
				setProgress((prev) => Math.min(prev + 10, 90))
			}, 180)

			const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
			const response = await fetch(csvUrl)

			if (!response.ok) {
				if (response.status === 403) {
					throw new Error(`Không thể truy cập sheet (HTTP ${response.status}). Hãy publish sheet to web: File > Share > Publish to web > Publish.`)
				}
				throw new Error(`Không thể truy cập sheet (HTTP ${response.status})`)
			}

			const csvData = await response.text()
			const rows = parseCSV(csvData)

			// Chỉ giữ row có LINK ẢNH và REDESIGN trống
			const usableRows = rows
				.filter((row) => {
					const linkAnh = getValueByAliases(row, ['LINK ẢNH', 'Link ảnh', 'LINK ANH', 'LINK NGUỒN', 'Link nguồn', 'LINK NGUON', 'Image', 'Image Link', 'IMAGE LINK'])
					const hasLinkAnh = String(linkAnh || '').trim()
					const redesign = getValueByAliases(row, ['REDESIGN', 'Redesign', 'FINAL CONCEPT REDESIGN'])
					const isRedesignEmpty = String(redesign || '').trim() === ''
					const stt = getValueByAliases(row, ['STT'])
					const hasStt = String(stt || '').trim() !== ''
					const sttNum = parseInt(String(stt || '').trim())
					const isValidStt = !isNaN(sttNum) && sttNum > 0
					return Boolean(hasLinkAnh && isRedesignEmpty && hasStt && isValidStt)
				})
				.map((row) => ({
					stt: getValueByAliases(row, ['STT']),
					keyword: getValueByAliases(row, ['KEYWORD', 'keyword', 'Keyword']),
					sanPham: getValueByAliases(row, ['SẢN PHẨM', 'SAN PHAM', 'Product type']),
					description: getValueByAliases(row, ['DESCRIPTION', 'Description', 'PRODUCT DESCRIPTION', 'Product Description']),
					imageLink: getValueByAliases(row, ['LINK ẢNH', 'Link ảnh', 'LINK ANH']),
					redesign: getValueByAliases(row, ['REDESIGN', 'Redesign']),
					status: getValueByAliases(row, ['Status', 'TRẠNG THÁI', 'TRANG THAI']),
				}))

			if (usableRows.length === 0) {
				setError('Không tìm thấy hàng nào có LINK ẢNH, REDESIGN trống và có STT.')
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

	const resolveStickerSheetTarget = async () => {
		let currentSheetUrl = String(sheetUrl || '').trim()

		if (!currentSheetUrl) {
			currentSheetUrl = localStorage.getItem('stickerSheetUrl') || ''
		}

		if (!currentSheetUrl) {
			currentSheetUrl = await getSheetUrlForPage('sticker')
		}

		if (currentSheetUrl) {
			setSheetUrl(currentSheetUrl)
			localStorage.setItem('stickerSheetUrl', currentSheetUrl)
		}

		const { id: sheetId, gid } = extractSheetInfo(currentSheetUrl)
		if (!sheetId) {
			throw new Error('Sheet URL không hợp lệ')
		}

		return { sheetId, gid }
	}

	const uploadMasterRecord = async (globalIndex, row, target) => {
		const result = masterResults[globalIndex]
		if (!result?.base64) {
			throw new Error('Chưa có ảnh master để update vào sheet')
		}

		const generateMarketplaceMetadataIfNeeded = async (masterResult, rowData) => {
			const user = getCurrentUser()
			const isEtsy = isEtsyRole(user)
			const isAmazon = isAmazonRole(user)

			if (!isEtsy && !isAmazon) {
				return null
			}

			return generateMarketplaceListingFromRedesign({
				marketplace: isAmazon ? 'amazon' : 'etsy',
				base64: masterResult?.base64,
				mimeType: masterResult?.mimeType || 'image/png',
				prompt: isAmazon ? PROMPTS.AmazonTitle : PROMPTS.EtsyTitle,
				keyword: rowData?.keyword || '',
				productType: rowData?.sanPham || 'Sticker',
			})
		}

		const stt = row?.stt ?? globalIndex + 1
		const outputDataUrl = `data:${result.mimeType || 'image/png'};base64,${result.base64}`
		const masterFile = await dataUrlToFile(
			outputDataUrl,
			`sticker-master-${stt}.png`,
			result.mimeType || 'image/png'
		)
		const lifestyleFiles = []
		const lifestylePreviewImages = getLifestylePreviewImages(lifestyleResults[globalIndex])
		for (let i = 0; i < lifestylePreviewImages.length; i += 1) {
			const lifestyleImage = lifestylePreviewImages[i]
			if (!lifestyleImage?.base64) continue
			const lifestyleSrc = `data:${lifestyleImage.mimeType || 'image/png'};base64,${lifestyleImage.base64}`
			const lifestyleFile = await dataUrlToFile(
				lifestyleSrc,
				`sticker-lifestyle-${stt}-${i + 1}.png`,
				lifestyleImage.mimeType || 'image/png'
			)
			lifestyleFiles.push(lifestyleFile)
		}
		const mockupFiles = []
		const mockupImages = getAllMockupImages(globalIndex)
		for (let i = 0; i < mockupImages.length; i += 1) {
			const mockupImage = mockupImages[i]
			if (!mockupImage?.dataUrl || !String(mockupImage.dataUrl).startsWith('data:')) {
				continue
			}

			const mockupFile = await dataUrlToFile(
				mockupImage.dataUrl,
				`sticker-mockup-${stt}-${i + 1}.png`,
				'image/png'
			)
			mockupFiles.push(mockupFile)
		}
		const marketplaceMetadata = await generateMarketplaceMetadataIfNeeded(result, row)


		await updateRecordInSheet(
			target.sheetId,
			stt,
			target.gid,
			[masterFile, ...lifestyleFiles, ...mockupFiles],
			'sticker',
			{
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
			}
		)
	}

	const toggleSelectMasterItem = (globalIndex) => {
		setSelectedMasterItems((prev) => ({
			...prev,
			[globalIndex]: !prev[globalIndex],
		}))
	}

	const toggleSelectUpdateItem = (globalIndex) => {
		setSelectedUpdateItems((prev) => ({
			...prev,
			[globalIndex]: !prev[globalIndex],
		}))
	}

	const toggleSelectCurrentPageForMaster = () => {
		setSelectedMasterItems((prev) => {
			const next = { ...prev }
			paginatedData.forEach((_, idx) => {
				const globalIndex = (currentPage - 1) * pageSize + idx
				next[globalIndex] = !isCurrentPageFullySelectedForMaster
			})
			return next
		})
	}

	const toggleSelectCurrentPageForUpdate = () => {
		setSelectedUpdateItems((prev) => {
			const next = { ...prev }
			paginatedData.forEach((_, idx) => {
				const globalIndex = (currentPage - 1) * pageSize + idx
				next[globalIndex] = !isCurrentPageFullySelectedForUpdate
			})
			return next
		})
	}

	const clearMasterSelection = () => {
		setSelectedMasterItems({})
	}

	const clearUpdateSelection = () => {
		setSelectedUpdateItems({})
	}

	const handleUploadSingle = async (globalIndex, row) => {
		const result = masterResults[globalIndex]
		if (!result?.base64) {
			alert('Chưa có ảnh master để update vào sheet')
			return
		}

		setUploadStatus((prev) => ({
			...prev,
			[globalIndex]: 'uploading',
		}))

		try {
			const target = await resolveStickerSheetTarget()
			await uploadMasterRecord(globalIndex, row, target)


			setUploadStatus((prev) => ({
				...prev,
				[globalIndex]: 'done',
			}))
		} catch (err) {

			setUploadStatus((prev) => ({
				...prev,
				[globalIndex]: 'error',
			}))
			alert(`Update sheet lỗi: ${err.message || 'Không thể update ảnh vào sheet'}`)
		}
	}

	const handleUploadSelected = async () => {
		const selectedIndices = Object.keys(selectedUpdateItems)
			.filter((index) => selectedUpdateItems[index])
			.map((index) => Number(index))
		const candidateIndices = selectedIndices.length
			? selectedIndices
			: data.map((_, index) => index)

		const validIndices = candidateIndices.filter((index) => masterResults[index]?.base64)
		if (!validIndices.length) {
			alert('Chưa có item nào có ảnh bước 2 (Create Master) để update')
			return
		}



		setIsBatchUploading(true)
		try {
			const target = await resolveStickerSheetTarget()
			let successCount = 0
			let failedCount = 0
			const failedDetails = []
			let successfulIndices = []

			for (const index of validIndices) {
				const row = data[index]
				if (!row) {
					failedCount += 1
					failedDetails.push(`Item ${index + 1}: Không tìm thấy dữ liệu dòng`)
					setUploadStatus((prev) => ({
						...prev,
						[index]: 'error',
					}))
					continue
				}

				setUploadStatus((prev) => ({
					...prev,
					[index]: 'uploading',
				}))

				try {
					await uploadMasterRecord(index, row, target)
					successCount += 1
					successfulIndices.push(index)

					setUploadStatus((prev) => ({
						...prev,
						[index]: 'done',
					}))
				} catch (itemError) {
					failedCount += 1

					failedDetails.push(
						`STT ${row?.stt || index + 1}: ${itemError?.message || 'Lỗi không xác định'}`
					)
					setUploadStatus((prev) => ({
						...prev,
						[index]: 'error',
					}))
				}
			}



			if (successfulIndices.length > 0) {
				setData(prevData => prevData.filter((_, idx) => !successfulIndices.includes(idx)))
				setSelectedUpdateItems(prev => {
					const next = { ...prev }
					successfulIndices.forEach(idx => delete next[idx])
					return next
				})
				setSelectedMasterItems(prev => {
					const next = { ...prev }
					successfulIndices.forEach(idx => delete next[idx])
					return next
				})
			}

			if (failedCount > 0) {
				alert(
					`Update sheet xong: ${successCount} thành công, ${failedCount} lỗi\n\n` +
					`Chi tiết lỗi:\n- ${failedDetails.join('\n- ')}`
				)
			} else {
				alert(`Update sheet xong: ${successCount} thành công, ${failedCount} lỗi`)
			}
		} catch (err) {
			console.error('[StickerPage] Batch upload error:', {
				error: err?.message,
				details: err,
			})
			alert(`Update sheet lỗi: ${err.message || 'Không thể update hàng loạt'}`)
		} finally {
			setIsBatchUploading(false)
		}
	}

	const handleCreateMaster = async (globalIndex, row, options = {}) => {
		const { throwOnError = false } = options
		return createStickerMaster(globalIndex, row, { throwOnError })
	}

	const handleCreateSelectedMasters = async () => {
		const selectedIndices = Object.keys(selectedMasterItems)
			.filter((index) => selectedMasterItems[index])
			.map((index) => Number(index))
			.sort((a, b) => a - b)

		if (!selectedIndices.length) {
			alert('Vui lòng chọn ít nhất 1 item để tạo master')
			return
		}

		setIsBatchCreating(true)
		try {
			setMasterResults((prev) => {
				const next = { ...prev }
				selectedIndices.forEach((index) => {
					next[index] = {
						...(next[index] || {}),
						loading: true,
						error: null,
					}
				})
				return next
			})

			let successCount = 0
			const pendingBackgroundTasks = []

			for (const index of selectedIndices) {
				const row = data[index]
				if (!row) {
					console.warn(`[StickerPage] Skip item ${index + 1}: Không tìm thấy dữ liệu dòng`)
					continue
				}

				try {
					if (!row.imageLink) {
						console.warn(`[StickerPage] Skip STT ${row?.stt || index + 1}: Không có LINK ẢNH`)
						continue
					}

					pendingBackgroundTasks.push(
						createStickerMasterWithRetry(index, row, 2).then((ok) => ({
							index,
							ok,
						}))
					)
				} catch (itemError) {
					console.warn(
						`[StickerPage] Skip STT ${row?.stt || index + 1}: ${itemError?.message || 'Lỗi không xác định'}`
					)
				}
			}

			if (pendingBackgroundTasks.length) {
				const backgroundResults = await Promise.all(pendingBackgroundTasks)
				backgroundResults.forEach((result) => {
					if (result.ok) {
						successCount += 1
						return
					}
				})
			}

			alert(`Create Master xong: ${successCount} item thành công. Item lỗi đã được bỏ qua.`)
		} catch (err) {
			alert(`Create Master lỗi: ${err.message || 'Không thể tạo master hàng loạt'}`)
		} finally {
			setIsBatchCreating(false)
		}
	}

	const startItemIndex = data.length ? (currentPage - 1) * pageSize + 1 : 0
	const endItemIndex = Math.min(currentPage * pageSize, data.length)

	return (
		<section className="rounded-2xl border border-zinc-200 bg-zinc-100/95 p-6 text-zinc-800">
			<PromptEditorModal
				isOpen={showPromptEditor}
				title="Change Prompt - Sticker"
				description="Chinh sua prompt dang dung cho Sticker page. Save de ap dung ngay cho lan tao tiep theo."
				fields={[
					{
						key: 'stickerPrompt',
						label: 'Sticker Prompt',
						value: stickerPrompt,
						oldValue: PROMPT_DEFAULTS.sticker,
						rows: 14,
					},
				]}
				onClose={() => setShowPromptEditor(false)}
				onSave={async (values) => {
					const nextPrompt = String(values.stickerPrompt ?? '')
					setStickerPrompt(nextPrompt)
					try {
						await savePromptToPromptsMoi('sticker', nextPrompt)
						const filePath = await getPromptsMoiPath()
						if (filePath) {
							alert(`Da luu prompt vao:\n${filePath}`)
						}
					} catch (error) {
						alert(error?.message || 'Khong the luu prompt vao PromptsMoi.ts')
					}
				}}
				onReset={async () => {
					setStickerPrompt(PROMPT_DEFAULTS.sticker)
					PROMPTS.sticker = PROMPT_DEFAULTS.sticker
					try {
						await removePromptFromPromptsMoi('sticker')
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
			{showMockupPicker && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
					<div className="w-full max-w-5xl rounded-3xl border border-zinc-200 bg-white p-5 shadow-2xl">
						<div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 pb-4">
							<div>
								<h3 className="text-xl font-semibold text-zinc-900">Chọn mockup</h3>
								<p className="mt-1 text-sm text-zinc-500">
									Chọn file đã nhớ trước đó hoặc bấm dấu + để thêm mockup mới.
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
													className={`rounded-xl border px-3 py-3 transition ${isPreviewActive ? 'border-amber-400 bg-amber-50' : 'border-zinc-200 bg-white hover:border-amber-300 hover:bg-amber-50/60'}`}
												>
													<div className="flex items-start justify-between gap-3">
														<button
															type="button"
															onClick={() => handleShowMockupTemplate(filePath)}
															className="min-w-0 flex-1 text-left"
															disabled={isTemplatePreviewLoading}
														>
															<div className="flex items-center gap-2">
																<span className={`inline-flex h-2.5 w-2.5 rounded-full ${isActive ? 'bg-amber-500' : 'bg-zinc-300'}`} />
																<span className="truncate text-sm font-semibold text-zinc-900">{getFileNameFromPath(filePath)}</span>
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
																className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${isActive ? 'bg-amber-600 text-white' : 'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'}`}
																disabled={isTemplatePreviewLoading}
															>
																Chọn
															</button>
															<button
																type="button"
																onClick={() => removeMockupTemplateFromHistory(filePath)}
																className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
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
										<p className="mt-1 text-xs text-zinc-500">{previewMockupTemplatePath ? getFileNameFromPath(previewMockupTemplatePath) : 'Chọn một mockup để xem preview.'}</p>
									</div>
									<div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">
										{activeMockupPreviewImages.length ? `${activeMockupPreviewImages.length} MOCKUP *` : '0 MOCKUP *'}
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
												<div key={`${previewMockupTemplatePath}-${index}`} className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
													<div className="border-b border-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-600">{preview?.name || `MOCKUP ${index + 1}.png`}</div>
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
											Chưa có PNG preview cho mockup này. Hãy render PSD một lần để lưu preview.
										</div>
									)}
								</div>
							</div>
						</div>
					</div>
				</div>
			)}
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
					Sticker Workspace ({filteredData.length} Items)
				</h2>
				<div className="flex items-center gap-2">
					<input
						type="text"
						placeholder="Search by STT or Keyword..."
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
						className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
					/>
					<button
						type="button"
						onClick={openMockupPicker}
						disabled={!isElectronMockupAvailable}
						className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
						title={
							isElectronMockupAvailable
								? 'Chọn / show mockup mặc định cho toàn trang'
								: 'Tính năng PSD chỉ hoạt động trong Electron desktop app'
						}
					>
						Chọn mockup
					</button>
				</div>
				<div className="flex items-center gap-2">
					<button
						onClick={() => setIsListedItemsModalOpen(true)}
						className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
					>
						Listed
					</button>
					<button
						type="button"
						onClick={() => setShowPromptEditor(true)}
						className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
					>
						Change Prompt
					</button>
				</div>
				{data.length > 0 ? (
					<div className="flex flex-wrap items-center gap-2">
						<span className="rounded-lg bg-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700">
							Create chọn: {selectedMasterCount} | Update chọn sẵn sàng: {selectedUpdateReadyCount} | Toàn bộ sẵn sàng: {totalReadyCount}
						</span>
						<button
							type="button"
							onClick={toggleSelectCurrentPageForMaster}
							className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
						>
							{isCurrentPageFullySelectedForMaster ? 'Bỏ chọn trang tạo master' : 'Chọn trang tạo master'}
						</button>
						{selectedMasterCount > 0 ? (
							<button
								type="button"
								onClick={handleCreateSelectedMasters}
								disabled={isBatchCreating}
								className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{isBatchCreating ? 'Đang tạo master...' : `✨ Create Master ${selectedMasterCount} đã chọn`}
							</button>
						) : null}
						<button
							type="button"
							onClick={clearMasterSelection}
							className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
						>
							Bỏ chọn tạo master
						</button>
						<button
							type="button"
							onClick={toggleSelectCurrentPageForUpdate}
							className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
						>
							{isCurrentPageFullySelectedForUpdate ? 'Bỏ chọn trang update' : 'Chọn trang update'}
						</button>
						<button
							type="button"
							onClick={clearUpdateSelection}
							className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
						>
							Bỏ chọn update
						</button>
						<button
							type="button"
							onClick={handleUploadSelected}
							disabled={!(selectedUpdateReadyCount || totalReadyCount) || isBatchUploading}
							className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{isBatchUploading ? 'Đang update...' : selectedUpdateReadyCount > 0 ? 'Update đã chọn (ưu tiên)' : 'Update toàn bộ có bước 2'}
						</button>
					</div>
				) : null}
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
						{paginatedData.map((row, idx) => {
							const globalIndex = (currentPage - 1) * pageSize + idx
							const hasImage = isValidImageUrl(row.imageLink)
							const result = masterResults[globalIndex]
							const currentUploadStatus = uploadStatus[globalIndex]
							const outputDataUrl = result?.base64 ? `data:${result.mimeType || 'image/png'};base64,${result.base64}` : ''
							const lifestyle = lifestyleResults[globalIndex]
							const lifestylePreviewImages = getLifestylePreviewImages(lifestyle)
							const mockupPreviewImages = getMockupPreviewImages(globalIndex)
							const baseEditorPreviewOptions = [
								...(outputDataUrl ? [{ id: 'master', label: 'Master', src: outputDataUrl }] : []),
								...lifestylePreviewImages.map((image, imageIndex) => ({
									id: `lifestyle-${imageIndex}`,
									label: `Lifestyle ${imageIndex + 1}`,
									src: `data:${image.mimeType || 'image/png'};base64,${image.base64}`,
								})),
							]
							const sourceEditorPreviewOptions = mergePreviewOptions(
								baseEditorPreviewOptions,
								editorPreviewHistory[buildEditorPreviewKey('source', globalIndex)] || []
							)
							const masterEditorPreviewOptions = mergePreviewOptions(
								baseEditorPreviewOptions,
								editorPreviewHistory[buildEditorPreviewKey('master', globalIndex)] || []
							)

							return (
								<article
									key={`${row.keyword}-${globalIndex}`}
									className="rounded-2xl border border-zinc-300 bg-white p-5 shadow-sm"
								>
									<div className="mb-4 flex items-center justify-between gap-3">
										<div className="flex items-center gap-3">
											<div className="rounded-lg bg-indigo-100 px-3 py-2 text-center font-mono text-sm font-semibold text-indigo-700">
												STT: {row.stt || globalIndex + 1}
											</div>
											<div className="text-xl font-semibold text-zinc-900">
												{row.keyword || `Sticker ${globalIndex + 1}`}
											</div>
										</div>
										<div className="flex items-center gap-3">
											<label className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700">
												<input
													type="checkbox"
													checked={!!selectedMasterItems[globalIndex]}
													onChange={() => toggleSelectMasterItem(globalIndex)}
													className="h-4 w-4 cursor-pointer rounded border-zinc-300 text-indigo-600"
												/>
												Create
											</label>
											{result?.base64 ? (
												<label className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
													<input
														type="checkbox"
														checked={!!selectedUpdateItems[globalIndex]}
														onChange={() => toggleSelectUpdateItem(globalIndex)}
														className="h-4 w-4 cursor-pointer rounded border-zinc-300 text-emerald-600"
													/>
													Update
												</label>
											) : null}
											{selectedUpdateReadyCount === 0 && result?.base64 ? (
												<button
													type="button"
													onClick={() => handleUploadSingle(globalIndex, row)}
													disabled={isBatchUploading || currentUploadStatus === 'uploading'}
													className={`px-2 py-1 text-xs font-semibold rounded transition ${currentUploadStatus === 'done'
															? 'bg-green-500 text-white'
															: currentUploadStatus === 'uploading'
																? 'bg-yellow-500 text-white'
																: currentUploadStatus === 'error'
																	? 'bg-red-500 text-white'
																	: 'bg-blue-500 text-white hover:bg-blue-600'
														}`}
												>
													{currentUploadStatus === 'done'
														? '✅ Done'
														: currentUploadStatus === 'uploading'
															? '⏳ Uploading'
															: currentUploadStatus === 'error'
																? '❌ Error'
																: '📤 Upload'}
												</button>
											) : null}
										</div>
									</div>

									<div className="grid gap-5 xl:grid-cols-4">
										{/* SOURCE IMAGE */}
										<div>
											<div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
												1. SOURCE IMAGE
											</div>
											<div className="flex h-96 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100 cursor-zoom-in">
												{hasImage ? (
													<img
														src={row.imageLink}
														alt={row.keyword || 'source'}
														className="h-96 w-full rounded-xl object-cover"
														loading="lazy"
														onClick={() =>
															setEditorState({
																kind: 'source',
																globalIndex,
																src: row.imageLink,
																title: row.keyword || `Source ${globalIndex + 1}`,
																description: 'Click để xem ảnh gốc đầy đủ',
																previewOptions: sourceEditorPreviewOptions,
															})
														}
													/>
												) : (
													<span className="text-sm text-zinc-400">No image</span>
												)}
											</div>
											{row.imageLink && (
												<p className="mt-2 text-xs text-zinc-600 break-all">
													<a href={row.imageLink} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
														{row.imageLink}
													</a>
												</p>
											)}
										</div>

										{/* CREATE MASTER */}
										<div>
											<div className="mb-2 flex items-center justify-between gap-2">
												<span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
													2. CREATE MASTER
												</span>
												<button
													type="button"
													onClick={() => handleCreateMaster(globalIndex, row)}
													disabled={result?.loading || !hasImage}
													className="text-xs font-medium text-indigo-500 hover:text-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
												>
													{result?.loading ? '⏳ Creating...' : '✨ Create Master'}
												</button>
											</div>
											<div className="flex h-96 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100 overflow-hidden cursor-zoom-in">
												{result?.loading ? (
													<div className="flex flex-col items-center gap-2 text-zinc-400">
														<div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
														<span className="text-xs">Đang tạo sticker master...</span>
													</div>
												) : result?.base64 ? (
													<img
														src={outputDataUrl}
														alt={`master-${row.keyword}`}
														className="h-96 w-96 rounded-xl object-cover"
														onClick={() =>
															setEditorState({
																kind: 'master',
																globalIndex,
																src: outputDataUrl,
																title: `Master - ${row.keyword || globalIndex + 1}`,
																description: 'Click để xem ảnh master đầy đủ',
																previewOptions: masterEditorPreviewOptions,
															})
														}
													/>
												) : result?.error ? (
													<div className="flex flex-col items-center gap-2 text-red-500">
														<span className="text-2xl">⚠️</span>
														<span className="text-xs text-center max-w-40">{result.error}</span>
													</div>
												) : (
													<span className="text-sm text-zinc-400">Waiting for creation...</span>
												)}
											</div>

											{outputDataUrl && currentUploadStatus === 'done' ? (
												<div className="mt-3 flex gap-2 flex-wrap">
													<span className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
														Đã update sheet
													</span>
												</div>
											) : null}
											{outputDataUrl && currentUploadStatus === 'error' ? (
												<div className="mt-3 flex gap-2 flex-wrap">
													<span className="inline-flex items-center rounded-lg bg-red-500/10 px-3 py-2 text-xs font-medium text-red-600">
														Update lỗi
													</span>
												</div>
											) : null}
										</div>

										{/* LIFESTYLE IMAGE */}
										<div>
											<div className="mb-2 flex items-center justify-between gap-2">
												<span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
													3. LIFESTYLE IMAGE
												</span>
												<button
													type="button"
													onClick={() => handleGenerateLifestyle(globalIndex)}
													disabled={lifestyle?.loading || !outputDataUrl}
													className="text-xs font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-40"
												>
													{lifestyle?.loading ? '⏳ Đang tạo...' : '✨ Generate Lifestyle'}
												</button>
											</div>
											<div className="flex h-96 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100 overflow-hidden">
												{lifestylePreviewImages.length > 0 ? (
													<div className="h-full w-full overflow-auto p-2">
														{lifestyle?.loading ? (
															<div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
																<div className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
																Đang tạo thêm ảnh lifestyle...
															</div>
														) : null}
														<div className="grid grid-cols-2 gap-2">
															{lifestylePreviewImages.map((image, imageIndex) => {
																const lifestyleSrc = `data:${image.mimeType || 'image/png'};base64,${image.base64}`
																return (
																	<img
																		key={`${globalIndex}-lifestyle-${imageIndex}`}
																		src={lifestyleSrc}
																		alt={`lifestyle-${row.keyword || globalIndex + 1}-${imageIndex + 1}`}
																		className="h-44 w-full cursor-zoom-in rounded-lg object-cover"
																		loading="lazy"
																		onClick={() =>
																			setEditorState({
																				kind: 'lifestyle',
																				globalIndex,
																				imageIndex,
																				src: lifestyleSrc,
																				title: `Lifestyle - ${row.keyword || globalIndex + 1}`,
																				description: 'Lifestyle image sẽ được gửi kèm khi update sheet.',
																				previewOptions: lifestylePreviewImages
																					.filter((preview) => preview?.base64)
																					.map((preview, idx) => ({
																						id: `lifestyle-${idx}`,
																						label: `Lifestyle ${idx + 1}`,
																						src: `data:${preview.mimeType || 'image/png'};base64,${preview.base64}`,
																					})),
																			})
																		}
																	/>
																)
															})}
														</div>
													</div>
												) : lifestyle?.error ? (
													<div className="flex flex-col items-center gap-1 px-4 text-center">
														<span className="text-2xl">⚠️</span>
														<span className="text-xs text-red-500">{lifestyle.error}</span>
													</div>
												) : lifestyle?.loading ? (
													<div className="flex flex-col items-center gap-2 text-zinc-400">
														<div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
														<span className="text-xs">Đang tạo lifestyle...</span>
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
														onClick={() => clearLifestylePreviewImages(globalIndex)}
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

										{/* MOCKUP TU CHON */}
										<div>
											<div className="mb-2 flex items-center justify-between gap-2">
												<span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
													4. MOCKUP TU CHON
												</span>
												<button
													type="button"
													onClick={() => handleGenerateMockupFromTemplate(globalIndex, outputDataUrl)}
													disabled={mockupRenderStatus[globalIndex] === 'loading' || !outputDataUrl || !isElectronMockupAvailable}
													className="text-xs font-medium text-amber-600 hover:text-amber-700 disabled:opacity-40"
													title={!isElectronMockupAvailable ? 'Chỉ chạy trong Electron desktop app' : ''}
												>
													{mockupRenderStatus[globalIndex] === 'loading' ? '⏳ Đang render...' : '✨ Generate từ PSD'}
												</button>
											</div>
											<div className="flex h-96 items-center justify-center overflow-hidden rounded-xl border border-zinc-300 bg-zinc-100">
												{mockupPreviewImages.length > 0 ? (
													<div className="h-full w-full overflow-auto p-2">
														<div className="grid grid-cols-2 gap-2">
															{mockupPreviewImages.map((image, imageIndex) => (
																<img
																	key={`${globalIndex}-custom-mockup-${imageIndex}`}
																	src={image.dataUrl}
																	alt={`custom-mockup-${row.keyword || globalIndex + 1}-${imageIndex + 1}`}
																	className="h-44 w-full cursor-zoom-in rounded-lg object-cover"
																	loading="lazy"
																	onClick={() =>
																		setEditorState({
																			kind: 'customMockup',
																			globalIndex,
																			src: image.dataUrl,
																			title: `Mockup - ${row.keyword || globalIndex + 1}`,
																			description: 'Mockup tự chọn sẽ được gửi kèm khi update sheet.',
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
											<div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2">
												<span className="text-[11px] font-semibold text-zinc-500">Template riêng:</span>
												{mockupTemplateHistory.slice(0, 6).map((filePath) => {
													const isActiveTemplate = filePath === mockupTemplatePath
													return (
														<button
															key={`${globalIndex}-${filePath}`}
															type="button"
															onClick={() => syncMockupTemplateSelection(filePath, { announceChange: false })}
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
											{mockupPreviewImages.length > 0 ? (
												<div className="mt-2">
													<button
														type="button"
														onClick={() => clearCustomMockupPreviewImages(globalIndex)}
														className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
													>
														Xóa toàn bộ mockup
													</button>
												</div>
											) : null}
										</div>
									</div>
									{/* </div> */}
								</article>
							)
						})}

					</div>

					<div className="mt-6 flex items-center justify-center gap-2 text-sm text-zinc-600">
						<span>
							Showing {startItemIndex}-{endItemIndex} of {data.length}
						</span>
					</div>

					<div className="mt-4 flex items-center justify-center gap-2">
						<button
							type="button"
							disabled={currentPage <= 1}
							onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
							className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-40"
						>
							← Previous
						</button>
						<span className="text-sm font-medium text-zinc-700">
							Page {currentPage} of {totalPages}
						</span>
						<button
							type="button"
							disabled={currentPage >= totalPages}
							onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
							className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-40"
						>
							Next →
						</button>

						<select
							value={pageSize}
							onChange={(e) => {
								setPageSize(Number(e.target.value))
								setCurrentPage(1)
							}}
							className="ml-4 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm"
						>
							<option value={5}>5 per page</option>
							<option value={10}>10 per page</option>
							<option value={20}>20 per page</option>
							<option value={50}>50 per page</option>
						</select>
					</div>
				</>
			)}
			<ListedItemsModal
				isOpen={isListedItemsModalOpen}
				onClose={() => setIsListedItemsModalOpen(false)}
				sheetUrl={localStorage.getItem('stickerSheetUrl') || ''}
			/>
		</section>
	)
}


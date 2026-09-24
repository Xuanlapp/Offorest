import { useEffect, useMemo, useRef, useState } from 'react'
import { updateRecordInSheet } from '../services/googleDriveService'
import {
    getDefaultMockupPsdFile,
    getLocalMockupWorkerConfig,
    getLocalMockupWorkerStatus,
    pickLocalMockupWorkerStorageRoot,
    pickLocalMockupWorkerXlapProject,
    readLocalMockupWorkerOutputImage,
    pickMockupPsdFile,
    renderMockupsFromPsdProgressive,
    saveLocalMockupWorkerConfig,
} from '../services/mockupService'
import ListedItemsModal from '../modals/ListedItemsModal'

const MOCKUP_TEMPLATE_STORAGE_KEY = 'mockupTemplatePath'
const CUSTOM_MOCKUPS_STORAGE_KEY = 'mockupCustomMockups'

const getLocalJobLabel = (job) => {
    const userId = String(job?.user_id ?? '').trim()
    const slug = String(job?.product_slug ?? '').trim()
    const itemNumber = String(job?.item_number ?? '').trim()
    const assetId = String(job?.product_design_asset_id ?? '').trim()

    return userId && slug && itemNumber && assetId
        ? `${userId} - ${slug} - ${itemNumber} - ID ${assetId}`
        : `Job #${job?.id || 'unknown'}`
}

export default function MockupPage() {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')
    const [sheetUrl, setSheetUrl] = useState(() => localStorage.getItem('mockupSheetUrl') || '')
    const [data, setData] = useState([])
    const [pageSize, setPageSize] = useState(10)
    const [currentPage, setCurrentPage] = useState(1)
    const [isBatchUploading, setIsBatchUploading] = useState(false)
    const [uploadStatus, setUploadStatus] = useState({})
    const [selectedUpdateItems, setSelectedUpdateItems] = useState({})
    const [mockupTemplatePath, setMockupTemplatePath] = useState('')
    const [mockupRenderStatus, setMockupRenderStatus] = useState({})
    const [previewImage, setPreviewImage] = useState(null)
    const [customMockups, setCustomMockups] = useState(() => {
        try {
            const saved = localStorage.getItem(CUSTOM_MOCKUPS_STORAGE_KEY)
            return saved ? JSON.parse(saved) : {}
        } catch {
            return {}
        }
    })
    const [isElectronMockupAvailable, setIsElectronMockupAvailable] = useState(false)
    const [isElectronRuntime, setIsElectronRuntime] = useState(false)
    const [isListedItemsModalOpen, setIsListedItemsModalOpen] = useState(false)
    const [localWorkerConfig, setLocalWorkerConfig] = useState(null)
    const [localWorkerStatus, setLocalWorkerStatus] = useState(null)
    const [localWorkerMessage, setLocalWorkerMessage] = useState('')
    const [isLocalWorkerSaving, setIsLocalWorkerSaving] = useState(false)
    const [isLocalWorkerSettingsOpen, setIsLocalWorkerSettingsOpen] = useState(false)
    const [expandedLocalJobId, setExpandedLocalJobId] = useState(null)
    const [localJobImageUrls, setLocalJobImageUrls] = useState({})
    const [searchTerm, setSearchTerm] = useState('')
    const mockupImagesRef = useRef({})

    useEffect(() => {
        const onGetData = () => {
            handleGetData()
        }
        window.addEventListener('mockupGetData', onGetData)
        return () => window.removeEventListener('mockupGetData', onGetData)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        const loadLocalWorker = async () => {
            if (!window?.offorestMockup?.getLocalWorkerConfig) return
            try {
                const [config, status] = await Promise.all([
                    getLocalMockupWorkerConfig(),
                    getLocalMockupWorkerStatus(),
                ])
                setLocalWorkerConfig(config)
                setLocalWorkerStatus(status)
            } catch (workerError) {
                setLocalWorkerMessage(workerError.message || 'Không thể đọc cấu hình local worker.')
            }
        }

        loadLocalWorker()
    }, [])

    useEffect(() => {
        if (!window?.offorestMockup?.getLocalWorkerStatus) return undefined

        const refreshStatus = async () => {
            try {
                setLocalWorkerStatus(await getLocalMockupWorkerStatus())
            } catch {
                // Keep the last known status when the local database is temporarily unavailable.
            }
        }

        refreshStatus()
        const intervalId = window.setInterval(refreshStatus, 3000)
        return () => window.clearInterval(intervalId)
    }, [])

    const updateLocalWorkerConfig = (field, value) => {
        setLocalWorkerConfig((previous) => ({ ...previous, [field]: value }))
    }

    const handlePickLocalStorageRoot = async () => {
        try {
            const result = await pickLocalMockupWorkerStorageRoot()
            if (!result?.canceled && result?.directoryPath) {
                updateLocalWorkerConfig('storageRoot', result.directoryPath)
            }
        } catch (workerError) {
            setLocalWorkerMessage(workerError.message || 'Không thể chọn thư mục local.')
        }
    }

    const handlePickXlapProject = async () => {
        try {
            const result = await pickLocalMockupWorkerXlapProject()
            if (!result?.canceled && result?.storageRoot) {
                updateLocalWorkerConfig('storageRoot', result.storageRoot)
                setLocalWorkerMessage(`Đã nhận public storage của XLAP: ${result.storageRoot}`)
            }
        } catch (workerError) {
            setLocalWorkerMessage(workerError.message || 'Không thể đọc public storage của project XLAP.')
        }
    }

    const getLocalJobOutputUrls = (job) => {
        const loadedUrls = localJobImageUrls[job?.id]
        if (Array.isArray(loadedUrls)) return loadedUrls

        try {
            const outputUrls = typeof job?.output_urls === 'string'
                    ? JSON.parse(job.output_urls)
                    : job?.output_urls
            return Array.isArray(outputUrls) ? outputUrls.filter((url) => String(url).startsWith('data:image/')) : []
        } catch {
            return []
        }
    }

    const getStoredLocalJobOutputUrls = (job) => {
        try {
            const outputUrls = typeof job?.output_urls === 'string'
                ? JSON.parse(job.output_urls)
                : job?.output_urls
            return Array.isArray(outputUrls) ? outputUrls.filter((url) => typeof url === 'string' && url) : []
        } catch {
            return []
        }
    }

    useEffect(() => {
        let isActive = true
        const loadCompletedJobImages = async () => {
            const completedJobs = (localWorkerStatus?.jobs || []).filter((job) => job.status === 'completed')
            const missingJobs = completedJobs.filter((job) => !Object.hasOwn(localJobImageUrls, job.id))

            for (const job of missingJobs) {
                try {
                    const outputUrls = typeof job.output_urls === 'string' ? JSON.parse(job.output_urls) : job.output_urls
                    if (!Array.isArray(outputUrls) || !outputUrls.length) continue
                    if (!outputUrls.every((outputUrl) => String(outputUrl).startsWith('/storage/'))) {
                        if (isActive) {
                            setLocalJobImageUrls((previous) => ({ ...previous, [job.id]: [] }))
                        }
                        continue
                    }
                    const images = await Promise.all(outputUrls.map(async (outputUrl) => {
                        const result = await readLocalMockupWorkerOutputImage(outputUrl)
                        return String(result?.dataUrl || '')
                    }))
                    if (isActive && images.every(Boolean)) {
                        setLocalJobImageUrls((previous) => ({ ...previous, [job.id]: images }))
                    }
                } catch {
                    // Keep the job row visible when a local output has been moved or deleted.
                    if (isActive) {
                        setLocalJobImageUrls((previous) => ({ ...previous, [job.id]: [] }))
                    }
                }
            }
        }

        loadCompletedJobImages()
        return () => { isActive = false }
    }, [localWorkerStatus, localJobImageUrls])

    const handleLocalWorkerToggle = async () => {
        if (!localWorkerConfig) return
        setIsLocalWorkerSaving(true)
        setLocalWorkerMessage('')
        try {
            const savedConfig = await saveLocalMockupWorkerConfig(localWorkerConfig)
            setLocalWorkerConfig(savedConfig)
            const status = await getLocalMockupWorkerStatus()
            setLocalWorkerStatus(status)
            setLocalWorkerMessage('Đã lưu .env. Worker nền sẽ dùng cấu hình này ở vòng quét tiếp theo.')
        } catch (workerError) {
            setLocalWorkerMessage(workerError.message || 'Không thể cập nhật local worker.')
        } finally {
            setIsLocalWorkerSaving(false)
        }
    }

    useEffect(() => {
        setIsElectronRuntime(Boolean(window?.navigator?.userAgent?.includes('Electron')))
        setIsElectronMockupAvailable(Boolean(window?.offorestMockup?.pickPsdFile && window?.offorestMockup?.renderFromPsd))

        const savedTemplate = String(localStorage.getItem(MOCKUP_TEMPLATE_STORAGE_KEY) || '').trim()
        if (savedTemplate) {
            setMockupTemplatePath(savedTemplate)
            return
        }

        const bootstrapTemplate = async () => {
            try {
                const result = await getDefaultMockupPsdFile()
                if (result?.filePath) {
                    setMockupTemplatePath(result.filePath)
                    localStorage.setItem(MOCKUP_TEMPLATE_STORAGE_KEY, result.filePath)
                }
            } catch {
                // Ignore default template lookup failures.
            }
        }

        bootstrapTemplate()
    }, [])

    useEffect(() => {
        try {
            localStorage.setItem(CUSTOM_MOCKUPS_STORAGE_KEY, JSON.stringify(customMockups))
        } catch {
            // Ignore storage write failures.
        }
    }, [customMockups])

    const filteredData = data.filter(item => {
        const term = searchTerm.toLowerCase()
        return item.keyword.toLowerCase().includes(term) || item.stt.toString().includes(term)
    })

    const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize))
    const paginatedData = useMemo(
        () => filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize),
        [filteredData, currentPage, pageSize]
    )
    const currentPageGlobalIndices = useMemo(
        () => paginatedData.map((_, index) => (currentPage - 1) * pageSize + index),
        [paginatedData, currentPage, pageSize]
    )
    const selectedCurrentPageCount = currentPageGlobalIndices.filter((index) => !!selectedUpdateItems[index]).length
    const isCurrentPageFullySelected =
        currentPageGlobalIndices.length > 0 && selectedCurrentPageCount === currentPageGlobalIndices.length

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

    const parseCSV = (csvText) => {
        const rows = []
        let currentRow = []
        let currentValue = ''
        let inQuotes = false

        const pushValue = () => {
            currentRow.push(currentValue)
            currentValue = ''
        }

        const pushRow = () => {
            const isEmptyRow = currentRow.length === 0 || currentRow.every((cell) => String(cell || '').trim() === '')
            if (!isEmptyRow) {
                rows.push(currentRow)
            }
            currentRow = []
        }

        const text = String(csvText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')

        for (let index = 0; index < text.length; index += 1) {
            const character = text[index]

            if (character === '"') {
                if (inQuotes && text[index + 1] === '"') {
                    currentValue += '"'
                    index += 1
                } else {
                    inQuotes = !inQuotes
                }
                continue
            }

            if (character === ',' && !inQuotes) {
                pushValue()
                continue
            }

            if (character === '\n' && !inQuotes) {
                pushValue()
                pushRow()
                continue
            }

            currentValue += character
        }

        pushValue()
        pushRow()

        if (rows.length < 2) return []

        const headers = rows[0].map((header) => String(header || '').trim())
        return rows.slice(1).map((cells) => {
            const row = {}
            headers.forEach((header, index) => {
                row[header] = cells[index] || ''
            })
            return row
        })
    }

    const extractSheetInfo = (url) => {
        const idMatch = String(url || '').match(/\/d\/([a-zA-Z0-9-_]+)/)
        const gidMatch = String(url || '').match(/[?#&]gid=(\d+)/)
        return {
            id: idMatch ? idMatch[1] : null,
            gid: gidMatch ? gidMatch[1] : '0',
        }
    }

    const extractGoogleDriveFileId = (url) => {
        const value = String(url || '').trim()
        if (!value) return ''

        const directMatch = value.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
        if (directMatch?.[1]) return directMatch[1]

        const openMatch = value.match(/[?&]id=([a-zA-Z0-9_-]+)/)
        if (openMatch?.[1]) return openMatch[1]

        return ''
    }

    const normalizeDriveImageUrl = (url) => {
        const value = String(url || '').trim()
        if (!value) return ''
        if (!/drive\.google\.com/i.test(value)) return value

        const fileId = extractGoogleDriveFileId(value)
        if (!fileId) return value

        return `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`
    }

    const getFirstImageLikeValueFromRawRow = (rawRow) => {
        if (!rawRow || typeof rawRow !== 'object') return ''

        const values = Object.values(rawRow)
            .map((value) => String(value || '').trim())
            .filter(Boolean)

        // Prefer obvious image URLs first.
        const explicitImageUrl = values.find((value) =>
            /^data:image\//i.test(value)
            || /^https?:\/\//i.test(value) && /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(value)
        )
        if (explicitImageUrl) return normalizeDriveImageUrl(explicitImageUrl)

        // Fallback to any URL from sheet so REDESIGN box still has source image.
        const anyUrl = values.find((value) => /^https?:\/\//i.test(value))
        return anyUrl ? normalizeDriveImageUrl(anyUrl) : ''
    }

    const getDesignImageSource = (row) => {
        const redesign = String(row?.redesign || '').trim()
        const imageLink = String(row?.imageLink || '').trim()
        const fallbackFromRaw = getFirstImageLikeValueFromRawRow(row?.rawRow)
        return normalizeDriveImageUrl(redesign || imageLink || fallbackFromRaw)
    }

    const resolveImageDataUrl = async (sourceUrl) => {
        const normalizedSource = normalizeDriveImageUrl(sourceUrl)
        if (!normalizedSource) return ''
        if (normalizedSource.startsWith('data:image/')) return normalizedSource

        if (window?.offorestMockup?.resolveImageDataUrl) {
            const result = await window.offorestMockup.resolveImageDataUrl({ sourceUrl: normalizedSource })
            const dataUrl = String(result?.dataUrl || '')
            if (!dataUrl) {
                throw new Error('Không thể đọc ảnh REDESIGN')
            }
            return dataUrl
        }

        const response = await fetch(normalizedSource)
        if (!response.ok) {
            throw new Error('Không thể tải ảnh REDESIGN')
        }

        const blob = await response.blob()
        return await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result || ''))
            reader.onerror = () => reject(new Error('Không thể đọc ảnh REDESIGN'))
            reader.readAsDataURL(blob)
        })
    }

    const dataUrlToImagePayload = (dataUrl) => {
        const match = String(dataUrl || '').match(/^data:(.*?);base64,(.*)$/)
        if (!match) throw new Error('Dữ liệu ảnh không hợp lệ')
        return {
            mimeType: match[1] || 'image/png',
            base64: match[2] || '',
        }
    }

    const dataUrlToFile = async (dataUrl, fileName, fallbackMimeType = 'image/png') => {
        const response = await fetch(dataUrl)
        const blob = await response.blob()
        return new File([blob], fileName, { type: blob.type || fallbackMimeType })
    }

    const getAllMockupImages = (globalIndex) => {
        const imagesFromRef = mockupImagesRef.current[globalIndex] || []
        if (Array.isArray(imagesFromRef) && imagesFromRef.length) {
            return imagesFromRef
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

        if (item?.dataUrl && String(item.dataUrl).startsWith('data:image/')) {
            return [{
                name: item?.name || `mockup-${globalIndex + 1}.png`,
                dataUrl: String(item.dataUrl),
            }]
        }

        return []
    }

    const getMockupSources = (row, globalIndex) => {
        const generatedMockups = getAllMockupImages(globalIndex)
        if (generatedMockups.length) {
            return generatedMockups
        }

        return []
    }

    const renderMockupImagesFromTemplate = async (globalIndex, row, designSource) => {
        if (!designSource) {
            throw new Error('Chưa có ảnh REDESIGN')
        }

        const templatePath = String(mockupTemplatePath || '').trim()
        if (!templatePath) {
            throw new Error('Vui lòng chọn file MOCKUP.psd trước')
        }

        const streamedImages = []
        const designDataUrl = await resolveImageDataUrl(designSource)
        const result = await renderMockupsFromPsdProgressive({
            psdPath: templatePath,
            designDataUrl,
            renderer: 'ag-psd',
            preferPhotoshop: false,
            onOutput: (output) => {
                const normalizedDataUrl = String(output?.dataUrl || output?.src || '')
                if (!normalizedDataUrl.startsWith('data:image/')) return

                streamedImages.push({
                    name: output?.name || `MOCKUP ${streamedImages.length + 1}.png`,
                    dataUrl: normalizedDataUrl,
                })
            },
        })

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
            throw new Error('Không render được ảnh mockup từ PSD')
        }

        mockupImagesRef.current[globalIndex] = images
        setCustomMockups((prev) => ({
            ...prev,
            [globalIndex]: {
                source: 'psd',
                name: images[0].name,
                dataUrl: images[0].dataUrl,
                images,
            },
        }))

        return images
    }

    const handleGetData = async () => {
        try {
            const latestSheetUrl = String(localStorage.getItem('mockupSheetUrl') || sheetUrl || '').trim()
            if (!latestSheetUrl) {
                setError('Vui lòng nhập URL Google Sheet cho Mockup trước khi Get Data')
                return
            }

            setSheetUrl(latestSheetUrl)
            localStorage.setItem('mockupSheetUrl', latestSheetUrl)
            setIsLoading(true)
            setError('')

            const { id: sheetId, gid } = extractSheetInfo(latestSheetUrl)
            if (!sheetId) {
                setError(`Link sheet Mockup không hợp lệ: ${latestSheetUrl}`)
                return
            }

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

            const normalizedRows = rows.map((row, index) => ({
                stt: getValueByAliases(row, ['STT']),
                keyword: getValueByAliases(row, ['KEYWORD', 'Keyword', 'TỪ KHÓA', 'TU KHOA']) || `Item ${index + 1}`,
                sanPham: getValueByAliases(row, ['SẢN PHẨM', 'SAN PHAM', 'Product type', 'Product']),
                imageLink: getValueByAliases(row, ['LINK ẢNH', 'Link ảnh', 'LINK ANH', 'Image', 'Image Link', 'IMAGE LINK']),
                redesign: getValueByAliases(row, ['REDESIGN', 'Redesign', 'FINAL CONCEPT REDESIGN']),
                mockup1: getValueByAliases(row, ['MOCKUP1', 'Mockup1', 'MOCKUP 1', 'Mockup 1']),
                description: getValueByAliases(row, ['DESCRIPTION', 'Description', 'PRODUCT DESCRIPTION', 'Product Description']),
                status: getValueByAliases(row, ['Status', 'TRẠNG THÁI', 'TRANG THAI']),
                rawRow: row,
            }))

            const usableRows = normalizedRows.filter((row) => {
                const sttValue = String(row.stt || '').trim()
                const sttNum = Number(sttValue)
                const isValidStt = sttValue !== '' && Number.isInteger(sttNum) && sttNum > 0
                if (!isValidStt) return false

                const hasLinkAnh = String(row.imageLink || '').trim()
                const isRedesignEmpty = String(row.redesign || '').trim() === ''
                return Boolean(hasLinkAnh && isRedesignEmpty)
            })

            if (usableRows.length === 0) {
                setError('Không tìm thấy hàng nào có LINK ẢNH và REDESIGN trống.')
            }

            setData(usableRows)
            setCurrentPage(1)
            setSelectedUpdateItems({})
            setUploadStatus({})
        } catch (err) {
            setError(err?.message || 'Không thể lấy dữ liệu từ sheet')
        } finally {
            setIsLoading(false)
        }
    }

    const handlePickMockupTemplate = async () => {
        if (!isElectronMockupAvailable) {
            alert('Tính năng PSD mockup chỉ chạy trong Electron desktop app.')
            return
        }

        try {
            const result = await pickMockupPsdFile()
            if (!result?.canceled && result?.filePath) {
                setMockupTemplatePath(result.filePath)
                localStorage.setItem(MOCKUP_TEMPLATE_STORAGE_KEY, result.filePath)
            }
        } catch (err) {
            alert(err?.message || 'Không thể chọn file MOCKUP.psd')
        }
    }

    const handleGenerateMockupFromTemplate = async (globalIndex, row, designSource) => {
        setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'uploading' }))
        setMockupRenderStatus((prev) => ({ ...prev, [globalIndex]: 'loading' }))
        try {
            await renderMockupImagesFromTemplate(globalIndex, row, designSource)
            setMockupRenderStatus((prev) => ({ ...prev, [globalIndex]: 'done' }))

            try {
                const target = resolveSheetTarget()
                await uploadRowToSheet(globalIndex, row, target)
                setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'done' }))
            } catch (uploadErr) {
                setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'error' }))
                alert(`Đã tạo mockup nhưng update sheet lỗi: ${uploadErr?.message || 'Lỗi không xác định'}`)
            }
        } catch (err) {
            setMockupRenderStatus((prev) => ({ ...prev, [globalIndex]: 'error' }))
            setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'error' }))
            alert(err?.message || 'Không thể tạo mockup')
        }
    }

    const toggleSelectCurrentPage = () => {
        setSelectedUpdateItems((prev) => {
            const next = { ...prev }
            currentPageGlobalIndices.forEach((globalIndex) => {
                next[globalIndex] = !isCurrentPageFullySelected
            })
            return next
        })
    }

    const handleGenerateSelectedMockups = async () => {
        const selectedIndices = currentPageGlobalIndices.filter((globalIndex) => selectedUpdateItems[globalIndex])

        if (!selectedIndices.length) {
            alert('Vui lòng chọn ít nhất 1 item ở trang hiện tại để chạy mockup')
            return
        }

        if (!isElectronMockupAvailable) {
            alert('Tính năng PSD mockup chỉ chạy trong Electron desktop app.')
            return
        }

        if (!String(mockupTemplatePath || '').trim()) {
            alert('Vui lòng chọn file MOCKUP.psd trước')
            return
        }

        let target
        try {
            target = resolveSheetTarget()
        } catch (err) {
            alert(err?.message || 'Không thể update sheet')
            return
        }

        let successCount = 0
        let failedCount = 0
        let successfulIndices = []

        for (const globalIndex of selectedIndices) {
            const row = data[globalIndex]
            const designSource = getDesignImageSource(row)

            if (!row || !designSource) {
                failedCount += 1
                setMockupRenderStatus((prev) => ({ ...prev, [globalIndex]: 'error' }))
                setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'error' }))
                continue
            }

            setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'uploading' }))
            setMockupRenderStatus((prev) => ({ ...prev, [globalIndex]: 'loading' }))
            try {
                await renderMockupImagesFromTemplate(globalIndex, row, designSource)
                await uploadRowToSheet(globalIndex, row, target)
                setMockupRenderStatus((prev) => ({ ...prev, [globalIndex]: 'done' }))
                setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'done' }))
                successCount += 1
                successfulIndices.push(globalIndex)
            } catch {
                setMockupRenderStatus((prev) => ({ ...prev, [globalIndex]: 'error' }))
                setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'error' }))
                failedCount += 1
            }
        }

        if (successfulIndices.length > 0) {
            setData(prevData => prevData.filter((_, idx) => !successfulIndices.includes(idx)))
            setSelectedUpdateItems(prev => {
                const next = { ...prev }
                successfulIndices.forEach(idx => delete next[idx])
                return next
            })
        }

        alert(`Đã chạy mockup và update sheet cho ${successCount} item, ${failedCount} item lỗi`)
    }

    const resolveSheetTarget = () => {
        const currentSheetUrl = String(localStorage.getItem('mockupSheetUrl') || sheetUrl || '').trim()
        if (!currentSheetUrl) {
            throw new Error('Vui lòng nhập URL Google Sheet trước khi update')
        }

        const { id: sheetId, gid } = extractSheetInfo(currentSheetUrl)
        if (!sheetId) {
            throw new Error('Sheet URL không hợp lệ')
        }

        setSheetUrl(currentSheetUrl)
        localStorage.setItem('mockupSheetUrl', currentSheetUrl)
        return { sheetId, gid }
    }

    const uploadRowToSheet = async (globalIndex, row, target) => {
        const stt = row?.stt || globalIndex + 1
        const redesignSource = getDesignImageSource(row)
        if (!redesignSource) {
            throw new Error('Không có ảnh REDESIGN để update')
        }

        const mockupImages = getMockupSources(row, globalIndex)
        if (!mockupImages.length) {
            throw new Error('Chưa có MOCKUP TỰ CHỌN để update')
        }

        const redesignDataUrl = await resolveImageDataUrl(redesignSource)
        const redesignPayload = dataUrlToImagePayload(redesignDataUrl)
        const redesignFile = await dataUrlToFile(
            redesignDataUrl,
            `mockup-redesign-${stt}.png`,
            redesignPayload.mimeType || 'image/png'
        )

        const mockupFiles = []
        for (let index = 0; index < mockupImages.length; index += 1) {
            const mockup = mockupImages[index]
            if (!mockup?.dataUrl) continue
            const file = await dataUrlToFile(mockup.dataUrl, `mockup-${stt}-${index + 1}.png`, 'image/png')
            mockupFiles.push(file)
        }

        await updateRecordInSheet(
            target.sheetId,
            stt,
            target.gid,
            [redesignFile, ...mockupFiles],
            'mockup'
        )
    }

    const toggleSelectUpdateItem = (globalIndex) => {
        setSelectedUpdateItems((prev) => ({
            ...prev,
            [globalIndex]: !prev[globalIndex],
        }))
    }

    const handleUploadSingle = async (globalIndex, row) => {
        setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'uploading' }))
        try {
            const target = resolveSheetTarget()
            await uploadRowToSheet(globalIndex, row, target)
            setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'done' }))
        } catch (err) {
            setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'error' }))
            alert(err?.message || 'Update sheet lỗi')
        }
    }

    const handleUploadSelected = async () => {
        const selectedIndices = Object.keys(selectedUpdateItems)
            .filter((index) => selectedUpdateItems[index])
            .map((index) => Number(index))

        if (!selectedIndices.length) {
            alert('Vui lòng chọn ít nhất 1 item để update')
            return
        }

        setIsBatchUploading(true)
        try {
            const target = resolveSheetTarget()
            let successCount = 0
            let failedCount = 0
            let successfulIndices = []

            for (const index of selectedIndices) {
                const row = data[index]
                if (!row) {
                    failedCount += 1
                    setUploadStatus((prev) => ({ ...prev, [index]: 'error' }))
                    continue
                }

                setUploadStatus((prev) => ({ ...prev, [index]: 'uploading' }))
                try {
                    await uploadRowToSheet(index, row, target)
                    successCount += 1
                    successfulIndices.push(index)
                    setUploadStatus((prev) => ({ ...prev, [index]: 'done' }))
                } catch {
                    failedCount += 1
                    setUploadStatus((prev) => ({ ...prev, [index]: 'error' }))
                }
            }

            if (successfulIndices.length > 0) {
                setData(prevData => prevData.filter((_, idx) => !successfulIndices.includes(idx)))
                setSelectedUpdateItems(prev => {
                    const next = { ...prev }
                    successfulIndices.forEach(idx => delete next[idx])
                    return next
                })
            }

            alert(`Update sheet xong: ${successCount} thành công, ${failedCount} lỗi`)
        } catch (err) {
            alert(err?.message || 'Không thể update hàng loạt')
        } finally {
            setIsBatchUploading(false)
        }
    }

    const mockupBridgeStatus = isElectronRuntime
        ? isElectronMockupAvailable
            ? 'Electron bridge: ready'
            : 'Electron bridge: missing'
        : 'Web mode (no Electron bridge)'

    return (
        <section className="rounded-2xl border border-zinc-200 bg-zinc-100/95 p-6 text-zinc-800">
            {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-3xl font-semibold tracking-tight text-zinc-900">Mockup Workspace ({filteredData.length} Items)</h2>
                    {sheetUrl ? <p className="mt-1 text-xs text-zinc-500 break-all">Sheet: {sheetUrl}</p> : null}
                    <p className="mt-1 text-xs text-zinc-500">Chỉ gồm 2 ô: 1. Ảnh REDESIGN và 2. MOCKUP TỰ CHỌN.</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="text"
                        placeholder="Search by STT or Keyword..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                        onClick={() => setIsListedItemsModalOpen(true)}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                        Listed
                    </button>
                    <button
                        type="button"
                        onClick={handleGetData}
                        disabled={isLoading}
                        className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isLoading ? 'Đang lấy sheet...' : 'Get Dữ Liệu'}
                    </button>
                    <button
                        type="button"
                        onClick={handlePickMockupTemplate}
                        disabled={!isElectronMockupAvailable}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Chọn mockup PSD
                    </button>
                    <button
                        type="button"
                        onClick={handleUploadSelected}
                        disabled={isBatchUploading}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isBatchUploading ? 'Đang update...' : 'Update các item đã chọn'}
                    </button>
                </div>
            </div>

            {mockupTemplatePath ? (
                <p className="mt-2 text-xs text-amber-700">PSD template: {mockupTemplatePath}</p>
            ) : null}
            <p className={`mt-2 text-xs ${isElectronMockupAvailable ? 'text-emerald-700' : 'text-red-600'}`}>
                {mockupBridgeStatus}
            </p>
            {localWorkerConfig ? (
                <div className="mt-3">
                    <button
                        type="button"
                        onClick={() => setIsLocalWorkerSettingsOpen((previous) => !previous)}
                        className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100"
                    >
                        {isLocalWorkerSettingsOpen ? 'Đóng cài đặt worker' : 'Cài đặt worker'}
                        {localWorkerStatus?.running ? ' (đang chạy)' : ''}
                    </button>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">Chờ: {localWorkerStatus?.summary?.waiting || 0}</span>
                        <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-800">Đang làm: {localWorkerStatus?.summary?.processing || 0}</span>
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">Đã xong: {localWorkerStatus?.summary?.completed || 0}</span>
                        <span className="rounded-full bg-rose-100 px-2 py-1 text-rose-800">Lỗi: {localWorkerStatus?.summary?.failed || 0}</span>
                    </div>
                    {localWorkerStatus?.error ? <p className="mt-2 text-xs text-rose-700">Không thể đọc queue: {localWorkerStatus.error}</p> : null}
                    {localWorkerStatus?.jobs?.length ? (
                        <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-white text-xs">
                            {localWorkerStatus.jobs.map((job) => {
                                const outputUrls = getLocalJobOutputUrls(job)
                                const storedOutputUrls = getStoredLocalJobOutputUrls(job)
                                const canPreview = job.status === 'completed' && outputUrls.length > 0
                                const isExpanded = expandedLocalJobId === job.id
                                const jobLabel = getLocalJobLabel(job)

                                return (
                                    <div key={job.id} className="border-b border-zinc-100 last:border-b-0">
                                        <button
                                            type="button"
                                            disabled={!canPreview}
                                            onClick={() => setExpandedLocalJobId((current) => current === job.id ? null : job.id)}
                                            className={`flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left ${canPreview ? 'hover:bg-zinc-50' : 'cursor-default'}`}
                                        >
                                            <span className="font-medium text-zinc-700">{jobLabel}{canPreview ? ` (${outputUrls.length} ảnh)` : ''}</span>
                                            <span className={`rounded-full px-2 py-0.5 font-medium ${job.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : job.status === 'processing' ? 'bg-sky-100 text-sky-800' : job.status === 'failed' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{job.status === 'waiting' ? 'Chờ xử lý' : job.status === 'processing' ? 'Đang làm' : job.status === 'completed' ? 'Đã xong' : 'Lỗi'}</span>
                                        </button>
                                        {isExpanded ? (
                                            <div className="grid grid-cols-2 gap-2 border-t border-zinc-100 bg-zinc-50 p-3 md:grid-cols-3">
                                                {outputUrls.map((url, index) => (
                                                    <button key={url} type="button" onClick={() => setPreviewImage({ src: url, title: `${jobLabel} - Mockup ${index + 1}`, description: storedOutputUrls[index] || '' })} className="aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-white p-1">
                                                        <img src={url} alt={`Job ${job.id} mockup ${index + 1}`} className="h-full w-full object-contain" loading="lazy" />
                                                    </button>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                )
                            })}
                        </div>
                    ) : <p className="mt-2 text-xs text-zinc-500">Chưa có job mockup nào.</p>}
                    {isLocalWorkerSettingsOpen ? (
                <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <p className="text-sm font-semibold text-sky-900">Local Mockup Worker</p>
                            <p className="text-xs text-sky-700">Poll MySQL local mỗi 2 giây; nhận mọi job đang `waiting` có product khớp với asset và PSD template.</p>
                        </div>
                        <button
                            type="button"
                            onClick={handleLocalWorkerToggle}
                            disabled={isLocalWorkerSaving}
                            className={`rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 ${localWorkerStatus?.running ? 'bg-rose-600 hover:bg-rose-700' : 'bg-sky-600 hover:bg-sky-700'}`}
                        >
                            {isLocalWorkerSaving ? 'Đang lưu...' : 'Lưu cấu hình'}
                        </button>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                        <input value={localWorkerConfig.host || ''} onChange={(event) => updateLocalWorkerConfig('host', event.target.value)} placeholder="MySQL host" className="rounded border border-sky-200 px-2 py-1 text-xs" />
                        <input value={localWorkerConfig.port || ''} onChange={(event) => updateLocalWorkerConfig('port', event.target.value)} placeholder="MySQL port" className="rounded border border-sky-200 px-2 py-1 text-xs" />
                        <input value={localWorkerConfig.user || ''} onChange={(event) => updateLocalWorkerConfig('user', event.target.value)} placeholder="MySQL user" className="rounded border border-sky-200 px-2 py-1 text-xs" />
                        <input type="password" value={localWorkerConfig.password || ''} onChange={(event) => updateLocalWorkerConfig('password', event.target.value)} placeholder="MySQL password (optional)" className="rounded border border-sky-200 px-2 py-1 text-xs" />
                        <input value={localWorkerConfig.database || ''} onChange={(event) => updateLocalWorkerConfig('database', event.target.value)} placeholder="Database" className="rounded border border-sky-200 px-2 py-1 text-xs" />
                        <div className="flex gap-2 md:col-span-2">
                            <input value={localWorkerConfig.storageRoot || ''} onChange={(event) => updateLocalWorkerConfig('storageRoot', event.target.value)} placeholder="Public storage root (master + PSD + output)" className="min-w-0 flex-1 rounded border border-sky-200 px-2 py-1 text-xs" />
                            <button type="button" onClick={handlePickXlapProject} className="rounded border border-sky-300 bg-white px-2 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100">Chọn XLAP</button>
                            <button type="button" onClick={handlePickLocalStorageRoot} className="rounded border border-sky-300 bg-white px-2 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100">Chọn folder</button>
                        </div>
                    </div>
                    <p className="mt-2 text-xs text-sky-800">`Chọn XLAP` tự đọc `XLAP_PUBLIC_STORAGE_PATH` trong project; output được lưu vào `generated/product-slug/mockups/asset-id`. Bấm nút để lưu thay đổi vào `.env`.</p>
                    {localWorkerMessage ? <p className="mt-2 text-xs text-sky-800">{localWorkerMessage}</p> : null}
                    {localWorkerStatus?.lastResult ? <p className="mt-1 text-xs text-sky-700">Last result: {localWorkerStatus.lastResult.status}{localWorkerStatus.lastResult.jobId ? ` (job #${localWorkerStatus.lastResult.jobId})` : ''}</p> : null}
                </div>
                    ) : null}
                </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={toggleSelectCurrentPage}
                    disabled={!currentPageGlobalIndices.length}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isCurrentPageFullySelected ? 'Bỏ chọn toàn bộ trang' : 'Chọn toàn bộ trang'}
                </button>
                <button
                    type="button"
                    onClick={handleGenerateSelectedMockups}
                    disabled={!selectedCurrentPageCount || !isElectronMockupAvailable}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    ✨ Generate + Update đã chọn ({selectedCurrentPageCount})
                </button>
            </div>

            {data.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
                    Chưa có dữ liệu. Hãy nhập link sheet Mockup và bấm Get Dữ Liệu.
                </div>
            ) : (
                <>
                    <div className="mt-4 space-y-5">
                        {paginatedData.map((row, idx) => {
                            const globalIndex = (currentPage - 1) * pageSize + idx
                            const redesignSource = getDesignImageSource(row)
                            const mockupImages = getMockupSources(row, globalIndex)
                            const status = uploadStatus[globalIndex]

                            return (
                                <article key={`${row.keyword}-${globalIndex}`} className="rounded-2xl border border-zinc-300 bg-white p-5 shadow-sm">
                                    <div className="mb-4 flex items-start justify-between gap-3">


                                        <div className="flex items-center gap-3">
                                            <label className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                                                <input
                                                    type="checkbox"
                                                    checked={!!selectedUpdateItems[globalIndex]}
                                                    onChange={() => toggleSelectUpdateItem(globalIndex)}
                                                    className="h-4 w-4 cursor-pointer rounded border-zinc-300 text-emerald-600"
                                                />
                                                Chọn chạy
                                            </label>

                                            <button
                                                type="button"
                                                onClick={() => handleUploadSingle(globalIndex, row)}
                                                disabled={status === 'uploading' || isBatchUploading}
                                                className={`rounded px-2 py-1 text-xs font-semibold transition ${status === 'done'
                                                    ? 'bg-green-500 text-white'
                                                    : status === 'uploading'
                                                        ? 'bg-yellow-500 text-white'
                                                        : status === 'error'
                                                            ? 'bg-red-500 text-white'
                                                            : 'bg-blue-500 text-white hover:bg-blue-600'
                                                    }`}
                                            >
                                                {status === 'done' ? '✅ Done' : status === 'uploading' ? '⏳ Uploading' : status === 'error' ? '❌ Error' : '📤 Upload'}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid gap-5 xl:grid-cols-2">
                                        <div>
                                            <div className="mb-2 flex items-center justify-between">
                                                <span className="text-xs font-semibold uppercase tracking-wide text-rose-600">1. REDESIGN</span>
                                            </div>
                                            <div className="flex h-96 items-center justify-center overflow-hidden rounded-xl border border-zinc-300 bg-zinc-100">
                                                {redesignSource ? (
                                                    <img src={redesignSource} alt={row.keyword || 'redesign'} className="h-96 w-full rounded-xl object-cover" loading="lazy" />
                                                ) : (
                                                    <span className="text-sm text-zinc-400">No redesign image</span>
                                                )}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="mb-2 flex items-center justify-between">
                                                <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">2. MOCKUP TỰ CHỌN</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleGenerateMockupFromTemplate(globalIndex, row, redesignSource)}
                                                    disabled={mockupRenderStatus[globalIndex] === 'loading' || !redesignSource || !isElectronMockupAvailable}
                                                    className="text-xs font-medium text-amber-600 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
                                                >
                                                    {mockupRenderStatus[globalIndex] === 'loading'
                                                        ? '⏳ Đang render...'
                                                        : '✨ Generate + Update'}
                                                </button>
                                            </div>

                                            <div className="flex h-96 items-center justify-center overflow-hidden rounded-xl border border-zinc-300 bg-zinc-100">
                                                {mockupImages.length ? (
                                                    <div className="h-full w-full overflow-auto p-2">
                                                        <div className="grid grid-cols-2 gap-2">
                                                            {mockupImages.map((image, imageIndex) => (
                                                                <img
                                                                    key={`${globalIndex}-${imageIndex}`}
                                                                    src={image.dataUrl}
                                                                    alt={`mockup-${imageIndex + 1}`}
                                                                    className="h-44 w-full cursor-zoom-in rounded-lg object-cover"
                                                                    loading="lazy"
                                                                    onClick={() =>
                                                                        setPreviewImage({
                                                                            src: image.dataUrl,
                                                                            title: image.name || `Mockup ${imageIndex + 1}`,
                                                                        })
                                                                    }
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-zinc-400">Chưa generate mockup</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </article>
                            )
                        })}
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
                        <span className="text-sm font-medium text-zinc-700">Page {currentPage} of {totalPages}</span>
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
                            <option value={100}>100 per page</option>
                            <option value={150}>150 per page</option>
                            <option value={200}>200 per page</option>
                        </select>
                    </div>
                </>
            )}

            {previewImage ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
                    onClick={() => setPreviewImage(null)}
                >
                    <div
                        className="relative max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
                            <div className="min-w-0">
                                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-zinc-400">
                                    Mockup Preview
                                </p>
                                <h3 className="mt-1 truncate text-lg font-semibold text-white">
                                    {previewImage.title}
                                </h3>
                                {previewImage.description ? (
                                    <p className="mt-1 max-h-20 overflow-hidden text-sm text-zinc-400 break-words line-clamp-3">
                                        {previewImage.description}
                                    </p>
                                ) : null}
                            </div>
                            <button
                                type="button"
                                onClick={() => setPreviewImage(null)}
                                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
                            >
                                Đóng
                            </button>
                        </div>

                        <div className="flex max-h-[calc(92vh-76px)] items-center justify-center overflow-auto bg-black p-4">
                            <img
                                src={previewImage.src}
                                alt={previewImage.title}
                                className="max-h-[calc(92vh-120px)] max-w-full rounded-xl object-contain"
                            />
                        </div>
                    </div>
                </div>
            ) : null}
            <ListedItemsModal
                isOpen={isListedItemsModalOpen}
                onClose={() => setIsListedItemsModalOpen(false)}
                sheetUrl={localStorage.getItem('mockupSheetUrl') || ''}
            />
        </section>
    )
}

import { useMemo, useState, useEffect } from 'react'
import { getCurrentUser } from '../services/authService'
import { redesignImage, generateLifestyleImage } from '../services/geminiService'
import { getSheetUrlForPage } from '../services/sheetConfigService'
import { updateDesignPageImages } from '../services/googleDriveService'
import { PROMPTS } from '../prompt/Prompts'
import ImagePreviewEditorModal from '../components/ImagePreviewEditorModal'

export default function HoloarcylicPage() {
  const [isLoading, setIsLoading] = useState(false)

  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [data, setData] = useState([])
  const [selectedProduct, setSelectedProduct] = useState('ALL')
  const [pageSize, setPageSize] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  // { [globalIndex]: { loading, base64, mimeType, error } }
  const [redesignResults, setRedesignResults] = useState({})
  // State for selected items
  const [selectedItems, setSelectedItems] = useState(new Set())
  // State for upload
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState({})
  const [lifestyleResults, setLifestyleResults] = useState({})
  const [editorState, setEditorState] = useState(null)
  const productNames = useMemo(() => {
    const uniqueProducts = new Set(
      data
        .map((row) => String(row.sanPham || '').trim())
        .filter(Boolean)
    )
    return Array.from(uniqueProducts)
  }, [data])

  const filteredRowsWithIndex = useMemo(() => {
    const rowsWithIndex = data.map((row, globalIndex) => ({ row, globalIndex }))
    if (selectedProduct === 'ALL') {
      return rowsWithIndex
    }

    return rowsWithIndex.filter(({ row }) => String(row.sanPham || '').trim() === selectedProduct)
  }, [data, selectedProduct])

  const totalPages = Math.max(1, Math.ceil(filteredRowsWithIndex.length / pageSize))

  useEffect(() => {
    // Listen for event from Navbar "Get Data" button
    const handleGetDataEvent = () => {
      handleGetData()
    }

    window.addEventListener('holoarcylicGetData', handleGetDataEvent)
    return () => window.removeEventListener('holoarcylicGetData', handleGetDataEvent)
  }, [])

  const paginatedData = useMemo(
    () => filteredRowsWithIndex.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredRowsWithIndex, currentPage, pageSize]
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [selectedProduct])

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

  const getLifestyleFiles = async (globalIndex) => {
    const lifestyle = lifestyleResults[globalIndex]
    const previewImages = getLifestylePreviewImages(lifestyle)

    if (!previewImages.length) {
      throw new Error('Vui lòng tạo ảnh lifestyle trước khi upload')
    }

    const files = await Promise.all(
      previewImages.map(async (previewImage, imageIndex) => {
        const src = `data:${previewImage.mimeType || 'image/png'};base64,${previewImage.base64}`
        const blob = await fetch(src).then((response) => response.blob())
        return new File([blob], `holoarcylic-lifestyle-${globalIndex}-${imageIndex + 1}.png`, {
          type: previewImage.mimeType || 'image/png',
        })
      })
    )

    return files
  }

  const summarizeFileForLog = (file) => ({
    name: file?.name || null,
    size: file?.size || 0,
    type: file?.type || null,
    lastModified: file?.lastModified || null,
  })

  const handleApplyEditorChanges = async ({ dataUrl }) => {
    if (!editorState) {
      return
    }

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
    }
  }

  const handleCreateMaster = async (globalIndex, imageLink) => {
    // console.log('Create Master clicked:', { imageLink })

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
      const productName = data[globalIndex]?.sanPham || 'product'
      const productPrefix = `The product is a ${productName}. Automatically detect and preserve its correct material, physical properties, and real-world appearance based on this product type.\n\n`
      const fullPrompt = productPrefix + PROMPTS.holographicOrnament
      
      const result = await redesignImage(imageLink, null, fullPrompt)
      setRedesignResults((prev) => ({
        ...prev,
        [globalIndex]: { loading: false, base64: result.base64, mimeType: result.mimeType, error: null },
      }))
    } catch (err) {
      setRedesignResults((prev) => ({
        ...prev,
        [globalIndex]: { loading: false, base64: null, mimeType: null, error: err.message },
      }))
    }
  }

  const startItemIndex = filteredRowsWithIndex.length ? (currentPage - 1) * pageSize + 1 : 0
  const endItemIndex = Math.min(currentPage * pageSize, filteredRowsWithIndex.length)

  const handleGetData = async () => {
    let interval;

    try {
      // Check for manual sheet URL in localStorage first
      let sheetUrl = localStorage.getItem('holoarcylicSheetUrl');
      
      // Fallback to config service if no manual URL
      if (!sheetUrl) {
        sheetUrl = await getSheetUrlForPage('holoarcylic');
      }
      
      const { id: sheetId, gid } = extractSheetInfo(sheetUrl);

      if (!sheetId) {
        setError('Link sheet từ config không hợp lệ');
        return;
      }

      setIsLoading(true);
      setProgress(0);
      setError('');
      setData([]);
      setSelectedProduct('ALL');
      setCurrentPage(1);

      interval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
      const response = await fetch(csvUrl);

      if (!response.ok) {
        throw new Error('Không thể truy cập sheet. Đảm bảo sheet được chia sẻ công khai.');
      }

      const csvData = await response.text();
      const rows = parseCSV(csvData);

      const filteredRows = rows
        .filter((row) => {
          const statusValue = getValueByAliases(row, ['TRẠNG THÁI', 'Status']);
          if (statusValue) return false;
          const redesignValue = getValueByAliases(row, ['REDESIGN', 'REDESIGN']);
          if (redesignValue) return false;
          const sanPham = getValueByAliases(row, ['SẢN PHẨM']);
          if (sanPham && normalizeHeader(sanPham) === 'suncatcher') return false;
          return true;
        })
        .map((row) => ({
          stt: getValueByAliases(row, ['STT', 'Stt']),
          keyword: getValueByAliases(row, ['KEYWORD', 'Keyword']),
          imageLink: getValueByAliases(row, ['LINK ẢNH', 'LINK ANH', 'Link ảnh', 'Image link', 'Link image']),
          sanPham: getValueByAliases(row, ['SẢN PHẨM']),
        }));

      clearInterval(interval);
      setProgress(100);
      setData(filteredRows);
    } catch (err) {
      if (interval) clearInterval(interval);
      setError(err.message || 'Không thể lấy dữ liệu từ sheet');
    } finally {
      setIsLoading(false);
      setProgress(0);
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
      const result = await generateLifestyleImage({
        file: null,
        imageUrl: `data:${redesign.mimeType};base64,${redesign.base64}`,
        keyword: data[globalIndex]?.keyword || '',
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

  const handleUploadSingle = async (globalIndex) => {
    const redesign = redesignResults[globalIndex]
    if (!redesign?.base64) {
      alert('Không có ảnh redesign để upload')
      return
    }

    setIsUploading(true)
    setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'uploading' }))

    try {
      // Get sheet URL
      let sheetUrl = localStorage.getItem('holoarcylicSheetUrl')
      if (!sheetUrl) {
        sheetUrl = await getSheetUrlForPage('holoarcylic')
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
      const lifestyleFiles = await getLifestyleFiles(globalIndex)
      const row = data[globalIndex]

      if (!lifestyleFiles.length) {
        throw new Error('Vui lòng chọn ảnh lifestyle trước khi upload')
      }

      const redesignSrc = `data:${redesign.mimeType};base64,${redesign.base64}`
      const redesignBlob = await fetch(redesignSrc).then((r) => r.blob())
      const redesignFile = new File([redesignBlob], `holoarcylic-redesign-${globalIndex}.png`, { type: 'image/png' })

      console.log('🚀 [HoloarcylicPage] Starting single image upload', {
        globalIndex,
        keyword: row?.keyword || null,
        stt,
        sourceImageLink: row?.imageLink || null,
        redesignImage: {
          mimeType: redesign?.mimeType || null,
          base64Length: redesign?.base64?.length || 0,
        },
        lifestylePreviewCount: getLifestylePreviewImages(lifestyleResults[globalIndex]).length,
      })

      console.log('📤 [HoloarcylicPage] Single update payload', {
        globalIndex,
        sheetId,
        gid,
        stt,
        keyword: row?.keyword || null,
        redesignFile: summarizeFileForLog(redesignFile),
        lifestyleFiles: lifestyleFiles.map(summarizeFileForLog),
        accessTokenPreview: accessToken ? accessToken.substring(0, 20) + '...' : null,
      })

      const response = await updateDesignPageImages({
        sheetId,
        gid,
        accessToken,
        stt,
        redesignImageFile: redesignFile,
        lifestyleImageFiles: lifestyleFiles,
        pageKey: 'holoarcylic',
      })

      console.log('✅ [HoloarcylicPage] Single image upload success', {
        globalIndex,
        keyword: row?.keyword || null,
        stt,
        response,
      })

      setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'done' }))
    } catch (err) {
      console.error('❌ [HoloarcylicPage] Single image upload failed', {
        globalIndex,
        keyword: data[globalIndex]?.keyword || null,
        stt: data[globalIndex]?.stt ?? (globalIndex + 1),
        error: err,
      })
      setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'error' }))
      alert('Upload lỗi: ' + err.message)
    } finally {
      setIsUploading(false)
    }
  }

  const handleUploadBatch = async () => {
    if (selectedItems.size === 0) {
      alert('Vui lòng chọn ít nhất 1 ô để upload')
      return
    }

    setIsUploading(true)

    // Get sheet URL
    let sheetUrl = localStorage.getItem('holoarcylicSheetUrl')
    if (!sheetUrl) {
      sheetUrl = await getSheetUrlForPage('holoarcylic')
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

    // Initialize all selected items to "uploading"
    const newStatus = {}
    selectedItems.forEach((idx) => {
      newStatus[idx] = 'uploading'
    })
    setUploadStatus((prev) => ({ ...prev, ...newStatus }))

    let successCount = 0
    let errorCount = 0

    console.log('🚀 [HoloarcylicPage] Starting batch image upload', {
      selectedCount: selectedItems.size,
      selectedIndexes: Array.from(selectedItems),
      sheetId,
      gid,
      accessTokenPreview: accessToken ? accessToken.substring(0, 20) + '...' : null,
    })

    // Upload each selected item
    for (const globalIndex of Array.from(selectedItems)) {
      try {
        const redesign = redesignResults[globalIndex]
        if (!redesign?.base64) {
          setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'error' }))
          continue
        }

        const stt = data[globalIndex]?.stt ?? (globalIndex + 1)
        const row = data[globalIndex]
        const lifestyleFiles = await getLifestyleFiles(globalIndex)

        if (!lifestyleFiles.length) {
          throw new Error('Vui lòng chọn ảnh lifestyle trước khi upload')
        }

        const redesignSrc = `data:${redesign.mimeType};base64,${redesign.base64}`
        const redesignBlob = await fetch(redesignSrc).then((r) => r.blob())
        const redesignFile = new File([redesignBlob], `holoarcylic-redesign-${globalIndex}.png`, { type: 'image/png' })

        console.log('🧾 [HoloarcylicPage] Batch item prepared', {
          globalIndex,
          keyword: row?.keyword || null,
          stt,
          sourceImageLink: row?.imageLink || null,
          redesignImage: {
            mimeType: redesign?.mimeType || null,
            base64Length: redesign?.base64?.length || 0,
          },
          lifestylePreviewCount: getLifestylePreviewImages(lifestyleResults[globalIndex]).length,
        })

        console.log('📤 [HoloarcylicPage] Batch update payload', {
          globalIndex,
          sheetId,
          gid,
          stt,
          keyword: row?.keyword || null,
          redesignFile: summarizeFileForLog(redesignFile),
          lifestyleFiles: lifestyleFiles.map(summarizeFileForLog),
          accessTokenPreview: accessToken ? accessToken.substring(0, 20) + '...' : null,
        })

        const response = await updateDesignPageImages({
          sheetId,
          gid,
          accessToken,
          stt,
          redesignImageFile: redesignFile,
          lifestyleImageFiles: lifestyleFiles,
          pageKey: 'holoarcylic',
        })

        console.log('✅ [HoloarcylicPage] Batch item upload success', {
          globalIndex,
          keyword: row?.keyword || null,
          stt,
          response,
        })

        successCount += 1
        setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'done' }))
      } catch (err) {
        console.error('❌ [HoloarcylicPage] Batch item upload failed', {
          globalIndex,
          keyword: data[globalIndex]?.keyword || null,
          stt: data[globalIndex]?.stt ?? (globalIndex + 1),
          error: err,
        })
        errorCount += 1
        setUploadStatus((prev) => ({ ...prev, [globalIndex]: 'error' }))
      }
    }

    console.log('🏁 [HoloarcylicPage] Batch image upload completed', {
      selectedCount: selectedItems.size,
      successCount,
      errorCount,
    })

    setIsUploading(false)
    alert('Upload hoàn tất!')
    setSelectedItems(new Set())
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-zinc-100/95 p-6 text-zinc-800">
        {editorState ? (
          <ImagePreviewEditorModal
            asset={{
              src: editorState.src,
              title: editorState.title,
              description: editorState.description,
            }}
            onClose={() => setEditorState(null)}
            onApply={handleApplyEditorChanges}
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
          Design Workspace ({filteredRowsWithIndex.length} Items)
        </h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelectedProduct('ALL')}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                selectedProduct === 'ALL'
                  ? 'border-indigo-500 bg-indigo-500 text-white'
                  : 'border-zinc-300 bg-white text-zinc-700 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              ALL
            </button>
            {productNames.map((productName) => (
              <button
                key={productName}
                onClick={() => setSelectedProduct(productName)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  selectedProduct === productName
                    ? 'border-indigo-500 bg-indigo-500 text-white'
                    : 'border-zinc-300 bg-white text-zinc-700 hover:border-indigo-300 hover:text-indigo-600'
                }`}
              >
                {productName}
              </button>
            ))}
          </div>

          {selectedItems.size > 0 && (
            <button
              onClick={handleUploadBatch}
              disabled={isUploading}
              className="rounded-lg bg-blue-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {isUploading ? `⏳ Uploading (${Object.values(uploadStatus).filter((s) => s === 'done').length}/${selectedItems.size})...` : `📤 Upload ${selectedItems.size} Selected`}
            </button>
          )}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
          Chưa có dữ liệu. Hãy nhập link sheet và bấm Get Dữ Liệu.
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-5">
            {paginatedData.map(({ row, globalIndex }, index) => {
              const itemNumber = (currentPage - 1) * pageSize + index + 1
              const hasImage = isValidImageUrl(row.imageLink)
              const redesign = redesignResults[globalIndex]
              const lifestyle = lifestyleResults[globalIndex]
              const lifestylePreviewImages = getLifestylePreviewImages(lifestyle)

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
                        {row.keyword || `Holographic Ornament ${itemNumber}`}
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
                            className={`px-2 py-1 text-xs font-semibold rounded transition ${
                              uploadStatus[globalIndex] === 'done'
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

                  <div className="grid gap-5 xl:grid-cols-3">
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
                                src: `data:${redesign.mimeType};base64,${redesign.base64}`,
                                title: `${row.keyword || `Item ${itemNumber}`} redesign`,
                                description: 'Lưu chỉnh sửa sẽ cập nhật ảnh redesign hiện tại và reset lifestyle để tránh lệch dữ liệu.',
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
                        Focus: {row.keyword || '2D Holographic Acrylic Ornament style.'}
                      </p>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                          3. LIFESTYLE CONTEXTS
                        </span>
                        {redesign?.base64 && (
                          <button
                            onClick={() => handleGenerateLifestyle(globalIndex)}
                            disabled={lifestyle?.loading}
                            className="text-xs font-medium text-emerald-500 hover:text-emerald-700 disabled:opacity-40"
                          >
                            {lifestyle?.loading ? '⏳ Đang tạo...' : '✨ Lifestyle'}
                          </button>
                        )}
                      </div>
                      <div className="flex h-96 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-100 overflow-hidden">
                        {lifestyle?.loading ? (
                          <div className="flex flex-col items-center gap-2 text-zinc-400">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                            <span className="text-xs">Đang tạo lifestyle với AI...</span>
                          </div>
                        ) : lifestylePreviewImages.length > 0 ? (
                          <div className="h-full w-full overflow-auto p-2">
                            <div className="grid grid-cols-2 gap-2">
                              {lifestylePreviewImages.map((image, imageIndex) => (
                                <img
                                  key={`${globalIndex}-lifestyle-${imageIndex}`}
                                  src={`data:${image.mimeType || 'image/png'};base64,${image.base64}`}
                                  alt={`lifestyle-result-${row.keyword}-${imageIndex + 1}`}
                                  className="h-44 w-full cursor-zoom-in rounded-lg object-cover"
                                  loading="lazy"
                                  onClick={() =>
                                    setEditorState({
                                      kind: 'lifestyle',
                                      globalIndex,
                                      imageIndex,
                                      src: `data:${image.mimeType || 'image/png'};base64,${image.base64}`,
                                      title: `${row.keyword || `Item ${itemNumber}`} lifestyle ${imageIndex + 1}`,
                                      description: 'Ảnh lifestyle sau khi lưu sẽ thay trực tiếp vào ô preview hiện tại.',
                                    })
                                  }
                                />
                              ))}
                            </div>
                          </div>
                        ) : lifestyle?.error ? (
                          <div className="flex flex-col items-center gap-1 px-4 text-center">
                            <span className="text-2xl">⚠️</span>
                            <span className="text-xs text-red-500">{lifestyle.error}</span>
                          </div>
                        ) : lifestyle?.raw ? (
                          <div className="px-4 text-center text-xs text-zinc-500">
                            Backend đã trả dữ liệu lifestyle nhưng không có ảnh để preview.
                          </div>
                        ) : !redesign?.base64 ? (
                          <span className="text-sm text-zinc-400">Bấm ✨ Create Master để tạo redesign trước</span>
                        ) : (
                          <span className="text-sm text-zinc-400">Bấm ✨ Lifestyle để tạo ảnh lifestyle</span>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-zinc-500 italic">
                        Focus: Places existing design into premium interior environments.
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
              </select>
              <span>items/trang</span>
            </div>

            <div className="text-sm text-zinc-600">
              Hiển thị {startItemIndex}-{endItemIndex} / {filteredRowsWithIndex.length}
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
    </section>
  )
}

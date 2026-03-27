import { useEffect, useRef, useState } from 'react'
import { uploadFilesToBackend, testBackendConnection } from '../services/googleDriveService'
import { removeBackgroundSmart, REMOVAL_MODES } from '../services/backgroundRemovalService'
import {
  CloudUpload,
  Download,
  ImageOff,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { PROMPTS } from '../prompt/Prompts'
import { analyzeComboImage, generateComboStickerImage } from '../services/geminiService'

// ==================== CANVAS UTILS ====================

const removeWhiteBackground = (base64, mimeType = 'image/png') =>
  removeBackgroundSmart(base64, mimeType, REMOVAL_MODES.PIXEL_THRESHOLD)

const dataUrlToBlob = async (dataUrl) => {
  const response = await fetch(dataUrl)
  if (!response.ok) {
    throw new Error('Không thể chuyển data URL sang blob')
  }
  return response.blob()
}

const sanitizeFilename = (value = '') =>
  String(value)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .toLowerCase()

const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0))

const renderWithFiltersToDataUrl = (src, filters) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.filter = [
        `brightness(${filters.brightness}%)`,
        `contrast(${filters.contrast}%)`,
        `saturate(${filters.saturation}%)`,
        `hue-rotate(${filters.hue}deg)`,
        `sepia(${filters.sepia}%)`,
      ].join(' ')
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = src
  })

const downloadAsset = (url, filename) => {
  const link = document.createElement('a')
  link.download = filename
  link.href = url
  link.click()
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
// ==================== IMAGE EDITOR MODAL ====================

const DEFAULT_FILTERS = { brightness: 100, contrast: 100, saturation: 100, hue: 0, sepia: 0 }

const SLIDERS = [
  { key: 'brightness', label: 'Brightness', min: 0, max: 200 },
  { key: 'contrast', label: 'Contrast', min: 0, max: 200 },
  { key: 'saturation', label: 'Saturation', min: 0, max: 200 },
  { key: 'hue', label: 'Hue', min: -180, max: 180 },
  { key: 'sepia', label: 'Sepia', min: 0, max: 100 },
]

function ImageEditorModal({ item, onClose, onRedesign, onGenerateSimilar }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [redesignText, setRedesignText] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyMessage, setBusyMessage] = useState('')

  const imgSrc = item.previewUrl || item.transparentDataUrl || `data:${item.mimeType};base64,${item.base64}`

  const filterStyle = {
    filter: [
      `brightness(${filters.brightness}%)`,
      `contrast(${filters.contrast}%)`,
      `saturate(${filters.saturation}%)`,
      `hue-rotate(${filters.hue}deg)`,
      `sepia(${filters.sepia}%)`,
    ].join(' '),
  }

  const handleSlider = (key, value) => setFilters((prev) => ({ ...prev, [key]: Number(value) }))

  const handleRedesign = async () => {
    if (!redesignText.trim() || busy) return
    setBusy(true)
    setBusyMessage('Redesigning…')
    try {
      await onRedesign(item, redesignText.trim())
      onClose()
    } catch (err) {
      setBusyMessage(err.message || 'Redesign failed')
    } finally {
      setBusy(false)
    }
  }

  const handleSimilar = async () => {
    if (busy) return
    setBusy(true)
    setBusyMessage('Generating similar…')
    try {
      await onGenerateSimilar(item)
      onClose()
    } catch (err) {
      setBusyMessage(err.message || 'Generate similar failed')
    } finally {
      setBusy(false)
    }
  }

  const handleDownload = async () => {
    const rendered = await renderWithFiltersToDataUrl(imgSrc, filters)
    downloadAsset(rendered, `sticker-${item.objectName}.png`)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: preview */}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-100 p-6">
          <div
            className="flex h-64 w-64 items-center justify-center rounded-xl"
            style={{
              backgroundImage: 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%)',
              backgroundSize: '12px 12px',
            }}
          >
            <img
              src={imgSrc}
              alt={item.objectName}
              className="h-full w-full object-contain"
              style={filterStyle}
            />
          </div>
          <p className="text-sm font-semibold text-zinc-700">{item.objectName}</p>
        </div>

        {/* Right: controls */}
        <div className="flex w-72 flex-col overflow-y-auto border-l border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <p className="font-semibold text-zinc-700">Image Editor</p>
            <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {SLIDERS.map(({ key, label, min, max }) => (
              <div key={key}>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-600">{label}</label>
                  <span className="text-xs text-zinc-400">{filters[key]}</span>
                </div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  value={filters[key]}
                  onChange={(e) => handleSlider(key, e.target.value)}
                  className="w-full accent-indigo-500"
                />
              </div>
            ))}

            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="text-xs text-zinc-400 underline hover:text-zinc-600"
            >
              Reset filters
            </button>

            <div className="border-t border-zinc-100 pt-4">
              <label className="mb-1 block text-xs font-semibold text-zinc-600">
                What would you like to change?
              </label>
              <div className="flex gap-2">
                <input
                  value={redesignText}
                  onChange={(e) => setRedesignText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRedesign()}
                  placeholder="e.g. Make it red, add bow…"
                  className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-xs text-zinc-700 outline-none focus:border-indigo-300"
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={handleRedesign}
                  disabled={!redesignText.trim() || busy}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-white disabled:opacity-40"
                >
                  {busy && busyMessage.startsWith('Redesign') ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>

            {busyMessage ? <p className="text-xs text-zinc-500">{busyMessage}</p> : null}
          </div>

          <div className="space-y-2 border-t border-zinc-200 p-4">
            <button
              type="button"
              onClick={handleSimilar}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-40"
            >
              {busy && busyMessage.startsWith('Generating') ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 text-violet-500" />
              )}
              Generate Similar
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-700 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ==================== STICKER CARD ====================

function StickerCard({ item, index, onEdit, onSimilar, onDelete }) {
  const [hovering, setHovering] = useState(false)
  const imgSrc = item.previewUrl || item.transparentDataUrl || `data:${item.mimeType};base64,${item.base64}`

  const handleDownload = (e) => {
    e.stopPropagation()
    downloadAsset(imgSrc, `sticker-${item.objectName}.png`)
  }

  return (
    <article
      className="group relative cursor-pointer overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={() => onEdit(item)}
    >
      <div
        className="flex aspect-square items-center justify-center p-3"
        style={{
          backgroundImage: 'repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%)',
          backgroundSize: '12px 12px',
        }}
      >
        <img src={imgSrc} alt={item.objectName} className="h-full w-full object-contain" />
      </div>

      {hovering ? (
        <div className="absolute inset-0 flex items-end justify-end gap-2 bg-black/20 p-3">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(item) }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white shadow-md transition hover:bg-red-600"
            title="Xóa ảnh này"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSimilar(item) }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-500 text-white shadow-md transition hover:bg-violet-600"
            title="Generate Similar"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-700 text-white shadow-md transition hover:bg-zinc-800"
            title="Download"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div className="border-t border-zinc-100 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Sticker #{index + 1}</p>
        <p className="mt-1 text-sm font-medium text-zinc-700">{item.objectName}</p>
      </div>
    </article>
  )
}

// ==================== MAIN PAGE ====================





export default function ComboStickerPage() {
  // Google Drive settings
  const [globalAccessToken, setGlobalAccessToken] = useState(() => {
    return localStorage.getItem('googleDriveAccessToken') || '';
  });
  const [globalSheetData, setGlobalSheetData] = useState(() => {
    const data = localStorage.getItem('comboStickerSheetData');
    return data ? JSON.parse(data) : null;
  });
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [testingConnection, setTestingConnection] = useState(false);

  // Listen for changes from navbar
  useEffect(() => {
    const handleStorageChange = () => {
      const token = localStorage.getItem('googleDriveAccessToken') || '';
      setGlobalAccessToken(prev => prev !== token ? token : prev);

      const sheetDataStr = localStorage.getItem('comboStickerSheetData');
      const sheetData = sheetDataStr ? JSON.parse(sheetDataStr) : null;
      setGlobalSheetData(prev => JSON.stringify(prev) !== sheetDataStr ? sheetData : prev);
    };

    window.addEventListener('storage', handleStorageChange);
    // Also check periodically for local changes
    const interval = setInterval(() => {
      const token = localStorage.getItem('googleDriveAccessToken') || '';
      setGlobalAccessToken(prev => prev !== token ? token : prev);

      const sheetDataStr = localStorage.getItem('comboStickerSheetData');
      const sheetData = sheetDataStr ? JSON.parse(sheetDataStr) : null;
      setGlobalSheetData(prev => JSON.stringify(prev) !== sheetDataStr ? sheetData : prev);
    }, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Hàm upload tất cả ảnh lên Drive & Sheet
  const handleUploadAll = async (idx) => {
    const ws = workspaces[idx];
    if (!ws.keyword || !ws.keyword.trim()) {
      alert('Vui lòng nhập Keyword trước khi upload!');
      return;
    }
    if (!globalSheetData || !globalSheetData.sheetId) {
      alert('Vui lòng nhập URL Google Sheet trong thanh nav!');
      return;
    }
    if (!globalAccessToken || !globalAccessToken.trim()) {
      alert('Vui lòng cấu hình Access Token trong thanh nav!');
      return;
    }
    if (!ws.generatedResults.length) {
      alert('Không có ảnh nào để upload!');
      return;
    }

    // Sử dụng sheetId từ globalSheetData
    const sheetId = globalSheetData.sheetId;

    setUploading(true);
    setUploadResult(null);
    try {
      // Chuẩn bị files: ảnh gốc + generated
      const files = [];
      // Ảnh gốc (nếu có)
      if (ws.imageFile) {
        files.push(ws.imageFile);
      } else if (ws.imageSourceUrl) {
        const sourceBlob = await fetch(ws.imageSourceUrl).then((response) => {
          if (!response.ok) {
            throw new Error('Không thể tải ảnh gốc từ URL');
          }
          return response.blob();
        });
        const originalFile = new File([sourceBlob], `original-${Date.now()}.jpg`, {
          type: sourceBlob.type || 'image/jpeg',
        });
        files.push(originalFile);
      }
      // Generated images
      for (const item of ws.generatedResults) {
        if (item.imageFile) {
          files.push(item.imageFile);
          continue;
        }

        const blob = await fetch(item.previewUrl).then(r => r.blob());
        const file = new File([blob], `sticker-${item.objectName}.png`, { type: 'image/png' });
        files.push(file);
      }

      if (!files.length) {
        throw new Error('Không có file hợp lệ để upload');
      }

      console.log('📤 [ComboStickerPage] Upload to google/upload', {
        keyword: ws.keyword,
        sheetId,
        gid: globalSheetData.gid,
        fileCount: files.length,
        files: files.map((file) => ({ name: file.name, size: file.size, type: file.type })),
      });

      const result = await uploadFilesToBackend(files, ws.keyword, sheetId, globalAccessToken, globalSheetData.gid, null, 'combosticker');
      setUploadResult(result);
      alert('Upload thành công!');
    } catch (err) {
      alert('Upload lỗi: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  // Test connection đến backend
  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const isConnected = await testBackendConnection();
      if (isConnected) {
        alert('✅ Kết nối backend thành công!');
      } else {
        alert('❌ Không thể kết nối đến backend. Kiểm tra network và endpoint.');
      }
    } catch (error) {
      alert('❌ Lỗi khi test connection: ' + error.message);
    } finally {
      setTestingConnection(false);
    }
  };
  // Workspace state: array of workspace objects
  const [workspaces, setWorkspaces] = useState([
    {
      id: Date.now(),
      imageFile: null,
      previewUrl: '',
      imageSourceUrl: '',
      targetOutput: '10',
      statusNote: '',
      dropMessage: 'Upload from your computer or drag an Etsy/Amazon image into this panel.',
      dragActive: false,
      isRunning: false,
      runProgress: 0,
      runMessage: 'Ready for analysis',
      analysisResult: null,
      generatedResults: [],
      editingItem: null,
    },
  ])
  const [activeIdx, setActiveIdx] = useState(0)
  const fileInputRefs = useRef([])

  const revokeGeneratedItem = (item) => {
    if (item?.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(item.previewUrl)
    }
  }

  const revokeGeneratedItems = (items = []) => {
    items.forEach(revokeGeneratedItem)
  }

  // Helper to update workspace by index
  const updateWorkspace = (idx, patch) => {
    setWorkspaces((prev) => {
      const arr = [...prev]
      arr[idx] = { ...arr[idx], ...patch }
      return arr
    })
  }

  // Helper to reset workspace state
  const getDefaultWorkspace = () => ({
    id: Date.now() + Math.random(),
    imageFile: null,
    previewUrl: '',
    imageSourceUrl: '',
    targetOutput: '10',
    keyword: '',
    statusNote: '',
    dropMessage: 'Upload from your computer or drag an Etsy/Amazon image into this panel.',
    dragActive: false,
    isRunning: false,
    runProgress: 0,
    runMessage: 'Ready for analysis',
    analysisResult: null,
    generatedResults: [],
    editingItem: null,
  })

  // Clean up blob URLs on workspace change
  useEffect(() => {
    return () => {
      workspaces.forEach((ws) => {
        if (ws.previewUrl && ws.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(ws.previewUrl)
        }
        revokeGeneratedItems(ws.generatedResults)
      })
    }
    // eslint-disable-next-line
  }, [])

  // Process image: strip white bg → return enriched item
  const processItem = async (raw) => {
    await yieldToBrowser()
    const transparentDataUrl = await removeWhiteBackground(raw.base64, raw.mimeType)
    const imageBlob = await dataUrlToBlob(transparentDataUrl)
    const safeName = sanitizeFilename(raw.objectName || `sticker-${Date.now()}`)
    const imageFile = new File([imageBlob], `sticker-${safeName}.png`, { type: 'image/png' })

    return {
      id: raw.id,
      objectName: raw.objectName,
      mimeType: 'image/png',
      imageFile,
      previewUrl: URL.createObjectURL(imageBlob),
    }
  }

  // ── Upload helpers ──────────────────────────────────────────────────────────


  // Workspace-specific upload helpers
  const updatePreviewFromFile = (idx, file) => {
    const ws = workspaces[idx]
    if (ws.previewUrl && ws.previewUrl.startsWith('blob:')) URL.revokeObjectURL(ws.previewUrl)
    revokeGeneratedItems(ws.generatedResults)
    updateWorkspace(idx, {
      imageFile: file,
      imageSourceUrl: '',
      previewUrl: URL.createObjectURL(file),
      generatedResults: [],
      analysisResult: null,
      runProgress: 0,
      runMessage: 'Ready for analysis',
      dropMessage: `Loaded: ${file.name}`,
    })
  }

  const updatePreviewFromUrl = (idx, url) => {
    const ws = workspaces[idx]
    if (ws.previewUrl && ws.previewUrl.startsWith('blob:')) URL.revokeObjectURL(ws.previewUrl)
    revokeGeneratedItems(ws.generatedResults)
    updateWorkspace(idx, {
      imageFile: null,
      imageSourceUrl: url,
      previewUrl: url,
      generatedResults: [],
      analysisResult: null,
      runProgress: 0,
      runMessage: 'Ready for analysis',
      dropMessage: 'Loaded external image URL.',
    })
  }

  const handleFileChange = (idx, e) => {
    const file = e.target.files?.[0]
    if (file) updatePreviewFromFile(idx, file)
  }

  const isValidRemoteImageUrl = (val) =>
    /^https?:\/\/[^\s]+\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(val)

  const extractUrlFromDrop = (event) => {
    const uriList = event.dataTransfer.getData('text/uri-list')
    if (uriList) return uriList.split('\n').find((l) => l && !l.startsWith('#')) || ''
    const plain = event.dataTransfer.getData('text/plain')
    if (isValidRemoteImageUrl(plain)) return plain
    const html = event.dataTransfer.getData('text/html')
    const match = html.match(/https?:\/\/[^\s"']+\.(jpg|jpeg|png|webp|gif|svg)(\?[^\s"']*)?/i)
    return match?.[0] || ''
  }


  const handleDrop = (idx, event) => {
    event.preventDefault()
    updateWorkspace(idx, { dragActive: false })
    const file = event.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) { updatePreviewFromFile(idx, file); return }
    const url = extractUrlFromDrop(event)
    if (url) { updatePreviewFromUrl(idx, url); return }
    updateWorkspace(idx, { dropMessage: 'Only image files or direct image URLs are supported.' })
  }

  // ── Analysis ────────────────────────────────────────────────────────────────

  const normalizeObjectsToTarget = (objects, count) => {
    const cleaned = objects
      .map((item) => {
        if (typeof item === 'string') return item.trim()
        if (item && typeof item === 'object') {
          const label = item.label || item.name || item.object || ''
          return String(label).trim()
        }
        return ''
      })
      .filter(Boolean)

    const unique = [...new Set(cleaned)]
    if (!unique.length) return []
    return unique.slice(0, count)
  }


  const handleRunAnalysis = async (idx) => {
    const ws = workspaces[idx]
    if (!ws.previewUrl || ws.isRunning) return
    const count = Number(ws.targetOutput)
    revokeGeneratedItems(ws.generatedResults)
    updateWorkspace(idx, {
      isRunning: true,
      runProgress: 5,
      runMessage: 'Analyzing combo image…',
      generatedResults: [],
    })

    try {
      const analysis = await analyzeComboImage({
        file: ws.imageFile,
        imageUrl: ws.imageSourceUrl,
        keyword: ws.keyword,
        targetOutput: count,
        prompt: PROMPTS.combostickerAnalyze,
      })

      // Đảm bảo lấy đúng số lượng object theo targetOutput
      const objects = normalizeObjectsToTarget(analysis.objects, count)
      if (!objects.length) {
        throw new Error('Không tách được sticker riêng lẻ từ ảnh combo. Vui lòng thử ảnh nguồn rõ hơn.')
      }
      // Log để debug số lượng object và count
      console.log('Target Output:', count)
      console.log('Objects after normalize:', objects)
      const normalized = { ...analysis, objects }
      updateWorkspace(idx, { analysisResult: normalized, runProgress: 20 })

      const results = []
      for (let i = 0; i < objects.length; i += 1) {
        const objectName = objects[i]
        updateWorkspace(idx, { runMessage: `Generating ${i + 1}/${objects.length}: ${objectName}` })
        try {
          const image = await generateComboStickerImage({
            file: ws.imageFile,
            imageUrl: ws.imageSourceUrl,
            objectName,
            keyword: ws.keyword,
            theme: normalized.theme,
            style: normalized.style,
            colorPalette: normalized.colorPalette,
            prompt: PROMPTS.combostickerGenerate,
          })

          const processed = await processItem({
            id: `${objectName}-${i + 1}`,
            objectName,
            base64: image.base64,
            mimeType: image.mimeType,
          })

          results.push(processed)
          updateWorkspace(idx, { generatedResults: [...results] })
          updateWorkspace(idx, { runProgress: 20 + Math.round(((i + 1) / objects.length) * 80) })
        } catch (err) {
          console.error(`Error generating image for object '${objectName}' (index ${i}):`, err)
        }
        await sleep(250)
      }

      updateWorkspace(idx, { runMessage: `Completed ${results.length} sticker outputs` })
    } catch (err) {
      updateWorkspace(idx, { runMessage: err.message || 'Analysis failed' })
    } finally {
      updateWorkspace(idx, { isRunning: false })
    }
  }

  // ── Add More ────────────────────────────────────────────────────────────────


  // Add image: chỉ generate cho object chưa có ảnh
  const handleAddMore = async (idx) => {
    const ws = workspaces[idx]
    if (!ws.analysisResult || ws.isRunning) return
    // Lấy danh sách object gốc backend trả về (không normalize, không thêm hậu tố)
    const objects = ws.analysisResult.raw?.objects || ws.analysisResult.objects || []
    // Lấy object chưa có ảnh (theo thứ tự)
    const generatedNames = ws.generatedResults.map((r) => r.objectName)
    const remaining = objects.filter((obj) => {
      const name = typeof obj === 'string' ? obj : obj.label || obj.name || obj.object || ''
      return !generatedNames.includes(name)
    })
    if (!remaining.length) return
    const pickObj = remaining[0]
    const pick = typeof pickObj === 'string' ? pickObj : pickObj.label || pickObj.name || pickObj.object || ''
    updateWorkspace(idx, { isRunning: true, runMessage: `Adding: ${pick}` })
    try {
      const image = await generateComboStickerImage({
        file: ws.imageFile,
        imageUrl: ws.imageSourceUrl,
        objectName: pick,
        keyword: ws.keyword,
        theme: ws.analysisResult.theme,
        style: ws.analysisResult.style,
        colorPalette: ws.analysisResult.colorPalette,
        prompt: PROMPTS.combostickerGenerate,
      })
      const processed = await processItem({
        id: `${pick}-${Date.now()}`,
        objectName: pick,
        base64: image.base64,
        mimeType: image.mimeType,
      })
      updateWorkspace(idx, { generatedResults: [...ws.generatedResults, processed], runMessage: `Added: ${pick}` })
    } catch (err) {
      updateWorkspace(idx, { runMessage: err.message || 'Add image failed' })
    } finally {
      updateWorkspace(idx, { isRunning: false })
    }
  }

  // ── Generate Similar ────────────────────────────────────────────────────────

  const handleGenerateSimilar = async (idx, item) => {
    const ws = workspaces[idx]
    if (!ws || ws.isRunning) return
    updateWorkspace(idx, { isRunning: true, runMessage: `Generating similar to: ${item.objectName}` })
    try {
      const file = item.imageFile || await fetch(item.previewUrl)
        .then((r) => r.blob())
        .then((blob) => new File([blob], 'similar.png', { type: 'image/png' }))

      const image = await generateComboStickerImage({
        file,
        imageUrl: '',
        objectName: item.objectName,
        keyword: ws.keyword || item.objectName,
        theme: ws.analysisResult?.theme || '',
        style: ws.analysisResult?.style || '',
        colorPalette: ws.analysisResult?.colorPalette || [],
        prompt: PROMPTS.combostickerGenerate,
      })

      const processed = await processItem({
        id: `${item.objectName}-similar-${Date.now()}`,
        objectName: `${item.objectName} (Similar)`,
        base64: image.base64,
        mimeType: image.mimeType,
      })
      updateWorkspace(idx, {
        generatedResults: [...ws.generatedResults, processed],
        runMessage: `Generated similar to: ${item.objectName}`,
      })
    } catch (err) {
      updateWorkspace(idx, { runMessage: err.message || 'Generate similar failed' })
      throw err
    } finally {
      updateWorkspace(idx, { isRunning: false })
    }
  }

  const handleDeleteGeneratedItem = (idx, itemToDelete) => {
    const ws = workspaces[idx]
    if (!ws) return

    revokeGeneratedItem(itemToDelete)
    const nextResults = ws.generatedResults.filter((result) => result.id !== itemToDelete.id)

    updateWorkspace(idx, {
      generatedResults: nextResults,
      runMessage: `Đã xóa: ${itemToDelete.objectName}`,
    })
  }

  // ── Redesign from editor ────────────────────────────────────────────────────

  const handleRedesignFromEditor = async (idx, item, redesignText) => {
    const ws = workspaces[idx]
    if (!ws || ws.isRunning) return
    updateWorkspace(idx, { isRunning: true, runMessage: `Redesigning: ${item.objectName}` })
    try {
      const file = item.imageFile || await fetch(item.previewUrl)
        .then((r) => r.blob())
        .then((blob) => new File([blob], 'redesign.png', { type: 'image/png' }))

      const image = await generateComboStickerImage({
        file,
        imageUrl: '',
        objectName: item.objectName,
        keyword: redesignText,
        theme: ws.analysisResult?.theme || '',
        style: ws.analysisResult?.style || '',
        colorPalette: ws.analysisResult?.colorPalette || [],
        prompt: PROMPTS.combostickerGenerate,
      })

      const processed = await processItem({
        id: `${item.objectName}-redesign-${Date.now()}`,
        objectName: `${item.objectName} (Redesigned)`,
        base64: image.base64,
        mimeType: image.mimeType,
      })
      updateWorkspace(idx, {
        generatedResults: [...ws.generatedResults, processed],
        runMessage: `Redesigned: ${item.objectName}`,
      })
    } catch (err) {
      updateWorkspace(idx, { runMessage: err.message || 'Redesign failed' })
      throw err
    } finally {
      updateWorkspace(idx, { isRunning: false })
    }
  }

  // ── Download All ────────────────────────────────────────────────────────────


  const handleDownloadAll = async (idx) => {
    const ws = workspaces[idx]
    for (const item of ws.generatedResults) {
      downloadAsset(item.previewUrl, `sticker-${item.objectName}.png`)
      await sleep(150)
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────


  // UI helpers
  const hasImage = (ws) => Boolean(ws.previewUrl)
  const sourceLabel = (ws) => ws.imageFile ? 'Local file' : ws.imageSourceUrl ? 'Remote URL' : 'No source'

  return (
    <>
      {/* Workspace Tabs */}
      <div className="flex gap-2 mb-6">
        {workspaces.map((ws, idx) => (
          <button
            key={ws.id}
            className={`px-4 py-2 rounded-t-lg border-b-2 font-semibold text-sm transition ${activeIdx === idx ? 'border-indigo-500 bg-white text-indigo-700' : 'border-transparent bg-zinc-100 text-zinc-500 hover:bg-zinc-200'}`}
            onClick={() => setActiveIdx(idx)}
          >
            Workspace #{idx + 1}
          </button>
        ))}
        <button
          type="button"
          className="ml-2 px-3 py-2 rounded-lg border-2 border-dashed border-zinc-400 text-zinc-500 hover:border-indigo-400 hover:text-indigo-600 transition"
          onClick={() => {
            setWorkspaces((prev) => [...prev, getDefaultWorkspace()])
            setActiveIdx(workspaces.length)
          }}
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Workspace Content */}
      {workspaces.map((ws, idx) => (
        activeIdx === idx && (
          <section key={ws.id} className="mx-auto max-w">
            {ws.editingItem ? (
              <ImageEditorModal
                item={ws.editingItem}
                onClose={() => updateWorkspace(idx, { editingItem: null })}
                onRedesign={async (item, redesignText) => {
                  if (!redesignText.trim()) {
                    throw new Error('Vui lòng nhập mô tả thay đổi!');
                  }
                  await handleRedesignFromEditor(idx, item, redesignText);
                  updateWorkspace(idx, { editingItem: null });
                }}
                onGenerateSimilar={async (item) => {
                  await handleGenerateSimilar(idx, item);
                  updateWorkspace(idx, { editingItem: null });
                }}
              />
            ) : null}

            <div className="rounded-2xl border border-zinc-300 bg-zinc-100 text-zinc-800 shadow-sm">
              {/* Header */}
              <div className="flex items-center justify-between gap-3 border-b border-zinc-300 px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="rounded border border-zinc-300 bg-zinc-200 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                    Panel #{idx + 1}
                  </span>
                  <h2 className="text-sm font-semibold text-zinc-700">Image Analysis Session</h2>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full bg-indigo-400 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
                    onClick={() => handleUploadAll(idx)}
                    disabled={uploading}
                  >
                    {uploading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
                    Upload to Drive
                  </button>
                </div>
              </div>

              <div className="grid gap-5 p-5 lg:grid-cols-[350px_1fr]">
                {/* Left config panel */}
                <div className="space-y-4">
                  {/* Upload zone */}
                  <button
                    type="button"
                    onClick={() => fileInputRefs.current[idx]?.click()}
                    onDragEnter={() => updateWorkspace(idx, { dragActive: true })}
                    onDragOver={(e) => { e.preventDefault(); updateWorkspace(idx, { dragActive: true }) }}
                    onDragLeave={() => updateWorkspace(idx, { dragActive: false })}
                    onDrop={(e) => handleDrop(idx, e)}
                    className={`flex h-56 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white px-4 text-center transition ${
                      ws.dragActive ? 'border-indigo-400 bg-indigo-50' : 'border-zinc-300 hover:border-indigo-300'
                    }`}
                  >
                    {ws.previewUrl ? (
                      <div className="flex h-full w-full flex-col overflow-hidden rounded-xl">
                        <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2 text-left">
                          <div>
                            <p className="text-sm font-semibold text-zinc-700">Combo source loaded</p>
                            <p className="text-[11px] text-zinc-500">Click to replace or drag another</p>
                          </div>
                          <span className="rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-600">
                            {sourceLabel(ws)}
                          </span>
                        </div>
                        <div className="flex min-h-0 flex-1 items-center justify-center p-3">
                          <img
                            src={ws.previewUrl}
                            alt="combo-source"
                            className="h-full w-full rounded-xl object-contain"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="mb-4 inline-flex rounded-full bg-indigo-100 p-4 text-indigo-500">
                          <Upload className="h-7 w-7" />
                        </span>
                        <p className="text-2xl font-semibold text-zinc-800">Upload Combo Image</p>
                        <p className="mt-1 text-sm text-zinc-500">
                          Drag & drop a sticker sheet, clipart bundle, or image URL from Etsy/Amazon.
                        </p>
                        <p className="mt-4 text-xs text-zinc-400">Supported: JPG, PNG, WEBP or direct image links</p>
                      </>
                    )}
                  </button>

                  <input
                    ref={el => fileInputRefs.current[idx] = el}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => handleFileChange(idx, e)}
                    className="hidden"
                  />

                  <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold uppercase tracking-wide text-zinc-600">Source</span>
                      <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-600">
                        {sourceLabel(ws)}
                      </span>
                    </div>
                    <p className="mt-2 break-words">{ws.imageFile?.name || ws.imageSourceUrl || ws.dropMessage}</p>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-600">
                      Target Output
                    </label>
                    <select
                      value={ws.targetOutput}
                      onChange={(e) => updateWorkspace(idx, { targetOutput: e.target.value })}
                      className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-700 outline-none focus:border-indigo-300"
                    >
                      <option value="1">1 image</option>
                      <option value="2">2 images</option>
                      <option value="10">10 images</option>
                      <option value="20">20 images</option>
                      <option value="25">25 images</option>
                      <option value="30">30 images</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-600">
                      Keyword / Context (Idea for Output)
                    </label>
                    <input
                      value={ws.keyword}
                      onChange={(e) => updateWorkspace(idx, { keyword: e.target.value })}
                      placeholder="E.g. Vintage style, Christmas theme, watercolor…"
                      className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-700 outline-none focus:border-indigo-300"
                    />
                    <p className="mt-1 text-[11px] text-zinc-500">Provides ideas/context for the output stickers.</p>
                    <p className="text-[11px] text-amber-600">Note: This is for style inspiration, not a logo request.</p>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-600">
                      Status / Note
                    </label>
                    <input
                      value={ws.statusNote}
                      onChange={(e) => updateWorkspace(idx, { statusNote: e.target.value })}
                      placeholder="Enter status (e.g. Ready, Review)…"
                      className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-700 outline-none focus:border-indigo-300"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRunAnalysis(idx)}
                    disabled={!hasImage(ws) || ws.isRunning}
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-zinc-300 text-lg font-semibold text-white transition enabled:bg-zinc-700 enabled:hover:bg-zinc-800 disabled:cursor-not-allowed"
                  >
                    {ws.isRunning ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                    {ws.isRunning ? 'Running…' : 'Run Analysis & Split'}
                  </button>

                  {/* Progress */}
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="font-semibold text-zinc-700">Pipeline status</p>
                      <span className="text-xs font-medium text-zinc-500">{ws.runProgress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-zinc-200">
                      <div
                        className="h-2 rounded-full bg-indigo-500 transition-all duration-300"
                        style={{ width: `${ws.runProgress}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">{ws.runMessage}</p>
                  </div>
                </div>

                {/* Right results panel */}
                <div className="rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-4">
                  {ws.generatedResults.length ? (
                    <div className="space-y-4">
                      {/* Results header */}
                      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
                        <div>
                          <p className="font-semibold text-zinc-700">Generated sticker results</p>
                          <p className="text-xs text-zinc-500">
                            {ws.generatedResults.length}/{ws.targetOutput} outputs ready
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {ws.analysisResult?.theme ? (
                            <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-500">
                              Theme: {ws.analysisResult.theme}
                            </span>
                          ) : null}
                          {ws.analysisResult?.style ? (
                            <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-500">
                              Style: {ws.analysisResult.style}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => handleDownloadAll(idx)}
                            className="inline-flex items-center gap-1 rounded-full bg-zinc-700 px-3 py-1 text-white transition hover:bg-zinc-800"
                          >
                            <Download className="h-3 w-3" />
                            Download All
                          </button>
                        </div>
                      </div>

                      {/* Grid */}
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {ws.generatedResults.map((item, index) => (
                          <StickerCard
                            key={item.id}
                            item={item}
                            index={index}
                            onEdit={(item) => updateWorkspace(idx, { editingItem: item })}
                            onSimilar={() => {}}
                            onDelete={(item) => handleDeleteGeneratedItem(idx, item)}
                          />
                        ))}

                        {/* Add Image card */}
                        <button
                          type="button"
                          onClick={() => handleAddMore(idx)}
                          disabled={!ws.analysisResult || ws.isRunning}
                          className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 text-zinc-400 transition hover:border-indigo-300 hover:text-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {ws.isRunning ? (
                            <LoaderCircle className="h-8 w-8 animate-spin" />
                          ) : (
                            <Plus className="h-8 w-8" />
                          )}
                          <span className="text-xs font-semibold">Add Image</span>
                        </button>
                      </div>
                    </div>
                  ) : ws.previewUrl ? (
                    <div className="flex min-h-[650px] flex-col items-center justify-center text-center text-zinc-400">
                      <ImageOff className="h-14 w-14" />
                      <p className="mt-2 text-xl font-medium text-zinc-500">Ready to analyze this combo</p>
                      <p className="mt-1 max-w-md text-sm text-zinc-400">
                        Click Run Analysis & Split to extract objects and redesign them into{' '}
                        {ws.targetOutput} sticker outputs.
                      </p>
                      {ws.imageSourceUrl ? (
                        <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
                          <Link2 className="h-3.5 w-3.5" />
                          Etsy/Amazon URL source attached
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex min-h-[650px] flex-col items-center justify-center text-center text-zinc-400">
                      <ImageOff className="mx-auto h-14 w-14" />
                      <p className="mt-2 text-xl font-medium">Ready for image</p>
                      <p className="mt-1 text-sm text-zinc-400">
                        Drop a local file or drag a product image URL here.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )
      ))}
    </>
  )
}
import { useEffect, useMemo, useState } from 'react'
import { Download, LoaderCircle, RotateCw, X, ZoomIn } from 'lucide-react'
import { sourceImageToBase64 } from '../services/geminiService'

const DEFAULT_ADJUSTMENTS = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  sepia: 0,
  zoom: 100,
  rotation: 0,
}

const SLIDERS = [
  { key: 'brightness', label: 'Brightness', min: 0, max: 200 },
  { key: 'contrast', label: 'Contrast', min: 0, max: 200 },
  { key: 'saturation', label: 'Saturation', min: 0, max: 200 },
  { key: 'hue', label: 'Hue', min: -180, max: 180 },
  { key: 'sepia', label: 'Sepia', min: 0, max: 100 },
  { key: 'zoom', label: 'Zoom', min: 50, max: 200 },
  { key: 'rotation', label: 'Rotation', min: -180, max: 180 },
]

const getMimeTypeFromDataUrl = (dataUrl) => dataUrl.match(/^data:(.*?);base64,/)?.[1] || 'image/png'

const loadEditableSrc = async (src) => {
  if (!src) {
    throw new Error('Không có ảnh để chỉnh sửa')
  }

  if (src.startsWith('data:')) {
    return { dataUrl: src, mimeType: getMimeTypeFromDataUrl(src) }
  }

  const { dataUrl, mimeType } = await sourceImageToBase64({ imageUrl: src })
  return { dataUrl, mimeType }
}

const renderEditedDataUrl = (src, adjustments) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const radians = (adjustments.rotation * Math.PI) / 180
      const scale = adjustments.zoom / 100
      const scaledWidth = img.width * scale
      const scaledHeight = img.height * scale
      const cos = Math.abs(Math.cos(radians))
      const sin = Math.abs(Math.sin(radians))
      const canvas = document.createElement('canvas')

      canvas.width = Math.max(1, Math.ceil(scaledWidth * cos + scaledHeight * sin))
      canvas.height = Math.max(1, Math.ceil(scaledWidth * sin + scaledHeight * cos))

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Không thể khởi tạo canvas editor'))
        return
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.filter = [
        `brightness(${adjustments.brightness}%)`,
        `contrast(${adjustments.contrast}%)`,
        `saturate(${adjustments.saturation}%)`,
        `hue-rotate(${adjustments.hue}deg)`,
        `sepia(${adjustments.sepia}%)`,
      ].join(' ')
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate(radians)
      ctx.scale(scale, scale)
      ctx.drawImage(img, -img.width / 2, -img.height / 2)

      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('Không thể tải ảnh vào editor'))
    img.src = src
  })

const downloadAsset = (url, filename) => {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
}

export default function ImagePreviewEditorModal({ asset, onClose, onApply }) {
  const [adjustments, setAdjustments] = useState(DEFAULT_ADJUSTMENTS)
  const [editableSrc, setEditableSrc] = useState('')
  const [editableMimeType, setEditableMimeType] = useState('image/png')
  const [isPreparing, setIsPreparing] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    const prepare = async () => {
      setIsPreparing(true)
      setError('')

      try {
        const prepared = await loadEditableSrc(asset?.src || '')
        if (!cancelled) {
          setEditableSrc(prepared.dataUrl)
          setEditableMimeType(prepared.mimeType)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Không thể mở ảnh để chỉnh sửa')
        }
      } finally {
        if (!cancelled) {
          setIsPreparing(false)
        }
      }
    }

    prepare()
    return () => {
      cancelled = true
    }
  }, [asset])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const previewStyle = useMemo(
    () => ({
      filter: [
        `brightness(${adjustments.brightness}%)`,
        `contrast(${adjustments.contrast}%)`,
        `saturate(${adjustments.saturation}%)`,
        `hue-rotate(${adjustments.hue}deg)`,
        `sepia(${adjustments.sepia}%)`,
      ].join(' '),
      transform: `scale(${adjustments.zoom / 100}) rotate(${adjustments.rotation}deg)`,
    }),
    [adjustments]
  )

  const handleAdjustmentChange = (key, value) => {
    setAdjustments((prev) => ({ ...prev, [key]: Number(value) }))
  }

  const handleApply = async () => {
    if (!editableSrc || isSaving) {
      return
    }

    setIsSaving(true)
    setError('')

    try {
      const dataUrl = await renderEditedDataUrl(editableSrc, adjustments)
      await onApply({ dataUrl, mimeType: editableMimeType })
      onClose()
    } catch (err) {
      setError(err.message || 'Không thể lưu chỉnh sửa ảnh')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDownload = async () => {
    if (!editableSrc || isSaving) {
      return
    }

    setIsSaving(true)
    setError('')

    try {
      const dataUrl = await renderEditedDataUrl(editableSrc, adjustments)
      const safeName = String(asset?.title || 'edited-image')
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, '-')
        .toLowerCase()
      downloadAsset(dataUrl, `${safeName || 'edited-image'}.png`)
    } catch (err) {
      setError(err.message || 'Không thể tải ảnh đã chỉnh sửa')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="relative flex max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex min-h-[70vh] flex-1 flex-col bg-zinc-950 px-6 py-5 text-white">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-400">Image Preview</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">{asset?.title || 'Image editor'}</h3>
              {asset?.description ? <p className="mt-1 text-sm text-zinc-400">{asset.description}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-1 items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_55%),linear-gradient(135deg,_#111827,_#09090b)] p-5">
            {isPreparing ? (
              <div className="flex flex-col items-center gap-3 text-zinc-300">
                <LoaderCircle className="h-8 w-8 animate-spin" />
                <p className="text-sm">Đang chuẩn bị ảnh để chỉnh sửa...</p>
              </div>
            ) : error && !editableSrc ? (
              <div className="max-w-sm text-center text-sm text-red-300">{error}</div>
            ) : (
              <div
                className="flex h-full w-full items-center justify-center overflow-auto rounded-2xl"
                style={{
                  backgroundImage: 'repeating-conic-gradient(rgba(255,255,255,0.14) 0% 25%, transparent 0% 50%)',
                  backgroundSize: '22px 22px',
                }}
              >
                <img
                  src={editableSrc}
                  alt={asset?.title || 'preview'}
                  className="max-h-full max-w-full object-contain transition-transform duration-150"
                  style={previewStyle}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full max-w-sm flex-col border-l border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-zinc-400">Controls</p>
            <p className="mt-2 text-sm text-zinc-600">Chỉnh trực tiếp trên ảnh phóng to rồi bấm lưu để cập nhật vào ô hiện tại.</p>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {SLIDERS.map(({ key, label, min, max }) => (
              <label key={key} className="block">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</span>
                  <span className="text-xs text-zinc-400">{adjustments[key]}</span>
                </div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  value={adjustments[key]}
                  onChange={(event) => handleAdjustmentChange(key, event.target.value)}
                  className="w-full accent-emerald-500"
                  disabled={isPreparing || isSaving || !editableSrc}
                />
              </label>
            ))}

            <button
              type="button"
              onClick={() => setAdjustments(DEFAULT_ADJUSTMENTS)}
              disabled={isPreparing || isSaving}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Reset chỉnh sửa
            </button>

            {error ? <p className="text-sm text-red-500">{error}</p> : null}
          </div>

          <div className="grid gap-2 border-t border-zinc-200 px-5 py-4">
            <button
              type="button"
              onClick={handleApply}
              disabled={isPreparing || isSaving || !editableSrc}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
            >
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ZoomIn className="h-4 w-4" />}
              Lưu vào ô hiện tại
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={isPreparing || isSaving || !editableSrc}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-300 px-4 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Tải ảnh đã chỉnh sửa
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
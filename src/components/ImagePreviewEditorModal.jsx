import { useEffect, useMemo, useState, useRef } from 'react'
import { Download, LoaderCircle, RotateCw, X, ZoomIn, ChevronDown } from 'lucide-react'
import { sourceImageToBase64, customEditImageFromDataUrl } from '../services/geminiService'
import { removeBackgroundSmart, REMOVAL_MODES } from '../services/backgroundRemovalService'

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
  { key: 'zoom', label: 'Zoom', min: 10, max: 400 },
  { key: 'rotation', label: 'Rotation', min: -180, max: 180 },
]

const ZOOM_MIN = 10
const ZOOM_MAX = 400
const WHEEL_ZOOM_STEP = 6

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

export default function ImagePreviewEditorModal({ asset, onClose, onApply, onPreviewOptionsChange }) {
  const [adjustments, setAdjustments] = useState(DEFAULT_ADJUSTMENTS)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [editableSrc, setEditableSrc] = useState('')
  const [isPreparing, setIsPreparing] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [showControls, setShowControls] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [isApplyingCustom, setIsApplyingCustom] = useState(false)
  const [selectedPreviewId, setSelectedPreviewId] = useState('')
  const [previewOptionsState, setPreviewOptionsState] = useState([])
  const [customPreviewCount, setCustomPreviewCount] = useState(0)
  const controlsDropdownRef = useRef(null)
  const previewFrameRef = useRef(null)
  const dragStateRef = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  })
  const hasProvidedPreviewOptions = Array.isArray(asset?.previewOptions) && asset.previewOptions.length > 0

  const normalizedPreviewOptions = useMemo(() => {
    const options = Array.isArray(asset?.previewOptions)
      ? asset.previewOptions.filter((item) => item?.src)
      : []

    if (options.length) {
      return options.map((item, index) => ({
        id: `${String(item.id || 'preview').replace(/\s+/g, '-')}-${index + 1}`,
        label: item.label || `Preview ${index + 1}`,
        src: item.src,
      }))
    }

    if (asset?.src) {
      return [
        {
          id: 'default-preview-1',
          label: 'Current Preview',
          src: asset.src,
        },
      ]
    }

    return []
  }, [asset?.src, asset?.previewOptions])

  useEffect(() => {
    setPreviewOptionsState(normalizedPreviewOptions)
    setCustomPreviewCount(0)
  }, [normalizedPreviewOptions])

  useEffect(() => {
    if (!previewOptionsState.length) {
      setSelectedPreviewId('')
      return
    }

    setSelectedPreviewId((prev) => {
      if (prev && previewOptionsState.some((option) => option.id === prev)) {
        return prev
      }
      const activeOption = previewOptionsState.find((option) => option.src === asset?.src)
      return activeOption?.id || previewOptionsState[0].id
    })
  }, [asset?.src, previewOptionsState])

  useEffect(() => {
    let cancelled = false
    const selectedOption = previewOptionsState.find((option) => option.id === selectedPreviewId)

    const prepare = async () => {
      if (!selectedOption?.src) {
        setEditableSrc('')
        setIsPreparing(false)
        return
      }

      setIsPreparing(true)
      setError('')

      try {
        const prepared = await loadEditableSrc(selectedOption.src)
        if (!cancelled) {
          setEditableSrc(prepared.dataUrl)
          setAdjustments(DEFAULT_ADJUSTMENTS)
          setPan({ x: 0, y: 0 })
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
  }, [previewOptionsState, selectedPreviewId])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (controlsDropdownRef.current && !controlsDropdownRef.current.contains(event.target)) {
        setShowControls(false)
      }
    }

    if (showControls) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showControls])

  useEffect(() => {
    const handleMouseMove = (event) => {
      if (!dragStateRef.current.dragging) {
        return
      }

      const deltaX = event.clientX - dragStateRef.current.startX
      const deltaY = event.clientY - dragStateRef.current.startY
      setPan({
        x: dragStateRef.current.originX + deltaX,
        y: dragStateRef.current.originY + deltaY,
      })
    }

    const handleMouseUp = () => {
      dragStateRef.current.dragging = false
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
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

  const handlePreviewWheel = (event) => {
    if (!editableSrc) {
      return
    }

    event.preventDefault()
    const direction = event.deltaY > 0 ? -1 : 1
    const step = event.shiftKey ? WHEEL_ZOOM_STEP * 2 : WHEEL_ZOOM_STEP

    setAdjustments((prev) => {
      const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev.zoom + direction * step))
      return { ...prev, zoom: nextZoom }
    })
  }

  const handlePreviewMouseDown = (event) => {
    if (!editableSrc || event.button !== 0) {
      return
    }

    event.preventDefault()
    dragStateRef.current.dragging = true
    dragStateRef.current.startX = event.clientX
    dragStateRef.current.startY = event.clientY
    dragStateRef.current.originX = pan.x
    dragStateRef.current.originY = pan.y
  }

  const handleApplyCustomEdit = async () => {
    if (!customPrompt.trim()) {
      setError('Vui lòng nhập ý kiến chỉnh sửa ảnh')
      return
    }

    if (!editableSrc) {
      setError('Không có ảnh để chỉnh sửa')
      return
    }

    setIsApplyingCustom(true)
    setError('')
    setShowControls(false)

    try {
      // Get the currently edited image (with all filters applied)
      const editedDataUrl = await renderEditedDataUrl(editableSrc, adjustments)

      // Send to Gemini with custom prompt
      const result = await customEditImageFromDataUrl(editedDataUrl, customPrompt)

      // Keep custom output transparent when possible, but do not block custom flow on removal failure.
      let updatedPreviewSrc = `data:${result.mimeType || 'image/png'};base64,${result.base64}`
      try {
        const transparentDataUrl = await removeBackgroundSmart(
          result.base64,
          result.mimeType || 'image/png',
          REMOVAL_MODES.PIXEL_THRESHOLD
        )
        const transparentBase64 = String(transparentDataUrl).split(',')[1] || ''
        const transparentMimeType = getMimeTypeFromDataUrl(transparentDataUrl)
        if (transparentBase64) {
          updatedPreviewSrc = `data:${transparentMimeType};base64,${transparentBase64}`
        }
      } catch (bgError) {
        console.warn('Background removal failed on custom edit, keeping Gemini output.', bgError)
      }

      // Update with new image and reset adjustments
      setEditableSrc(updatedPreviewSrc)
      const nextCustomCount = customPreviewCount + 1
      const customOptionId = `custom-${Date.now()}-${nextCustomCount}`
      setPreviewOptionsState((prev) => [
        ...prev,
        {
          id: customOptionId,
          label: `Custom ${nextCustomCount}`,
          src: updatedPreviewSrc,
        },
      ])
      setCustomPreviewCount(nextCustomCount)
      setSelectedPreviewId(customOptionId)
      if (typeof onPreviewOptionsChange === 'function') {
        onPreviewOptionsChange([
          ...previewOptionsState,
          {
            id: customOptionId,
            label: `Custom ${nextCustomCount}`,
            src: updatedPreviewSrc,
          },
        ])
      }
      setAdjustments(DEFAULT_ADJUSTMENTS)
      setPan({ x: 0, y: 0 })
      setCustomPrompt('')
    } catch (err) {
      console.error('Custom AI edit failed:', err)
      setError(err?.message || 'Lỗi khi chỉnh sửa ảnh. Thử lại.')
    } finally {
      setIsApplyingCustom(false)
    }
  }

  const handleApply = async () => {
    if (!editableSrc || isSaving) {
      return
    }

    setIsSaving(true)
    setError('')

    try {
      const dataUrl = await renderEditedDataUrl(editableSrc, adjustments)
      const nextPreviewOptions = selectedPreviewId
        ? previewOptionsState.map((option) =>
            option.id === selectedPreviewId ? { ...option, src: dataUrl } : option
          )
        : previewOptionsState
      await onApply({
        dataUrl,
        mimeType: getMimeTypeFromDataUrl(dataUrl),
        previewOptions: nextPreviewOptions,
        selectedPreviewId,
      })
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
            ) : editableSrc ? (
              <div
                className="flex h-full w-full items-center justify-center overflow-auto rounded-2xl"
                onWheel={handlePreviewWheel}
                ref={previewFrameRef}
                onMouseDown={handlePreviewMouseDown}
                style={{
                  backgroundImage: 'repeating-conic-gradient(rgba(255,255,255,0.14) 0% 25%, transparent 0% 50%)',
                  backgroundSize: '22px 22px',
                  cursor: editableSrc ? 'grab' : 'default',
                }}
              >
                <img
                  src={editableSrc}
                  alt={asset?.title || 'preview'}
                  className="max-h-full max-w-full object-contain transition-transform duration-150 select-none"
                  draggable={false}
                  style={{
                    ...previewStyle,
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${adjustments.zoom / 100}) rotate(${adjustments.rotation}deg)`,
                    cursor: 'grab',
                  }}
                />
              </div>
            ) : (
              <div className="max-w-sm text-center text-sm text-zinc-300">Không có ảnh để preview</div>
            )}
          </div>
        </div>

        <div className="flex w-full max-w-sm flex-col border-l border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-zinc-400">Custom AI Edit</p>
            <p className="mt-2 text-sm text-zinc-600">Nhập ý kiến chỉnh sửa để AI tạo lại ảnh dựa trên hướng dẫn của bạn</p>
          </div>

          <div className="space-y-3 border-b border-zinc-200 px-5 py-4">
            {hasProvidedPreviewOptions && previewOptionsState.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Redesign Images</p>
                <div className="grid grid-cols-3 gap-2">
                  {previewOptionsState.map((option) => {
                    const isActive = option.id === selectedPreviewId
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setSelectedPreviewId(option.id)}
                        disabled={isPreparing || isSaving || isApplyingCustom}
                        className={`overflow-hidden rounded-lg border text-left transition disabled:opacity-50 ${
                          isActive
                            ? 'border-emerald-500 ring-2 ring-emerald-100'
                            : 'border-zinc-200 hover:border-zinc-400'
                        }`}
                      >
                        <img src={option.src} alt={option.label} className="h-14 w-full object-cover" />
                        <span className="block truncate px-2 py-1 text-[10px] font-semibold text-zinc-600">
                          {option.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <textarea
              placeholder="VD: Làm sáng hơn, bỏ background xanh, thêm hiệu ứng..."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              disabled={isApplyingCustom || isPreparing || isSaving}
              className="min-h-20 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleApplyCustomEdit}
              disabled={isApplyingCustom || isPreparing || isSaving || !customPrompt.trim()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
            >
              {isApplyingCustom ? <LoaderCircle className="h-4 w-4 animate-spin" /> : '✨ Áp dụng Custom'}
            </button>
          </div>

          <div className="border-b border-zinc-200 px-5 py-4">
            <div className="relative" ref={controlsDropdownRef}>
              <button
                type="button"
                onClick={() => setShowControls(!showControls)}
                disabled={isPreparing || isSaving || !editableSrc}
                className="inline-flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
              >
                <span>⚙️ Chỉnh sửa chi tiết</span>
                <ChevronDown className={`h-4 w-4 transition ${showControls ? 'rotate-180' : ''}`} />
              </button>

              {showControls && (
                <div className="absolute top-full left-0 right-0 z-10 mt-2 rounded-lg border border-zinc-300 bg-white shadow-lg">
                  <div className="max-h-64 space-y-3 overflow-y-auto p-4">
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
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 px-5 py-4">
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
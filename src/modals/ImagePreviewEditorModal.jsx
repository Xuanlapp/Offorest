import { useEffect, useMemo, useState, useRef } from 'react'
import { Download, LoaderCircle, RotateCw, X, ZoomIn, ChevronDown, Brush, Undo2, Redo2 } from 'lucide-react'
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
const HISTORY_LIMIT = 30

const MagicEraserIcon = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
    <path d="M12 3l1.7 3.8L18 8.5l-3.2 2.8.9 4.2-3.7-2.2-3.7 2.2.9-4.2L6 8.5l4.3-1.7L12 3z" />
  </svg>
)

const EraserToolIcon = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
    <path d="M4 14l7.5-7.5a2 2 0 0 1 2.8 0l5.2 5.2a2 2 0 0 1 0 2.8L14 20H8l-4-4a2 2 0 0 1 0-2z" />
    <path d="M9 20h11" />
  </svg>
)

const BgEraserToolIcon = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
    <circle cx="10" cy="10" r="5" />
    <path d="M13.5 13.5L21 21" />
    <path d="M10 7v6" />
  </svg>
)

const getMimeTypeFromDataUrl = (dataUrl) => dataUrl.match(/^data:(.*?);base64,/)?.[1] || 'image/png'

const loadEditableSrc = async (src) => {
  if (!src) {
    throw new Error('Khong co anh de chinh sua')
  }

  const normalizedSrc = typeof src === 'string' ? src : String(src || '')
  if (!normalizedSrc) {
    throw new Error('Nguon anh khong hop le')
  }

  if (normalizedSrc.startsWith('data:')) {
    return { dataUrl: normalizedSrc, mimeType: getMimeTypeFromDataUrl(normalizedSrc) }
  }

  const { dataUrl, mimeType } = await sourceImageToBase64({ imageUrl: normalizedSrc })
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
        reject(new Error('Khong the khoi tao canvas editor'))
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
    img.onerror = () => reject(new Error('Khong the tai anh vao editor'))
    img.src = src
  })

const refineRemovedBackgroundMask = (dataUrl) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Khong the khoi tao canvas refine mask'))
        return
      }

      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      const width = canvas.width
      const height = canvas.height
      const total = width * height
      const alphaThreshold = 8

      const isOpaque = (idx) => data[idx * 4 + 3] > alphaThreshold

      // Remove tiny fragments but keep multiple subjects.
      const visited = new Uint8Array(total)
      const minComponentArea = Math.max(80, Math.floor(total * 0.0002))
      for (let i = 0; i < total; i += 1) {
        if (visited[i] || !isOpaque(i)) {
          continue
        }

        const queue = [i]
        const component = []
        visited[i] = 1
        let head = 0

        while (head < queue.length) {
          const current = queue[head]
          head += 1
          component.push(current)

          const x = current % width
          const y = Math.floor(current / width)

          const neighbors = []
          if (x > 0) neighbors.push(current - 1)
          if (x < width - 1) neighbors.push(current + 1)
          if (y > 0) neighbors.push(current - width)
          if (y < height - 1) neighbors.push(current + width)

          for (const n of neighbors) {
            if (!visited[n] && isOpaque(n)) {
              visited[n] = 1
              queue.push(n)
            }
          }
        }

        if (component.length < minComponentArea) {
          for (const pixelIdx of component) {
            data[pixelIdx * 4 + 3] = 0
          }
        }
      }

      // Fill transparent holes inside subjects so mask does not go too deep.
      const visitedBg = new Uint8Array(total)
      const bgQueue = []
      const enqueueBg = (idx) => {
        if (idx < 0 || idx >= total || visitedBg[idx]) {
          return
        }

        if (data[idx * 4 + 3] > alphaThreshold) {
          return
        }

        visitedBg[idx] = 1
        bgQueue.push(idx)
      }

      for (let x = 0; x < width; x += 1) {
        enqueueBg(x)
        enqueueBg((height - 1) * width + x)
      }
      for (let y = 0; y < height; y += 1) {
        enqueueBg(y * width)
        enqueueBg(y * width + (width - 1))
      }

      let bgHead = 0
      while (bgHead < bgQueue.length) {
        const current = bgQueue[bgHead]
        bgHead += 1

        const x = current % width
        const y = Math.floor(current / width)
        if (x > 0) enqueueBg(current - 1)
        if (x < width - 1) enqueueBg(current + 1)
        if (y > 0) enqueueBg(current - width)
        if (y < height - 1) enqueueBg(current + width)
      }

      for (let i = 0; i < total; i += 1) {
        const alphaOffset = i * 4 + 3
        if (data[alphaOffset] <= alphaThreshold && !visitedBg[i]) {
          data[alphaOffset] = 255
        }
      }

      ctx.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }

    img.onerror = () => reject(new Error('Khong the tai anh de refine mask'))
    img.src = dataUrl
  })

const downloadAsset = (url, filename) => {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
}

export default function ImagePreviewEditorModal({
  asset,
  onClose,
  onApply,
  onPreviewOptionsChange,
  disableAutoBackgroundOnCustomEdit = false,
}) {
  const onPreviewOptionsChangeRef = useRef(onPreviewOptionsChange)
  const [adjustments, setAdjustments] = useState(DEFAULT_ADJUSTMENTS)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [editableSrc, setEditableSrc] = useState('')
  const [isPreparing, setIsPreparing] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [showControls, setShowControls] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [isApplyingCustom, setIsApplyingCustom] = useState(false)
  const [isRemovingBackground, setIsRemovingBackground] = useState(false)
  const [isPenMode, setIsPenMode] = useState(false)
  const [brushSize, setBrushSize] = useState(28)
  const [penTool, setPenTool] = useState('eraser')
  const [bgSampleMode, setBgSampleMode] = useState('continuous')
  const [wandTolerance, setWandTolerance] = useState(34)
  const [wandFeather, setWandFeather] = useState(12)
  const [wandContiguous, setWandContiguous] = useState(true)
  const [cursorPreview, setCursorPreview] = useState({ visible: false, x: 0, y: 0 })
  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const [selectedPreviewId, setSelectedPreviewId] = useState('')
  const [previewOptionsState, setPreviewOptionsState] = useState([])
  const [customPreviewCount, setCustomPreviewCount] = useState(0)
  const controlsDropdownRef = useRef(null)
  const previewFrameRef = useRef(null)
  const penCanvasRef = useRef(null)
  const penDrawingRef = useRef(false)
  const bgEraseSampleRef = useRef(null)
  const dragStateRef = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  })

  const selectedPreviewOption = useMemo(
    () => previewOptionsState.find((option) => option.id === selectedPreviewId) || null,
    [previewOptionsState, selectedPreviewId]
  )

  const normalizedPreviewOptions = useMemo(() => {
    const options = Array.isArray(asset?.previewOptions)
      ? asset.previewOptions.filter((item) => item?.src && String(item.src).trim())
      : []

    if (options.length) {
      return options.map((item, index) => ({
        id: `${String(item.id || 'preview').replace(/\s+/g, '-')}-${index + 1}`,
        label: item.label || `Preview ${index + 1}`,
        src: String(item.src),
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
        setUndoStack([])
        setRedoStack([])
        setIsPreparing(false)
        return
      }

      setIsPreparing(true)
      setError('')

      try {
        const prepared = await loadEditableSrc(selectedOption.src)
        if (!cancelled) {
          applyEditableChange(prepared.dataUrl, { trackHistory: false })
          setAdjustments(DEFAULT_ADJUSTMENTS)
          setPan({ x: 0, y: 0 })
          setIsPenMode(false)
          setUndoStack([])
          setRedoStack([])
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Khong the mo anh de chinh sua')
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
    onPreviewOptionsChangeRef.current = onPreviewOptionsChange
  }, [onPreviewOptionsChange])

  useEffect(() => {
    if (typeof onPreviewOptionsChangeRef.current === 'function') {
      onPreviewOptionsChangeRef.current(previewOptionsState)
    }
  }, [previewOptionsState])

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

  const pushHistorySnapshot = (snapshotDataUrl) => {
    if (!snapshotDataUrl) {
      return
    }

    setUndoStack((prev) => {
      if (prev[prev.length - 1] === snapshotDataUrl) {
        return prev
      }

      const next = [...prev, snapshotDataUrl]
      if (next.length <= HISTORY_LIMIT) {
        return next
      }

      return next.slice(next.length - HISTORY_LIMIT)
    })
    setRedoStack([])
  }

  const applyEditableChange = (nextDataUrl, options = {}) => {
    const { trackHistory = true, baseSnapshot = editableSrc } = options
    if (!nextDataUrl) {
      return
    }

    if (trackHistory && baseSnapshot && baseSnapshot !== nextDataUrl) {
      pushHistorySnapshot(baseSnapshot)
    }

    setEditableSrc(nextDataUrl)
  }

  const handleUndo = () => {
    if (!undoStack.length || isPreparing || isSaving || isApplyingCustom || isRemovingBackground) {
      return
    }

    setUndoStack((prev) => {
      if (!prev.length) {
        return prev
      }

      const previousSnapshot = prev[prev.length - 1]
      setRedoStack((redoPrev) => {
        if (!editableSrc) {
          return redoPrev
        }

        const nextRedo = [...redoPrev, editableSrc]
        return nextRedo.length <= HISTORY_LIMIT ? nextRedo : nextRedo.slice(nextRedo.length - HISTORY_LIMIT)
      })
      setEditableSrc(previousSnapshot)
      return prev.slice(0, -1)
    })
  }

  const handleRedo = () => {
    if (!redoStack.length || isPreparing || isSaving || isApplyingCustom || isRemovingBackground) {
      return
    }

    setRedoStack((prev) => {
      if (!prev.length) {
        return prev
      }

      const nextSnapshot = prev[prev.length - 1]
      setUndoStack((undoPrev) => {
        if (!editableSrc) {
          return undoPrev
        }

        const nextUndo = [...undoPrev, editableSrc]
        return nextUndo.length <= HISTORY_LIMIT ? nextUndo : nextUndo.slice(nextUndo.length - HISTORY_LIMIT)
      })
      setEditableSrc(nextSnapshot)
      return prev.slice(0, -1)
    })
  }

  const drawEditableToPenCanvas = (src) =>
    new Promise((resolve, reject) => {
      const canvas = penCanvasRef.current
      if (!canvas) {
        reject(new Error('Khong the khoi tao canvas but'))
        return
      }

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Khong the lay context canvas but'))
        return
      }

      const img = new Image()
      img.onload = () => {
        canvas.width = img.width
        canvas.height = img.height
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.globalCompositeOperation = 'source-over'
        ctx.drawImage(img, 0, 0)
        resolve()
      }
      img.onerror = () => reject(new Error('Khong the tai anh vao canvas but'))
      img.src = src
    })

  useEffect(() => {
    if (!isPenMode || !editableSrc) {
      return
    }

    drawEditableToPenCanvas(editableSrc).catch((err) => {
      setError(err?.message || 'Khong the mo che do but')
      setIsPenMode(false)
    })
  }, [editableSrc, isPenMode])

  useEffect(() => {
    const handleKeyDown = (event) => {
      const activeTag = event.target?.tagName?.toLowerCase()
      const isTypingTarget =
        activeTag === 'input' ||
        activeTag === 'textarea' ||
        activeTag === 'select' ||
        event.target?.isContentEditable

      if (isTypingTarget) {
        return
      }

      const key = String(event.key || '').toLowerCase()
      const isCtrlOrCmd = event.ctrlKey || event.metaKey

      if (isCtrlOrCmd && key === 'z' && !event.shiftKey) {
        event.preventDefault()
        handleUndo()
        return
      }

      if ((isCtrlOrCmd && key === 'y') || (isCtrlOrCmd && event.shiftKey && key === 'z')) {
        event.preventDefault()
        handleRedo()
        return
      }

      if (!isPenMode) {
        return
      }

      if (key === 'e') {
        event.preventDefault()
        setPenTool('eraser')
      } else if (key === 'w') {
        event.preventDefault()
        setPenTool('magic')
      } else if (key === 'b') {
        event.preventDefault()
        setPenTool('background')
      } else if (key === '[') {
        event.preventDefault()
        setBrushSize((prev) => Math.max(6, prev - 2))
      } else if (key === ']') {
        event.preventDefault()
        setBrushSize((prev) => Math.min(120, prev + 2))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleRedo, handleUndo, isPenMode])

  const getCanvasPoint = (event) => {
    const canvas = penCanvasRef.current
    if (!canvas) {
      return null
    }

    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) {
      return null
    }

    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    }
  }

  const drawPenStroke = (event) => {
    const canvas = penCanvasRef.current
    if (!canvas) {
      return
    }

    const ctx = canvas.getContext('2d')
    const point = getCanvasPoint(event)
    if (!ctx || !point) {
      return
    }

    ctx.globalCompositeOperation = 'destination-out'
    ctx.lineWidth = Number(brushSize)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
  }

  const handleWandErase = (event) => {
    const canvas = penCanvasRef.current
    const point = getCanvasPoint(event)
    if (!canvas || !point) {
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    const beforeSnapshot = canvas.toDataURL('image/png')

    const width = canvas.width
    const height = canvas.height
    const x = Math.max(0, Math.min(width - 1, Math.floor(point.x)))
    const y = Math.max(0, Math.min(height - 1, Math.floor(point.y)))

    const imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data

    const startIndex = (y * width + x) * 4
    const baseR = data[startIndex]
    const baseG = data[startIndex + 1]
    const baseB = data[startIndex + 2]
    const baseA = data[startIndex + 3]

    if (baseA === 0) {
      return
    }

    const tolerance = Number(wandTolerance)
    const feather = Math.max(0, Math.min(tolerance - 1, Number(wandFeather)))
    const innerThreshold = Math.max(0, tolerance - feather)
    const alphaTolerance = Math.min(255, tolerance + 24)

    const getDistance = (r, g, b) => {
      const dr = r - baseR
      const dg = g - baseG
      const db = b - baseB
      return Math.sqrt(dr * dr + dg * dg + db * db)
    }

    const erasePixel = (pixelOffset, distance) => {
      const sourceAlpha = data[pixelOffset + 3]
      if (!feather || distance <= innerThreshold) {
        data[pixelOffset + 3] = 0
        return
      }

      const blendSpan = Math.max(1, tolerance - innerThreshold)
      const ratio = Math.min(1, Math.max(0, (distance - innerThreshold) / blendSpan))
      const nextAlpha = Math.round(sourceAlpha * ratio)
      data[pixelOffset + 3] = Math.min(sourceAlpha, nextAlpha)
    }

    const isMatch = (pixelOffset) => {
      const r = data[pixelOffset]
      const g = data[pixelOffset + 1]
      const b = data[pixelOffset + 2]
      const a = data[pixelOffset + 3]
      const distance = getDistance(r, g, b)
      const alphaDiff = Math.abs(a - baseA)

      if (distance > tolerance || alphaDiff > alphaTolerance) {
        return null
      }

      return distance
    }

    if (wandContiguous) {
      const visited = new Uint8Array(width * height)
      const queue = [y * width + x]
      let head = 0

      while (head < queue.length) {
        const idx = queue[head]
        head += 1

        if (visited[idx]) {
          continue
        }

        visited[idx] = 1
        const pixelOffset = idx * 4
        const distance = isMatch(pixelOffset)
        if (distance === null) {
          continue
        }

        erasePixel(pixelOffset, distance)

        const px = idx % width
        const py = Math.floor(idx / width)

        if (px > 0) {
          queue.push(idx - 1)
        }
        if (px < width - 1) {
          queue.push(idx + 1)
        }
        if (py > 0) {
          queue.push(idx - width)
        }
        if (py < height - 1) {
          queue.push(idx + width)
        }
      }
    } else {
      for (let idx = 0; idx < width * height; idx += 1) {
        const pixelOffset = idx * 4
        const distance = isMatch(pixelOffset)
        if (distance !== null) {
          erasePixel(pixelOffset, distance)
        }
      }
    }

    ctx.putImageData(imageData, 0, 0)
    applyEditableChange(canvas.toDataURL('image/png'), { baseSnapshot: beforeSnapshot })
  }

  const handleBackgroundEraseStroke = (event, initializeSample = false) => {
    const canvas = penCanvasRef.current
    const point = getCanvasPoint(event)
    if (!canvas || !point) {
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    const width = canvas.width
    const height = canvas.height
    const x = Math.max(0, Math.min(width - 1, Math.floor(point.x)))
    const y = Math.max(0, Math.min(height - 1, Math.floor(point.y)))

    const imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data
    const centerOffset = (y * width + x) * 4

    if (
      initializeSample ||
      !bgEraseSampleRef.current ||
      bgSampleMode === 'continuous'
    ) {
      bgEraseSampleRef.current = {
        r: data[centerOffset],
        g: data[centerOffset + 1],
        b: data[centerOffset + 2],
        a: data[centerOffset + 3],
      }
    }

    const sample = bgEraseSampleRef.current
    if (!sample) {
      return
    }

    const radius = Math.max(2, Math.floor(brushSize / 2))
    const tolerance = Number(wandTolerance)
    const feather = Math.max(0, Math.min(tolerance - 1, Number(wandFeather)))
    const innerThreshold = Math.max(0, tolerance - feather)
    const alphaTolerance = Math.min(255, tolerance + 24)

    for (let py = y - radius; py <= y + radius; py += 1) {
      if (py < 0 || py >= height) {
        continue
      }

      for (let px = x - radius; px <= x + radius; px += 1) {
        if (px < 0 || px >= width) {
          continue
        }

        const dx = px - x
        const dy = py - y
        if (dx * dx + dy * dy > radius * radius) {
          continue
        }

        const offset = (py * width + px) * 4
        const r = data[offset]
        const g = data[offset + 1]
        const b = data[offset + 2]
        const a = data[offset + 3]

        const dr = r - sample.r
        const dg = g - sample.g
        const db = b - sample.b
        const distance = Math.sqrt(dr * dr + dg * dg + db * db)
        const alphaDiff = Math.abs(a - sample.a)

        if (distance > tolerance || alphaDiff > alphaTolerance) {
          continue
        }

        if (!feather || distance <= innerThreshold) {
          data[offset + 3] = 0
          continue
        }

        const blendSpan = Math.max(1, tolerance - innerThreshold)
        const ratio = Math.min(1, Math.max(0, (distance - innerThreshold) / blendSpan))
        data[offset + 3] = Math.min(a, Math.round(a * ratio))
      }
    }

    ctx.putImageData(imageData, 0, 0)
  }

  const handlePenMouseDown = (event) => {
    if (!isPenMode || event.button !== 0) {
      return
    }

    if (event.ctrlKey) {
      return
    }

    const canvas = penCanvasRef.current
    if (!canvas) {
      return
    }

    if (penTool === 'magic') {
      event.preventDefault()
      handleWandErase(event)
      return
    }

    if (penTool === 'background') {
      event.preventDefault()
      penDrawingRef.current = true
      pushHistorySnapshot(canvas.toDataURL('image/png'))
      handleBackgroundEraseStroke(event, true)
      return
    }

    const point = getCanvasPoint(event)
    if (!canvas || !point) {
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    event.preventDefault()
    penDrawingRef.current = true
    pushHistorySnapshot(canvas.toDataURL('image/png'))
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
    drawPenStroke(event)
  }

  const handlePenMouseMove = (event) => {
    if (!isPenMode || !penDrawingRef.current) {
      return
    }

    event.preventDefault()
    if (penTool === 'eraser') {
      drawPenStroke(event)
      return
    }

    if (penTool === 'background') {
      handleBackgroundEraseStroke(event)
    }
  }

  const handlePenMouseUp = () => {
    if (!isPenMode || !penDrawingRef.current) {
      return
    }

    const canvas = penCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (ctx) {
      ctx.closePath()
    }

    penDrawingRef.current = false
    bgEraseSampleRef.current = null
    if (canvas) {
      applyEditableChange(canvas.toDataURL('image/png'), { trackHistory: false })
    }
  }

  useEffect(() => {
    if (!isPenMode) {
      return
    }

    window.addEventListener('mouseup', handlePenMouseUp)
    return () => {
      window.removeEventListener('mouseup', handlePenMouseUp)
    }
  }, [isPenMode])

  const getWorkingDataUrl = async () => {
    if (isPenMode) {
      const canvas = penCanvasRef.current
      if (canvas?.width && canvas?.height) {
        return canvas.toDataURL('image/png')
      }
    }

    return renderEditedDataUrl(editableSrc, adjustments)
  }

  const handleTogglePenMode = async () => {
    if (!editableSrc || isActionDisabled) {
      return
    }

    if (isPenMode) {
      setIsPenMode(false)
      return
    }

    setError('')
    try {
      const bakedDataUrl = await renderEditedDataUrl(editableSrc, adjustments)
      applyEditableChange(bakedDataUrl)
      setAdjustments(DEFAULT_ADJUSTMENTS)
      setPan({ x: 0, y: 0 })
      setShowControls(false)
      setPenTool('eraser')
      setIsPenMode(true)
    } catch (err) {
      setError(err?.message || 'Khong the bat che do but')
    }
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
    if (!editableSrc) {
      return
    }

    const isPanTrigger = event.button === 1 || event.button === 2 || event.altKey || event.ctrlKey
    const shouldPanWithLeftClick = !isPenMode && event.button === 0
    if (!shouldPanWithLeftClick && !isPanTrigger) {
      return
    }

    event.preventDefault()
    dragStateRef.current.dragging = true
    dragStateRef.current.startX = event.clientX
    dragStateRef.current.startY = event.clientY
    dragStateRef.current.originX = pan.x
    dragStateRef.current.originY = pan.y
  }

  const handlePreviewMouseMove = (event) => {
    if (!isPenMode || !previewFrameRef.current) {
      return
    }

    const rect = previewFrameRef.current.getBoundingClientRect()
    setCursorPreview({
      visible: true,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
  }

  const hideCursorPreview = () => {
    setCursorPreview((prev) => ({ ...prev, visible: false }))
  }

  const handleApplyCustomEdit = async () => {
    if (!customPrompt.trim()) {
      setError('Vui long nhap y kien chinh sua anh')
      return
    }

    if (!editableSrc) {
      setError('Khong co anh de chinh sua')
      return
    }

    setIsApplyingCustom(true)
    setError('')
    setShowControls(false)

    try {
      const editedDataUrl = await getWorkingDataUrl()
      const result = await customEditImageFromDataUrl(editedDataUrl, customPrompt)

      let updatedPreviewSrc = `data:${result.mimeType || 'image/png'};base64,${result.base64}`
      if (!disableAutoBackgroundOnCustomEdit) {
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
      }

      applyEditableChange(updatedPreviewSrc)
      const nextCustomCount = customPreviewCount + 1
      const customOptionId = `custom-${Date.now()}-${nextCustomCount}`
      const nextPreviewOptions = [
        ...previewOptionsState,
        {
          id: customOptionId,
          label: `Custom ${nextCustomCount}`,
          src: updatedPreviewSrc,
        },
      ]
      setPreviewOptionsState(nextPreviewOptions)
      setCustomPreviewCount(nextCustomCount)
      setSelectedPreviewId(customOptionId)
      setAdjustments(DEFAULT_ADJUSTMENTS)
      setPan({ x: 0, y: 0 })
      setCustomPrompt('')
    } catch (err) {
      console.error('Custom AI edit failed:', err)
      setError(err?.message || 'Loi khi chinh sua anh. Thu lai.')
    } finally {
      setIsApplyingCustom(false)
    }
  }

  const handleApply = async () => {
    if (!editableSrc || isSaving) {
      return
    }

    if (!previewOptionsState.length || !selectedPreviewOption) {
      setError('Khong co mockup de luu')
      return
    }

    setIsSaving(true)
    setError('')

    try {
      const dataUrl = await getWorkingDataUrl()
      const nextPreviewOptions = previewOptionsState.map((option) =>
        option.id === selectedPreviewOption.id ? { ...option, src: dataUrl } : option
      )
      await onApply({
        dataUrl,
        mimeType: getMimeTypeFromDataUrl(dataUrl),
        previewOptions: nextPreviewOptions,
        selectedPreviewId,
      })
      onClose()
    } catch (err) {
      setError(err.message || 'Khong the luu chinh sua anh')
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
      const dataUrl = await getWorkingDataUrl()
      const safeName = String(asset?.title || 'edited-image')
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, '-')
        .toLowerCase()
      downloadAsset(dataUrl, `${safeName || 'edited-image'}.png`)
    } catch (err) {
      setError(err.message || 'Khong the tai anh da chinh sua')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDownloadSelectedPreview = () => {
    if (!selectedPreviewOption?.src) {
      return
    }

    const safeAssetName = String(asset?.title || 'preview')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .toLowerCase()
    const safeLabel = String(selectedPreviewOption.label || 'image')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .toLowerCase()

    downloadAsset(selectedPreviewOption.src, `${safeAssetName || 'preview'}-${safeLabel || 'image'}.png`)
  }

  const handleRemoveBackground = async () => {
    if (!editableSrc) {
      setError('Khong co anh de tach nen')
      return
    }

    setIsRemovingBackground(true)
    setError('')

    try {
      const workingDataUrl = await getWorkingDataUrl()
      const match = String(workingDataUrl).match(/^data:(.*?);base64,(.*)$/)

      if (!match?.[2]) {
        throw new Error('Khong doc duoc du lieu anh de tach nen')
      }

      const mimeType = match[1] || 'image/png'
      const base64 = match[2]

      const transparentDataUrl = await removeBackgroundSmart(
        base64,
        mimeType,
        REMOVAL_MODES.IMGLY
      )

      let refinedDataUrl = transparentDataUrl
      try {
        refinedDataUrl = await refineRemovedBackgroundMask(transparentDataUrl)
      } catch (maskRefineError) {
        console.warn('Mask refine failed, using raw IMG.LY output.', maskRefineError)
      }

      applyEditableChange(refinedDataUrl)
      setAdjustments(DEFAULT_ADJUSTMENTS)
      setPan({ x: 0, y: 0 })

      if (selectedPreviewOption?.id) {
        setPreviewOptionsState((prev) =>
          prev.map((option) =>
            option.id === selectedPreviewOption.id
              ? { ...option, src: refinedDataUrl }
              : option
          )
        )
      }
    } catch (err) {
      console.error('Remove background failed:', err)
      setError(err?.message || 'Khong the tach nen anh')
    } finally {
      setIsRemovingBackground(false)
    }
  }

  const isActionDisabled = isPreparing || isSaving || isApplyingCustom || isRemovingBackground

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative flex max-h-[94vh] w-full max-w-7xl overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex min-h-[76vh] flex-1 flex-col bg-zinc-950 px-6 py-5 text-white">
          <div className="mb-4 flex items-start justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-400">Image Preview</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">{asset?.title || 'Image editor'}</h3>
              {asset?.description ? <p className="mt-1 max-h-20 overflow-hidden text-sm text-zinc-400 line-clamp-3">{asset.description}</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-200">
                  Mockup: {previewOptionsState.length}
                </span>
              </div>
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
                <p className="text-sm">Dang chuan bi anh de chinh sua...</p>
              </div>
            ) : error && !editableSrc ? (
              <div className="max-w-sm text-center text-sm text-red-300">{error}</div>
            ) : editableSrc ? (
              <div
                className="flex h-full w-full items-center justify-center overflow-auto rounded-2xl"
                onWheel={handlePreviewWheel}
                ref={previewFrameRef}
                onMouseDown={handlePreviewMouseDown}
                onMouseMove={handlePreviewMouseMove}
                onMouseLeave={hideCursorPreview}
                onContextMenu={(event) => event.preventDefault()}
                style={{
                  backgroundImage: 'repeating-conic-gradient(rgba(255,255,255,0.14) 0% 25%, transparent 0% 50%)',
                  backgroundSize: '22px 22px',
                  cursor: editableSrc ? (isPenMode ? 'crosshair' : 'grab') : 'default',
                }}
              >
                {isPenMode ? (
                  <canvas
                    ref={penCanvasRef}
                    onMouseDown={handlePenMouseDown}
                    onMouseMove={handlePenMouseMove}
                    className="max-h-full max-w-full object-contain"
                    style={{
                      cursor: 'crosshair',
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${adjustments.zoom / 100}) rotate(${adjustments.rotation}deg)`,
                    }}
                  />
                ) : (
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
                )}

                {isPenMode && cursorPreview.visible ? (
                  <div
                    className="pointer-events-none absolute rounded-full border border-white/80"
                    style={{
                      left: cursorPreview.x,
                      top: cursorPreview.y,
                      width: Math.max(8, Math.round(brushSize * (adjustments.zoom / 100))),
                      height: Math.max(8, Math.round(brushSize * (adjustments.zoom / 100))),
                      transform: 'translate(-50%, -50%)',
                      boxShadow: '0 0 0 1px rgba(0,0,0,0.45)',
                    }}
                  >
                    <span
                      className="absolute left-1/2 top-1/2 h-2 w-[1px] -translate-x-1/2 -translate-y-1/2 bg-white/85"
                    />
                    <span
                      className="absolute left-1/2 top-1/2 h-[1px] w-2 -translate-x-1/2 -translate-y-1/2 bg-white/85"
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="max-w-sm text-center text-sm text-zinc-300">Khong co anh de preview</div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-zinc-300">
            <span>Zoom bang con lan chuot, giu Ctrl + keo de pan nhanh.</span>
            <span className="font-semibold text-zinc-200">[ ] doi size brush, Shift + lan de zoom nhanh</span>
          </div>
        </div>

        <div className="flex w-full max-w-md flex-col border-l border-zinc-200 bg-zinc-50/70">
          <div className="border-b border-zinc-200 bg-white px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-zinc-400">Mockup Manager</p>
            <p className="mt-2 text-sm text-zinc-600">Chon mockup de xem/chinh sua, roi luu lai vao o hien tai.</p>
          </div>

          <div className="space-y-4 overflow-y-auto px-5 py-4">
            {previewOptionsState.length > 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                <div className="space-y-4">
                  <div>
                    {previewOptionsState.length ? (
                      <div className="grid grid-cols-2 gap-2">
                        {previewOptionsState.map((option) => {
                          const isActiveOption = option.id === selectedPreviewId
                          return (
                            <div
                              key={option.id}
                              className={`overflow-hidden rounded-xl border text-left transition ${
                                isActiveOption
                                  ? 'border-emerald-500 ring-2 ring-emerald-100'
                                  : 'border-zinc-200 hover:border-emerald-400'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => setSelectedPreviewId(option.id)}
                                disabled={isActionDisabled}
                                className="relative block w-full text-left disabled:opacity-50"
                              >
                                <img src={option.src} alt={option.label} className="h-20 w-full object-cover" />
                                <span className="block truncate px-2 py-1 text-[10px] font-semibold text-zinc-600">
                                  {option.label}
                                </span>
                                {isActiveOption ? (
                                  <span className="absolute right-2 top-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                                    Dang chon
                                  </span>
                                ) : null}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-4 text-center text-xs text-zinc-500">
                        Chua co mockup nao de hien thi.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-zinc-400">Pen Remove BG</p>
              <p className="mt-2 text-sm text-zinc-600">Bat che do but de xoa nen thu cong tren anh dang chon.</p>
              <button
                type="button"
                onClick={handleTogglePenMode}
                disabled={isActionDisabled || !editableSrc}
                className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white transition disabled:opacity-50 ${
                  isPenMode ? 'bg-orange-600 hover:bg-orange-700' : 'bg-zinc-800 hover:bg-zinc-900'
                }`}
              >
                <Brush className="h-4 w-4" />
                {isPenMode ? 'Tat che do but' : 'Bat che do but'}
              </button>

              <div className="mt-3">
                <div className="mb-2 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPenTool('magic')}
                    disabled={!isPenMode || isActionDisabled}
                    title="Magic Eraser Tool"
                    className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                      penTool === 'magic'
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                  >
                    <span className="inline-flex items-center justify-center">
                      <MagicEraserIcon className="h-4 w-4" />
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPenTool('eraser')}
                    disabled={!isPenMode || isActionDisabled}
                    title="Eraser Tool"
                    className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                      penTool === 'eraser'
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                  >
                    <span className="inline-flex items-center justify-center">
                      <EraserToolIcon className="h-4 w-4" />
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPenTool('background')}
                    disabled={!isPenMode || isActionDisabled}
                    title="Background Eraser Tool"
                    className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                      penTool === 'background'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                  >
                    <span className="inline-flex items-center justify-center">
                      <BgEraserToolIcon className="h-4 w-4" />
                    </span>
                  </button>
                </div>

                <div className="mb-2 text-[11px] text-zinc-500">
                  {penTool === 'magic'
                    ? 'Magic Eraser: click 1 diem de xoa vung theo mau.'
                    : penTool === 'background'
                      ? 'Background Eraser: keo chuot de xoa theo mau mau nen.'
                      : 'Eraser: keo chuot de xoa thu cong.'}
                </div>

                {penTool === 'background' ? (
                  <div className="mb-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setBgSampleMode('continuous')}
                      disabled={!isPenMode || isActionDisabled}
                      className={`rounded-md px-2 py-1.5 text-[11px] font-semibold transition disabled:opacity-50 ${
                        bgSampleMode === 'continuous'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      Sampling: Continuous
                    </button>
                    <button
                      type="button"
                      onClick={() => setBgSampleMode('once')}
                      disabled={!isPenMode || isActionDisabled}
                      className={`rounded-md px-2 py-1.5 text-[11px] font-semibold transition disabled:opacity-50 ${
                        bgSampleMode === 'once'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      Sampling: Once
                    </button>
                  </div>
                ) : null}

                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Brush size</span>
                  <span className="text-xs text-zinc-400">{brushSize}px</span>
                </div>
                <input
                  type="range"
                  min={6}
                  max={120}
                  value={brushSize}
                  onChange={(event) => setBrushSize(Number(event.target.value))}
                  disabled={!isPenMode || (penTool !== 'eraser' && penTool !== 'background') || isActionDisabled}
                  className="w-full accent-orange-500 disabled:opacity-50"
                />

                <div className="mb-1 mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Do nhay mau</span>
                  <span className="text-xs text-zinc-400">{wandTolerance}</span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={96}
                  value={wandTolerance}
                  onChange={(event) => setWandTolerance(Number(event.target.value))}
                  disabled={!isPenMode || (penTool !== 'magic' && penTool !== 'background') || isActionDisabled}
                  className="w-full accent-indigo-500 disabled:opacity-50"
                />

                <div className="mb-1 mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Do mem vien</span>
                  <span className="text-xs text-zinc-400">{wandFeather}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={60}
                  value={wandFeather}
                  onChange={(event) => setWandFeather(Number(event.target.value))}
                  disabled={!isPenMode || (penTool !== 'magic' && penTool !== 'background') || isActionDisabled}
                  className="w-full accent-indigo-500 disabled:opacity-50"
                />

                <label className="mt-3 inline-flex items-center gap-2 text-xs text-zinc-600">
                  <input
                    type="checkbox"
                    checked={wandContiguous}
                    onChange={(event) => setWandContiguous(event.target.checked)}
                    disabled={!isPenMode || penTool !== 'magic' || isActionDisabled}
                    className="h-3.5 w-3.5 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                  />
                  Chi xoa vung lien ke
                </label>
                {isPenMode && penTool === 'magic' ? (
                  <p className="mt-2 text-xs text-zinc-500">Bam 1 diem de xoa nhu magic eraser. Dung con lan de zoom, giu Ctrl + keo de pan.</p>
                ) : null}
                {isPenMode && penTool === 'background' ? (
                  <p className="mt-2 text-xs text-zinc-500">Continuous lay mau lien tuc. Once giu mau mau nen luc bam chuot dau tien.</p>
                ) : null}
                {isPenMode ? (
                  <p className="mt-1 text-[11px] text-zinc-400">Undo/Redo: Ctrl+Z, Ctrl+Y hoac Ctrl+Shift+Z.</p>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-zinc-400">Remove Background</p>
              <p className="mt-2 text-sm text-zinc-600">Bam nut de tu dong chay @imgly/background-removal cho anh dang chon.</p>
              <button
                type="button"
                onClick={handleRemoveBackground}
                disabled={isActionDisabled || !editableSrc}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {isRemovingBackground ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                {isRemovingBackground ? 'Dang tach nen...' : 'Remove Background (IMG.LY)'}
              </button>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-zinc-400">Custom AI Edit</p>
              <p className="mt-2 text-sm text-zinc-600">Nhap y tuong de AI tao them bien the mockup moi.</p>
              <textarea
                placeholder="VD: Lam sang hon, bo background xanh, them hieu ung..."
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                disabled={isActionDisabled}
                className="mt-3 min-h-20 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleApplyCustomEdit}
                disabled={isActionDisabled || !customPrompt.trim()}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
              >
                {isApplyingCustom ? <LoaderCircle className="h-4 w-4 animate-spin" /> : 'Ap dung Custom'}
              </button>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
              <div className="relative" ref={controlsDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowControls(!showControls)}
                  disabled={isPreparing || isSaving || !editableSrc}
                  className="inline-flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                >
                  <span>Chinh sua chi tiet</span>
                  <ChevronDown className={`h-4 w-4 transition ${showControls ? 'rotate-180' : ''}`} />
                </button>

                {showControls && (
                  <div className="mt-3 rounded-lg border border-zinc-300 bg-white">
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
                        Reset chinh sua
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            ) : null}
          </div>

          <div className="grid gap-2 border-t border-zinc-200 bg-white px-5 py-4">
            <button
              type="button"
              onClick={handleApply}
              disabled={isPreparing || isSaving || !editableSrc}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
            >
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ZoomIn className="h-4 w-4" />}
              Luu vao o hien tai
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={isPreparing || isSaving || !editableSrc}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-300 px-4 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Tai anh da chinh sua
            </button>
            <button
              type="button"
              onClick={handleDownloadSelectedPreview}
              disabled={!selectedPreviewOption?.src}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-300 px-4 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Tai preview dang chon
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'

const parseCSVLine = (line) => {
  const result = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"' && line[i + 1] === '"') {
      cell += '"'
      i++
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(cell)
      cell = ''
    } else {
      cell += char
    }
  }
  result.push(cell)
  return result
}

const parseCSV = (csvText) => {
  const lines = csvText.split(/\r?\n/)
  if (lines.length === 0) return []

  const headers = parseCSVLine(lines[0]).map((header) => header.trim())
  const rows = []

  for (let i = 1; i < lines.length; i++) {
    const currentLine = lines[i]
    if (!currentLine.trim()) continue

    const values = parseCSVLine(currentLine)
    const row = {}

    headers.forEach((header, index) => {
      row[header] = values[index] || ''
    })

    rows.push(row)
  }
  return rows
}

const normalizeHeader = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '')

const getValueByAliases = (row, aliases) => {
  const normalizedAliases = aliases.map(normalizeHeader)
  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.includes(normalizeHeader(key))) {
      return value
    }
  }
  return null
}

const extractSheetInfo = (url) => {
  const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/)
  const gidMatch = url.match(/[?&]gid=([0-9]+)/) || url.match(/#gid=(\d+)/)
  return {
    id: idMatch ? idMatch[1] : null,
    gid: gidMatch ? gidMatch[1] : '0',
  }
}

const normalizeDriveImageUrl = (url) => {
  const value = String(url || '').trim()
  if (!value) return ''
  if (!/drive\.google\.com/i.test(value)) return value

  const directMatch = value.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (directMatch?.[1]) return `https://drive.google.com/thumbnail?id=${directMatch[1]}&sz=w200`

  const openMatch = value.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (openMatch?.[1]) return `https://drive.google.com/thumbnail?id=${openMatch[1]}&sz=w200`

  return value
}

export default function ListedItemsModal({ isOpen, onClose, sheetUrl }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  if (!isOpen) return null

  const filteredItems = items.filter(item => {
    const term = searchTerm.toLowerCase()
    return item.keyword.toLowerCase().includes(term) || item.stt.toString().includes(term)
  })

  const handleGet = async () => {
    if (!sheetUrl) {
      setError('Không tìm thấy link sheet!')
      return
    }

    const { id: sheetId, gid } = extractSheetInfo(sheetUrl)
    if (!sheetId) {
      setError('Link sheet không hợp lệ!')
      return
    }

    setLoading(true)
    setError('')
    setItems([])

    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
      const response = await fetch(csvUrl)
      if (!response.ok) {
        throw new Error('Không thể tải dữ liệu từ sheet')
      }
      const csvText = await response.text()
      const rows = parseCSV(csvText)

      const filtered = rows
        .map((row, index) => {
          const stt = getValueByAliases(row, ['STT'])
          const keyword = getValueByAliases(row, ['KEYWORD', 'Keyword'])
          const redesign = getValueByAliases(row, ['REDESIGN', 'Redesign'])
          const description = getValueByAliases(row, ['DESCRIPTION', 'Description'])

          // Validate and clean data
          let cleanStt = String(stt || '').trim()
          let cleanKeyword = String(keyword || '').trim()
          let cleanDescription = String(description || '').trim()

          // If STT looks like a description, try to find the actual STT
          if (cleanStt.length > 10 || cleanStt.includes('.') || cleanStt.includes('?')) {
            // Look for numeric STT in other columns
            for (const [key, value] of Object.entries(row)) {
              const numValue = String(value || '').trim()
              if (/^\d+$/.test(numValue)) {
                cleanStt = numValue
                break
              }
            }
          }

          // Skip if keyword looks like a description (too long or contains sentences)
          if (cleanKeyword.length > 30 || cleanKeyword.includes('.') || cleanKeyword.includes('?')) {
            cleanKeyword = `Item ${index + 1}`
          }

          // Remove duplicate keywords (split by space and check for repetition)
          const keywordParts = cleanKeyword.split(/\s+/)
          if (keywordParts.length >= 2 && keywordParts[0] === keywordParts[1]) {
            cleanKeyword = keywordParts[0]
          }

          // Truncate long descriptions
          if (cleanDescription.length > 80) {
            cleanDescription = cleanDescription.substring(0, 80) + '...'
          }

          return {
            stt: cleanStt,
            keyword: cleanKeyword,
            description: cleanDescription,
            redesign: String(redesign || '').trim()
          }
        })
        .filter((item) => {
          // Only include items with valid numeric STT
          const sttNum = parseInt(item.stt)
          return item.redesign.length > 0 && 
                 item.keyword.length > 0 && 
                 !isNaN(sttNum) && 
                 sttNum > 0
        })

      setItems(filtered)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl"
        style={{ maxHeight: '85vh', minHeight: '50vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="rounded-full border-2 border-zinc-800 bg-zinc-100 px-6 py-1.5 text-lg font-bold text-zinc-900">
              Đã list
            </div>
            <input
              type="text"
              placeholder="Search by STT or Keyword..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleGet}
              disabled={loading}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-1.5 text-sm font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
            >
              {loading ? 'Đang tải...' : 'Get'}
            </button>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-600"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-zinc-50/50">
          {error && <div className="mb-4 text-sm text-red-500">{error}</div>}
          
          {items.length === 0 && !loading && !error && (
            <div className="text-center text-sm text-zinc-500 mt-10">
              Bấm "Get" để tải dữ liệu các item đã có ảnh REDESIGN.
            </div>
          )}

          <div className="space-y-4">
            {filteredItems.map((item, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-1 flex-1 min-w-0 max-h-20 overflow-hidden">
                  <div className="text-xs font-semibold text-zinc-600">
                    STT: <span className="font-normal text-zinc-900 truncate">{item.stt}</span>
                  </div>
                  <div className="text-xs font-semibold text-zinc-600">
                    Keyword: <span className="font-normal text-zinc-900 truncate block">{item.keyword}</span>
                  </div>
              
                </div>
                <div className="h-16 w-16 flex-shrink-0 rounded-lg overflow-hidden border border-zinc-200 cursor-pointer hover:opacity-80 transition" onClick={() => window.open(item.redesign, '_blank')}>
                  <img
                    src={normalizeDriveImageUrl(item.redesign)}
                    alt={item.keyword || 'Redesign'}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

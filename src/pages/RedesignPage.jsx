import { useState } from 'react'

export default function RedesignPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [sheetLink, setSheetLink] = useState('')
  const [error, setError] = useState('')
  const [data, setData] = useState([])
  const [pageSize, setPageSize] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedRows, setSelectedRows] = useState([])

  const toggleSelectRow = (index) => {
    setSelectedRows(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    )
  }

  const handleRedesignSelected = () => {
    const selectedData = selectedRows.map(i => data[i])
    console.log('Redesign selected:', selectedData)
    // TODO: Implement redesign logic
  }

  const handleRedesignRow = (index) => {
    console.log('Redesign row:', data[index])
    // TODO: Implement redesign logic
  }

  const extractSheetInfo = (url) => {
    const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/)
    const gidMatch = url.match(/#gid=(\d+)/)
    return {
      id: idMatch ? idMatch[1] : null,
      gid: gidMatch ? gidMatch[1] : '0'
    }
  }

  const parseCSV = (csvText) => {
    const lines = csvText.trim().split('\n')
    if (lines.length < 2) return []

    const headers = lines[0].split(',').map(h => h.trim())
    const rows = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim())
      const obj = {}
      headers.forEach((header, index) => {
        obj[header] = values[index] || ''
      })
      return obj
    })
    return rows
  }

  const handleGetData = async () => {
    if (!sheetLink) {
      setError('Vui lòng nhập link sheet')
      return
    }

    const { id: sheetId, gid } = extractSheetInfo(sheetLink)
    if (!sheetId) {
      setError('Link sheet không hợp lệ')
      return
    }

    setIsLoading(true)
    setProgress(0)
    setError('')
    setData([])
    setCurrentPage(1)

    // Simulate progress
    const interval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 10, 90))
    }, 200)

    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
      const response = await fetch(csvUrl)

      if (!response.ok) {
        throw new Error('Không thể truy cập sheet. Đảm bảo sheet được chia sẻ công khai.')
      }

      const csvData = await response.text()
      const parsedData = parseCSV(csvData)

      clearInterval(interval)
      setProgress(100)
      setData(parsedData)
    } catch (err) {
      clearInterval(interval)
      setError(err.message)
    } finally {
      setIsLoading(false)
      setProgress(0)
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h1 className="text-2xl font-bold">Redesign</h1>
      <p className="mt-2 text-sm text-white/70">
        Đây là màn hình Redesign.
      </p>
      <div className="mt-4">
        <input
          type="text"
          value={sheetLink}
          onChange={(e) => setSheetLink(e.target.value)}
          placeholder="Nhập link Google Sheets"
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white placeholder-zinc-400"
        />
        <button
          onClick={handleGetData}
          disabled={isLoading}
          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? 'Đang tải...' : 'Lấy dữ liệu từ Sheet'}
        </button>
        {error && <p className="mt-2 text-red-500 text-sm">{error}</p>}
        {isLoading && (
          <div className="mt-2">
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-sm text-white/70 mt-1">{progress}%</p>
          </div>
        )}
        {data.length > 0 && (
          <div className="mt-4">
            <h2 className="text-lg font-semibold text-white">Dữ liệu từ Sheet:</h2>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center space-x-2">
                <label className="text-white">Hiển thị:</label>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-white"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <span className="text-white">hàng/trang</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleRedesignSelected}
                  disabled={selectedRows.length === 0}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  Redesign Selected ({selectedRows.length})
                </button>
                <div className="text-white">
                  Trang {currentPage} / {Math.ceil(data.length / pageSize)}
                </div>
              </div>
            </div>
            <div className="overflow-x-auto mt-2">
              <table className="min-w-full bg-zinc-800 border border-zinc-700 rounded">
                <thead>
                  <tr>
                    <th className="px-4 py-2 border-b border-zinc-600 text-left text-white">Chọn</th>
                    <th className="px-4 py-2 border-b border-zinc-600 text-left text-white">Keyword</th>
                    <th className="px-4 py-2 border-b border-zinc-600 text-left text-white">Ảnh</th>
                    <th className="px-4 py-2 border-b border-zinc-600 text-left text-white">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {data.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((row, index) => {
                    const globalIndex = (currentPage - 1) * pageSize + index
                    return (
                      <tr key={globalIndex} className="hover:bg-zinc-700">
                        <td className="px-4 py-2 border-b border-zinc-600 text-white">
                          <input
                            type="checkbox"
                            checked={selectedRows.includes(globalIndex)}
                            onChange={() => toggleSelectRow(globalIndex)}
                          />
                        </td>
                        <td className="px-4 py-2 border-b border-zinc-600 text-white">
                          {row.Keyword || row.keyword || ''}
                        </td>
                        <td className="px-4 py-2 border-b border-zinc-600 text-white">
                          {row['Ảnh'] || row.image || row.Image ? (
                            (row['Ảnh'] || row.image || row.Image).match(/^https?:\/\/.*\.(jpg|jpeg|png|gif|webp|svg)$/i) ? (
                              <img src={row['Ảnh'] || row.image || row.Image} alt="Image" className="w-16 h-16 object-cover rounded" />
                            ) : (
                              row['Ảnh'] || row.image || row.Image
                            )
                          ) : ''}
                        </td>
                        <td className="px-4 py-2 border-b border-zinc-600 text-white">
                          <button
                            onClick={() => handleRedesignRow(globalIndex)}
                            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            Redesign
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-center mt-4 space-x-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-zinc-700 text-white rounded disabled:opacity-50"
              >
                Trước
              </button>
              <span className="text-white">
                {Array.from({ length: Math.ceil(data.length / pageSize) }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-2 py-1 mx-1 rounded ${page === currentPage ? 'bg-blue-600' : 'bg-zinc-700'} text-white`}
                  >
                    {page}
                  </button>
                ))}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(Math.ceil(data.length / pageSize), currentPage + 1))}
                disabled={currentPage === Math.ceil(data.length / pageSize)}
                className="px-3 py-1 bg-zinc-700 text-white rounded disabled:opacity-50"
              >
                Sau
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
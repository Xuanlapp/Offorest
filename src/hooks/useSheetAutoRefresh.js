// src/hooks/useSheetAutoRefresh.js
// Hook tự động refresh dữ liệu từ Google Sheet theo chu kỳ, an toàn và không lag.
// Chỉ cập nhật khi app đang rảnh (không có AI/upload đang chạy).

import { useEffect, useRef, useCallback } from 'react'

const DEFAULT_INTERVAL_MS = 30_000 // 30 giây

/**
 * @param {object} options
 * @param {string} options.csvUrl           - URL CSV của Google Sheet (export?format=csv&gid=...)
 * @param {boolean} options.enabled         - Có bật auto-refresh không (false khi chưa có sheet URL)
 * @param {boolean} options.isBusy          - App có đang bận không (AI đang chạy, upload đang chạy...)
 * @param {function} options.parseRows      - Hàm parse CSV text → array rows (cùng chuẩn với handleGetData)
 * @param {function} options.onNewRows      - Callback khi phát hiện dòng mới: (newRows) => void
 * @param {function} options.getRowKey      - Hàm lấy key duy nhất từ 1 row để so sánh (mặc định: row.stt)
 * @param {function} options.getCurrentData - Hàm lấy data hiện tại (để so sánh, tránh closure cũ)
 * @param {number}  [options.intervalMs]    - Chu kỳ polling (mặc định 30s)
 */
export function useSheetAutoRefresh({
  csvUrl,
  enabled,
  isBusy,
  parseRows,
  onNewRows,
  getRowKey = (row) => row.stt || row.keyword || JSON.stringify(row),
  getCurrentData,
  intervalMs = DEFAULT_INTERVAL_MS,
}) {
  // Dùng ref để tránh stale closure trong setInterval
  const isBusyRef = useRef(isBusy)
  const csvUrlRef = useRef(csvUrl)
  const parseRowsRef = useRef(parseRows)
  const onNewRowsRef = useRef(onNewRows)
  const getRowKeyRef = useRef(getRowKey)
  const getCurrentDataRef = useRef(getCurrentData)
  const isPollingRef = useRef(false) // guard: ngăn 2 fetch chạy cùng lúc

  // Sync refs mỗi render để luôn dùng giá trị mới nhất
  useEffect(() => { isBusyRef.current = isBusy }, [isBusy])
  useEffect(() => { csvUrlRef.current = csvUrl }, [csvUrl])
  useEffect(() => { parseRowsRef.current = parseRows }, [parseRows])
  useEffect(() => { onNewRowsRef.current = onNewRows }, [onNewRows])
  useEffect(() => { getRowKeyRef.current = getRowKey }, [getRowKey])
  useEffect(() => { getCurrentDataRef.current = getCurrentData }, [getCurrentData])

  const pollOnce = useCallback(async () => {
    // Bỏ qua nếu đang bận hoặc đang có 1 fetch khác chạy
    if (isBusyRef.current || isPollingRef.current) return
    if (!csvUrlRef.current) return

    isPollingRef.current = true
    try {
      const response = await fetch(csvUrlRef.current)
      if (!response.ok) return

      const csvText = await response.text()
      const fetchedRows = parseRowsRef.current(csvText)

      const currentData = getCurrentDataRef.current()
      const existingKeys = new Set(
        (Array.isArray(currentData) ? currentData : []).map(getRowKeyRef.current)
      )

      const newRows = fetchedRows.filter((row) => {
        const key = getRowKeyRef.current(row)
        return key && !existingKeys.has(key)
      })

      if (newRows.length > 0) {
        onNewRowsRef.current(newRows)
      }
    } catch {
      // Silent fail — không làm phiền user khi background fetch lỗi
    } finally {
      isPollingRef.current = false
    }
  }, []) // deps rỗng vì tất cả đều qua ref

  useEffect(() => {
    if (!enabled) return

    const timer = setInterval(pollOnce, intervalMs)

    return () => {
      clearInterval(timer)
    }
  }, [enabled, intervalMs, pollOnce])
}

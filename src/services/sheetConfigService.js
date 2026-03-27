// src/services/sheetConfigService.js
// Service để quản lý config Google Sheets cho các pages

// ⚠️ THAY ĐỔI SHEET ID NÀY THÀNH ID CỦA SHEET CONFIG CỦA BẠN
// Tạo sheet mới và đặt tên sheet đầu tiên là 'Config'
// Format: | Page | SheetURL |
// Ví dụ: | holoarcylic | https://docs.google.com/spreadsheets/d/... |
const CONFIG_SHEET_ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'; // Thay bằng sheet ID thực tế
const CONFIG_SHEET_NAME = 'Config'; // Tên sheet chứa config

// Cache để tránh gọi API nhiều lần
let configCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 phút

/**
 * Lấy config từ Google Sheets
 * Format sheet config:
 * | Page | SheetURL |
 * |-------|----------|
 * | holoarcylic | https://docs.google.com/spreadsheets/d/... |
 * | suncatcher | https://docs.google.com/spreadsheets/d/... |
 */
export async function getSheetConfig() {
  const now = Date.now();

  // Kiểm tra cache
  if (configCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return configCache;
  }

  try {
    const accessToken = localStorage.getItem('googleDriveAccessToken');
    if (!accessToken) {
      throw new Error('Access Token chưa được cấu hình');
    }

    // Gọi Google Sheets API để lấy data
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG_SHEET_ID}/values/${CONFIG_SHEET_NAME}!A:B`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Lỗi API: ${response.status}`);
    }

    const data = await response.json();
    const rows = data.values || [];

    // Parse config
    const config = {};
    for (let i = 1; i < rows.length; i++) { // Bỏ qua header row
      const [page, sheetUrl] = rows[i];
      if (page && sheetUrl) {
        config[page.toLowerCase().trim()] = sheetUrl.trim();
      }
    }

    // Cache kết quả
    configCache = config;
    cacheTimestamp = now;

    return config;
  } catch (error) {
    console.error('Lỗi khi lấy sheet config:', error);
    throw error;
  }
}

/**
 * Lấy sheet URL cho một page cụ thể
 */
export async function getSheetUrlForPage(pageName) {
  const config = await getSheetConfig();
  const normalizedPage = pageName.toLowerCase().trim();

  const sheetUrl = config[normalizedPage] || (normalizedPage === 'suncatcher' ? config.ornament : null);
  if (!sheetUrl) {
    throw new Error(`Không tìm thấy config cho page: ${pageName}`);
  }

  return sheetUrl;
}

/**
 * Clear cache (khi cần refresh config)
 */
export function clearConfigCache() {
  configCache = null;
  cacheTimestamp = 0;
}
import { APP_MODES } from './nav.modes'

/**
 * NAV_ITEMS được tạo tự động từ APP_MODES
 * Để thêm/sửa/xóa item, chỉ cần chỉnh sửa APP_MODES trong nav.modes.js
 */
export const NAV_ITEMS = Object.entries(APP_MODES).map(([key, config]) => ({
  key,
  label: config.label,
  path: config.path,
  icon: config.icon,
  permissions: config.permissions,
}))
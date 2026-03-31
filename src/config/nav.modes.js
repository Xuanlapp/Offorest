import { PERMISSIONS } from './permission'

/**
 * Định nghĩa các mode/trang chính của ứng dụng
 * Chỉ cần chỉnh sửa object này, NAV_ITEMS sẽ tự động cập nhật
 */
export const APP_MODES = {
 
  holoornament: {
    label: 'Holoarcylic',
    path: '/holoarcylic',
    icon: 'MessageCircle',
    permissions: [PERMISSIONS.HOLOARCYLIC_VIEW],
    component: 'HoloarcylicPage',
  },
  suncatcher: {
    label: 'Suncatcher',
    path: '/suncatcher',
    icon: 'MessageCircle',
    permissions: [PERMISSIONS.HOLOARCYLIC_VIEW],
    component: 'SuncatcherPage',
  },
  sticker: {
    label: 'Sticker',
    path: '/sticker',
    icon: 'MessageCircle',
    permissions: [PERMISSIONS.STICKER_VIEW],
    component: 'StickerPage',
  },
  }

/**
 * Type cho AppMode
 * export type AppMode = keyof typeof APP_MODES
 */
export const APP_MODE_KEYS = Object.keys(APP_MODES)

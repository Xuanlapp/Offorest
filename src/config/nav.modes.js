import { PERMISSIONS } from './permission'

/**
 * Định nghĩa các mode/trang chính của ứng dụng
 * Chỉ cần chỉnh sửa object này, NAV_ITEMS sẽ tự động cập nhật
 */
export const APP_MODES = {
 combosticker: {
    label: 'Combosticker',
    path: '/combosticker',
    icon: 'MessageCircle',
    permissions: [PERMISSIONS.COMBO_STICKER_VIEW],
    component: 'ComboStickerPage',
  },
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
  // redesign: {
  //   label: 'Redesign',
  //   path: '/redesign',
  //   icon: 'Palette',
  //   permissions: [PERMISSIONS.REDESIGN_VIEW],
  // },
  // video: {
  //   label: 'Video',
  //   path: '/video',
  //   icon: 'Video',
  //   permissions: [PERMISSIONS.HOLOARCYLIC_VIEW],
  // },
  // canvas: {
  //   label: 'Canvas',
  //   path: '/canvas',
  //   icon: 'Pencil',
  //   permissions: [PERMISSIONS.HOLOARCYLIC_VIEW],
  // },
  // sheet: {
  //   label: 'Sheet',
  //   path: '/sheet',
  //   icon: 'Grid3x3',
  //   badge: 'Soon',
  //   badgeColor: 'bg-yellow-500/80',
  //   permissions: [PERMISSIONS.HOLOARCYLIC_VIEW],
  // },
  // clone: {
  //   label: 'Clone',
  //   path: '/clone',
  //   icon: 'Copy',
  //   badge: 'New',
  //   permissions: [PERMISSIONS.HOLOARCYLIC_VIEW],
  // },
  // mockup: {
  //   label: 'Mockup',
  //   path: '/mockup',
  //   icon: 'Smartphone',
  //   badge: 'New',
  //   badgeColor: 'bg-green-500/80',
  //   permissions: [PERMISSIONS.HOLOARCYLIC_VIEW],
  // },
}

/**
 * Type cho AppMode
 * export type AppMode = keyof typeof APP_MODES
 */
export const APP_MODE_KEYS = Object.keys(APP_MODES)

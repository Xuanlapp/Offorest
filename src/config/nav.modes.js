import { PERMISSIONS } from './permission'

/**
 * Định nghĩa các mode/trang chính của ứng dụng
 * Chỉ cần chỉnh sửa object này, NAV_ITEMS sẽ tự động cập nhật
 */
export const APP_MODES = {
  holoornament: {
    label: 'Holoarcylic',
    path: '/holoarcylic',
    icon: 'Orbit',
    permissions: [PERMISSIONS.HOLOARCYLIC_VIEW],
    component: 'HoloarcylicPage',
  },
  suncatcher: {
    label: 'Suncatcher',
    path: '/suncatcher',
    icon: 'SunMedium',
    permissions: [PERMISSIONS.SUNCATCHER_VIEW],
    component: 'SuncatcherPage',
  },
  sticker: {
    label: 'Sticker',
    path: '/sticker',
    icon: 'Sticker',
    permissions: [PERMISSIONS.STICKER_VIEW],
    component: 'StickerPage',
  },
  mockup: {
    label: 'Mockup',
    path: '/mockup',
    icon: 'MessageCircle',
    permissions: [PERMISSIONS.MOCKUP_VIEW],
    component: 'MockupPage',
  },
  patch: {
    label: 'Patch',
    path: '/patch',
    icon: 'Scissors',
    permissions: [PERMISSIONS.REDESIGN_VIEW],
    component: 'PatchPage',
  },
  admin: {
    label: 'Admin',
    path: '/admin',
    icon: 'ShieldUser',
    permissions: [PERMISSIONS.ADMIN_VIEW],
    component: 'AdminPage',
  },
  redesign: {
    label: 'Redesign',
    path: '/redesign',
    icon: 'Brush',
    permissions: [PERMISSIONS.REDESIGN_VIEW],
    component: 'RedesignPage',
  },
}

/**
 * Type cho AppMode
 * export type AppMode = keyof typeof APP_MODES
 */
export const APP_MODE_KEYS = Object.keys(APP_MODES)

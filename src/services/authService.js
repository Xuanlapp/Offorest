import { PERMISSIONS } from '../config/permission'
import { APP_MODES } from '../config/nav.modes'

const ROLE_PERMISSIONS = {
  admin: [
    PERMISSIONS.HOLOARCYLIC_VIEW,
    PERMISSIONS.COMBO_STICKER_VIEW,
    PERMISSIONS.REDESIGN_VIEW,
  ],
  design: [
    PERMISSIONS.HOLOARCYLIC_VIEW,
    PERMISSIONS.REDESIGN_VIEW,
  ],
  sticker: [
    PERMISSIONS.COMBO_STICKER_VIEW,
  ],
}

const API_BASE_URL = 'https://nhxlap.id.vn/wp-json/offorest-api/v1'

const normalizeProductCode = (value = '') =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')

const PRODUCT_PERMISSION_MAP = {
  combosticker: PERMISSIONS.COMBO_STICKER_VIEW,
  'combo-sticker': PERMISSIONS.COMBO_STICKER_VIEW,
  'combo-sticker-view': PERMISSIONS.COMBO_STICKER_VIEW,
  'combo-stickers': PERMISSIONS.COMBO_STICKER_VIEW,
  holoornament: PERMISSIONS.HOLOARCYLIC_VIEW,
  holoarcylic: PERMISSIONS.HOLOARCYLIC_VIEW,
  'holo-acrylic': PERMISSIONS.HOLOARCYLIC_VIEW,
  'holo-arcylic': PERMISSIONS.HOLOARCYLIC_VIEW,
  suncatcher: PERMISSIONS.HOLOARCYLIC_VIEW,
  ornament: PERMISSIONS.HOLOARCYLIC_VIEW,
  redesign: PERMISSIONS.REDESIGN_VIEW,
}

const PRODUCT_PATH_MAP = {
  combosticker: APP_MODES.combosticker?.path,
  'combo-sticker': APP_MODES.combosticker?.path,
  'combo-sticker-view': APP_MODES.combosticker?.path,
  'combo-stickers': APP_MODES.combosticker?.path,
  holoornament: APP_MODES.holoornament?.path,
  holoarcylic: APP_MODES.holoornament?.path,
  'holo-acrylic': APP_MODES.holoornament?.path,
  'holo-arcylic': APP_MODES.holoornament?.path,
  suncatcher: APP_MODES.suncatcher?.path,
  ornament: APP_MODES.suncatcher?.path,
  redesign: APP_MODES.redesign?.path,
}

const buildPermissionsFromProducts = (products = []) => {
  const mapped = products
    .map((product) => PRODUCT_PERMISSION_MAP[normalizeProductCode(product?.code || '')])
    .filter(Boolean)

  return [...new Set(mapped)]
}

export const login = async (username, password) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || 'Login failed')
    }

    const apiUser = data?.user || {}
    const products = Array.isArray(data?.products) ? data.products : []
    const permissions = buildPermissionsFromProducts(products)

    const user = {
      id: apiUser.user_id || data.id || data.user_id,
      username: apiUser.username || data.username || username,
      name: apiUser.full_name || data.name || apiUser.username || username,
      email: apiUser.email || data.email || '',
      role: apiUser.role_code || data.role || 'user',
      status: apiUser.status,
      token: data.token || data.access_token,
      products,
      permissions,
      api_keys: typeof data?.api_keys === 'object' ? data.api_keys : {},
    }
    localStorage.setItem('user', JSON.stringify(user))
    console.log('Login successful:', user)
    return user
  } catch (error) {
    throw new Error(error.message || 'Không thể kết nối đến server. Vui lòng kiểm tra lại.')
  }
}

export const logout = () => {
  localStorage.clear()
  sessionStorage.clear()
}

export const getCurrentUser = () => {
  const userStr = localStorage.getItem('user')
  if (!userStr) return null

  const user = JSON.parse(userStr)
  const productPermissions = buildPermissionsFromProducts(user.products)

  return {
    ...user,
    permissions: productPermissions,
  }
}

export const getDefaultPathForUser = (user) => {
  if (!user) return '/login'

  const products = Array.isArray(user?.products) ? user.products : []
  const productPermissions = buildPermissionsFromProducts(products)

  if (!products.length || !productPermissions.length) {
    return '/no-permission'
  }

  if (products.length > 0) {
    const firstProductCode = normalizeProductCode(products[0]?.code || '')
    const firstProductPath = PRODUCT_PATH_MAP[firstProductCode]

    if (firstProductPath) {
      return firstProductPath
    }

    return '/no-permission'
  }

  return '/no-permission'
}

export const isAuthenticated = () => {
  return getCurrentUser() !== null
}

export const hasPermission = (user, requiredPermissions = []) => {
  if (!requiredPermissions.length) return true
  if (!user?.permissions?.length) return false

  return requiredPermissions.some((permission) =>
    user.permissions.includes(permission)
  )
}

export const getApiKeyByProvider = (provider = 'gemini') => {
  const user = getCurrentUser()
  if (!user?.api_keys || typeof user.api_keys !== 'object') return null

  const apiKeyObj = user.api_keys[provider]
  if (apiKeyObj?.is_active) {
    return apiKeyObj.key || null
  }

  return null
}
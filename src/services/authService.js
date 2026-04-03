import { PERMISSIONS } from '../config/permission'
import { APP_MODES } from '../config/nav.modes'

const ROLE_PERMISSIONS = {
  admin: [
    PERMISSIONS.HOLOARCYLIC_VIEW,
    PERMISSIONS.COMBO_STICKER_VIEW,
    PERMISSIONS.REDESIGN_VIEW,
    PERMISSIONS.STICKER_VIEW,
    PERMISSIONS.ADMIN_VIEW,
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
  sticker: PERMISSIONS.STICKER_VIEW,
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

const PRODUCT_ID_MAP = {
  1: { code: 'sticker', path: APP_MODES.sticker?.path, permission: PERMISSIONS.STICKER_VIEW },
  2: { code: 'ornament', path: APP_MODES.holoornament?.path, permission: PERMISSIONS.HOLOARCYLIC_VIEW },
  3: { code: 'suncatcher', path: APP_MODES.suncatcher?.path, permission: PERMISSIONS.HOLOARCYLIC_VIEW },
}

const PRODUCT_PATH_MAP = {
  sticker: APP_MODES.sticker?.path,
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

const normalizeProductItems = (value = []) => {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (typeof item === 'number') {
        const mapped = PRODUCT_ID_MAP[item]
        return mapped ? { id: item, code: mapped.code, path: mapped.path } : null
      }

      if (typeof item === 'string') {
        const code = normalizeProductCode(item)
        return { code, path: PRODUCT_PATH_MAP[code] || null }
      }

      if (item && typeof item === 'object') {
        const id = Number(item.id ?? item.product_type_id ?? item.productTypeId ?? item.value ?? 0) || null
        const code = normalizeProductCode(item.code || item.slug || item.name || item.label || '')
        const mappedFromId = id ? PRODUCT_ID_MAP[id] : null

        return {
          id,
          code: code || mappedFromId?.code || '',
          path: mappedFromId?.path || PRODUCT_PATH_MAP[code] || null,
        }
      }

      return null
    })
    .filter(Boolean)
}

const getProductTypesFromApiUser = (apiUser = {}, data = {}) => {
  const directProducts = Array.isArray(data?.products) ? data.products : []
  const directProductTypes = Array.isArray(apiUser?.product_types)
    ? apiUser.product_types
    : Array.isArray(data?.product_types)
      ? data.product_types
      : []
  const directProductTypeIds = Array.isArray(apiUser?.product_type_ids)
    ? apiUser.product_type_ids
    : Array.isArray(data?.product_type_ids)
      ? data.product_type_ids
      : []

  const normalizedFromObjects = normalizeProductItems(directProducts)
  const normalizedFromTypes = normalizeProductItems(directProductTypes)
  const normalizedFromIds = normalizeProductItems(directProductTypeIds)

  return [...normalizedFromObjects, ...normalizedFromTypes, ...normalizedFromIds]
}

export const getFirstProductPath = (userOrProducts = []) => {
  const products = Array.isArray(userOrProducts)
    ? userOrProducts
    : getProductTypesFromApiUser(userOrProducts, userOrProducts)

  if (!products.length) return '/no-permission'

  const firstProduct = products[0]
  const firstProductId = Number(firstProduct?.id || firstProduct?.product_type_id || 0)
  const firstProductCode = normalizeProductCode(firstProduct?.code || firstProduct?.slug || firstProduct?.name || '')

  return PRODUCT_ID_MAP[firstProductId]?.path || PRODUCT_PATH_MAP[firstProductCode] || '/no-permission'
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
    const products = getProductTypesFromApiUser(apiUser, data)
    const permissions = buildPermissionsFromProducts(products)

    const user = {
      id: apiUser.user_id || data.id || data.user_id,
      username: apiUser.username || data.username || username,
      name: apiUser.full_name || data.name || apiUser.username || username,
      email: apiUser.email || data.email || '',
      role: apiUser.role_code || data.role || 'user',
      status: apiUser.status,
      role_code: apiUser.role_code || data.role || 'user',
      token: data.token || data.access_token,
      products,
      product_types: products,
      product_type_ids: products
        .map((item) => Number(item?.id || item?.product_type_id || 0))
        .filter(Boolean),
      permissions,
    }
    localStorage.setItem('user', JSON.stringify(user))
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
  const products = getProductTypesFromApiUser(user, user)
  const productPermissions = buildPermissionsFromProducts(products)
  const rolePermissions = ROLE_PERMISSIONS[String(user.role_code || user.role || '').toLowerCase()] || []

  return {
    ...user,
    products,
    product_types: products,
    permissions: [...new Set([...productPermissions, ...rolePermissions])],
  }
}

export const getDefaultPathForUser = (user) => {
  if (!user) return '/login'

  const roleCode = String(user?.role_code || user?.role || '').toLowerCase()
  if (roleCode === 'admin') {
    return '/admin'
  }

  const products = getProductTypesFromApiUser(user, user)
  const productPermissions = buildPermissionsFromProducts(products)

  if (!products.length || !productPermissions.length) {
    return '/no-permission'
  }

  return getFirstProductPath(products)
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

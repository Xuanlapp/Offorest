import { getCurrentUser } from './authService'

const API_BASE_URL = 'https://nhxlap.id.vn/wp-json/offorest-api/v1'
const API_BASE_URL_Local = 'http://offorest-wp.com.vn/wp-json/offorest-api/v1'
const getAuthHeaders = () => {
  const user = getCurrentUser()
  const token = user?.token || user?.access_token

  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

const parseJsonResponse = async (response) => {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

const normalizeAdminUsersResponse = (data) => {
  if (Array.isArray(data)) {
    return {
      users: [],
      vertex: data,
      data,
      raw: data,
    }
  }

  if (data && typeof data === 'object') {
    return {
      ...data,
      users: Array.isArray(data.users) ? data.users : [],
      vertex: Array.isArray(data.vertex)
        ? data.vertex
        : Array.isArray(data.data?.vertex)
          ? data.data.vertex
          : Array.isArray(data.data)
            ? data.data
            : [],
    }
  }

  return {
    users: [],
    vertex: [],
    data: null,
    raw: data,
  }
}

export const fetchAdminUsers = async () => {
  const response = await fetch(`${API_BASE_URL}/admin/users`, {
    method: 'GET',
    headers: getAuthHeaders(),
  })

  const data = await parseJsonResponse(response)
  if (!response.ok) {
    throw new Error(data?.message || 'Không thể tải danh sách users')
  }

  return normalizeAdminUsersResponse(data)
}

export const upsertAdminUser = async (payload) => {
  const response = await fetch(`${API_BASE_URL}/admin/users/upsert`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  })

  const data = await parseJsonResponse(response)
  if (!response.ok) {
    throw new Error(data?.message || 'Không thể lưu user')
  }

  return data
}

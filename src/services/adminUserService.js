import { getCurrentUser } from './authService'

const API_BASE_URL = 'https://nhxlap.id.vn/wp-json/offorest-api/v1'

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

export const fetchAdminUsers = async () => {
  const response = await fetch(`${API_BASE_URL}/admin/users`, {
    method: 'GET',
    headers: getAuthHeaders(),
  })

  const data = await parseJsonResponse(response)
  if (!response.ok) {
    throw new Error(data?.message || 'Không thể tải danh sách users')
  }

  return data
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

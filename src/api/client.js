const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

async function parseError(response) {
  try {
    const data = await response.json()
    if (typeof data.detail === 'string') return data.detail
    if (Array.isArray(data.detail)) {
      return data.detail.map((item) => item.msg).join(', ')
    }
    return 'Request failed'
  } catch {
    return `Request failed (${response.status})`
  }
}

export async function apiRequest(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  const token = localStorage.getItem('token')
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    throw new Error(await parseError(response))
  }

  if (response.status === 204) return null
  return response.json()
}

export function submitRsvp(payload) {
  return apiRequest('/api/rsvp', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function login(username, password) {
  return apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function fetchSummary() {
  return apiRequest('/api/admin/summary')
}

export function fetchGuests(query = '') {
  const params = new URLSearchParams()

  if (typeof query === 'string') {
    if (query) {
      params.set('q', query)
    }
  } else if (query && typeof query === 'object') {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return
      params.set(key, String(value))
    })
  }

  const search = params.toString()
  return apiRequest(`/api/admin/guests${search ? `?${search}` : ''}`)
}

export function fetchTableSettings() {
  return apiRequest('/api/admin/table-settings')
}

export function saveTableSetting(payload) {
  return apiRequest('/api/admin/table-settings', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function renameTableSetting(payload) {
  return apiRequest('/api/admin/table-settings/rename', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function deleteTableSetting(tableName) {
  return apiRequest(
    `/api/admin/table-settings?table_name=${encodeURIComponent(tableName)}`,
    { method: 'DELETE' },
  )
}

export function patchGuest(guestId, payload) {
  return apiRequest(`/api/admin/guests/${guestId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function createGuest(payload) {
  return apiRequest('/api/admin/guests', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function deleteGuest(guestId) {
  return apiRequest(`/api/admin/guests/${guestId}`, {
    method: 'DELETE',
  })
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const AUTH_EXPIRED_EVENT = 'wedding-auth-expired'

function isNetworkError(error) {
  return (
    error instanceof TypeError
    && ['Failed to fetch', 'Load failed'].includes(error.message)
  )
}

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

  let response

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
    })
  } catch (error) {
    if (isNetworkError(error)) {
      throw new Error('目前無法連線到報名系統，請稍後再試或聯絡我們。')
    }
    throw error
  }

  if (response.status === 401 && path !== '/api/auth/login') {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
  }

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

export function fetchRsvpSettings() {
  return apiRequest('/api/rsvp/settings')
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

export function fetchAdminRsvpSettings() {
  return apiRequest('/api/admin/settings/rsvp')
}

export function updateAdminRsvpSettings(payload) {
  return apiRequest('/api/admin/settings/rsvp', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function fetchStaffUsers() {
  return apiRequest('/api/admin/staff-users')
}

export function createStaffUser(payload) {
  return apiRequest('/api/admin/staff-users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateStaffDisplayName(username, displayName) {
  return apiRequest(
    `/api/admin/staff-users/${encodeURIComponent(username)}/display-name`,
    {
      method: 'PATCH',
      body: JSON.stringify({ display_name: displayName }),
    },
  )
}

export function resetStaffPassword(username, password) {
  return apiRequest(
    `/api/admin/staff-users/${encodeURIComponent(username)}/password`,
    {
      method: 'POST',
      body: JSON.stringify({ password }),
    },
  )
}

export function updateStaffStatus(username, isActive) {
  return apiRequest(
    `/api/admin/staff-users/${encodeURIComponent(username)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive }),
    },
  )
}

export function fetchStaffAuditLogs() {
  return apiRequest('/api/admin/staff-user-audit-logs')
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

export function fetchGuestByCheckinToken(token) {
  return apiRequest(`/api/admin/checkin/${encodeURIComponent(token)}`)
}

export function resetGuestCheckinToken(guestId) {
  return apiRequest(`/api/admin/guests/${guestId}/checkin-token/reset`, {
    method: 'POST',
  })
}

export function patchGuestCheckin(guestId, payload) {
  return apiRequest(`/api/admin/guests/${guestId}/checkin`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
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

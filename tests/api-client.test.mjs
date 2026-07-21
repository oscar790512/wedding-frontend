import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { createServer } from 'vite'

let server
let api

class MemoryStorage {
  constructor() {
    this.values = new Map()
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null
  }

  setItem(key, value) {
    this.values.set(key, String(value))
  }

  removeItem(key) {
    this.values.delete(key)
  }

  clear() {
    this.values.clear()
  }
}

before(async () => {
  server = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  })
  api = await server.ssrLoadModule('/src/api/client.js')
})

after(async () => {
  await server?.close()
})

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage()
  globalThis.window = new EventTarget()
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, params = {}) {
      super(type, params)
      this.detail = params.detail
    }
  }
})

describe('apiRequest', () => {
  it('sends JSON requests with the bearer token from localStorage', async () => {
    localStorage.setItem('token', 'jwt-token')
    const calls = []
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options })
      return jsonResponse({ ok: true })
    }

    const result = await api.apiRequest('/api/admin/summary', {
      method: 'POST',
      body: JSON.stringify({ value: 1 }),
    })

    assert.deepEqual(result, { ok: true })
    assert.equal(calls[0].url, 'http://localhost:8000/api/admin/summary')
    assert.equal(calls[0].options.method, 'POST')
    assert.equal(calls[0].options.headers.Authorization, 'Bearer jwt-token')
    assert.equal(calls[0].options.headers['Content-Type'], 'application/json')
  })

  it('turns FastAPI validation errors into a readable message', async () => {
    globalThis.fetch = async () => jsonResponse(
      {
        detail: [
          { msg: 'Phone is required' },
          { msg: '請選擇與新人關係' },
        ],
      },
      { ok: false, status: 422 },
    )

    await assert.rejects(
      api.apiRequest('/api/rsvp'),
      /Phone is required, 請選擇與新人關係/,
    )
  })

  it('dispatches the auth-expired event for protected 401 responses', async () => {
    let eventCount = 0
    window.addEventListener('wedding-auth-expired', () => {
      eventCount += 1
    })
    globalThis.fetch = async () => jsonResponse(
      { detail: 'Invalid or expired token' },
      { ok: false, status: 401 },
    )

    await assert.rejects(api.fetchGuests(), /Invalid or expired token/)

    assert.equal(eventCount, 1)
  })

  it('does not dispatch auth-expired for failed login responses', async () => {
    let eventCount = 0
    window.addEventListener('wedding-auth-expired', () => {
      eventCount += 1
    })
    globalThis.fetch = async () => jsonResponse(
      { detail: 'Invalid credentials' },
      { ok: false, status: 401 },
    )

    await assert.rejects(api.login('admin', 'wrong'), /Invalid credentials/)

    assert.equal(eventCount, 0)
  })

  it('returns null for empty 204 responses', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error('json should not be parsed')
      },
    })

    await assert.doesNotReject(async () => {
      const result = await api.deleteGuest('guest-id')
      assert.equal(result, null)
    })
  })

  it('uses protected staff account management endpoints', async () => {
    const calls = []
    localStorage.setItem('token', 'admin-token')
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options })
      return jsonResponse({ username: 'frontdesk-1' })
    }

    await api.createStaffUser({
      username: 'frontdesk-1',
      display_name: '怡君',
      password: 'password123',
    })
    await api.updateStaffDisplayName('frontdesk-1', '接待組長')
    await api.resetStaffPassword('frontdesk-1', 'new-password')
    await api.updateStaffStatus('frontdesk-1', false)
    await api.fetchStaffAuditLogs()

    assert.deepEqual(
      calls.map(({ url, options }) => [url, options.method || 'GET']),
      [
        ['http://localhost:8000/api/admin/staff-users', 'POST'],
        [
          'http://localhost:8000/api/admin/staff-users/frontdesk-1/display-name',
          'PATCH',
        ],
        [
          'http://localhost:8000/api/admin/staff-users/frontdesk-1/password',
          'POST',
        ],
        [
          'http://localhost:8000/api/admin/staff-users/frontdesk-1/status',
          'PATCH',
        ],
        ['http://localhost:8000/api/admin/staff-user-audit-logs', 'GET'],
      ],
    )
    assert.ok(calls.every(({ options }) => options.headers.Authorization === 'Bearer admin-token'))
  })

  it('fetches paginated guests and keeps the legacy helper loading all pages', async () => {
    const calls = []
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options })
      const page = new URL(url).searchParams.get('page')
      if (page === '2') {
        return jsonResponse({
          items: [{ id: 'guest-2', name: 'Peiyu' }],
          total: 2,
          page: 2,
          page_size: 1,
        })
      }
      return jsonResponse({
        items: [{ id: 'guest-1', name: 'Oscar' }],
        total: 2,
        page: 1,
        page_size: 1,
      })
    }

    const page = await api.fetchGuestPage({
      q: 'Oscar',
      status: 'attend',
      page: 1,
      page_size: 1,
    })
    const guests = await api.fetchGuests()

    assert.deepEqual(page, {
      items: [{ id: 'guest-1', name: 'Oscar' }],
      total: 2,
      page: 1,
      page_size: 1,
    })
    assert.deepEqual(guests, [
      { id: 'guest-1', name: 'Oscar' },
      { id: 'guest-2', name: 'Peiyu' },
    ])
    assert.equal(
      calls[0].url,
      'http://localhost:8000/api/admin/guests?q=Oscar&status=attend&page=1&page_size=1',
    )
  })

  it('wraps browser network failures in the guest-facing connection message', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch')
    }

    await assert.rejects(
      api.submitRsvp({ name: 'Guest' }),
      /目前無法連線到報名系統，請稍後再試或聯絡我們。/,
    )
  })
})

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => data,
  }
}

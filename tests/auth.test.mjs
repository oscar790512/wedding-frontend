import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { createServer } from 'vite'

let server
let authModule

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
  globalThis.localStorage = new MemoryStorage()
  server = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  })
  authModule = await server.ssrLoadModule('/src/composables/useAuth.js')
})

after(async () => {
  await server?.close()
})

beforeEach(() => {
  authModule.useAuth().clearSession()
})

describe('useAuth', () => {
  it('stores the display name and role returned by login', () => {
    const auth = authModule.useAuth()

    auth.setSession({
      access_token: 'jwt-token',
      username: 'frontdesk-1',
      display_name: '怡君',
      role: 'staff',
    })

    assert.equal(auth.displayName.value, '怡君')
    assert.equal(auth.role.value, 'staff')
    assert.equal(localStorage.getItem('displayName'), '怡君')
    assert.equal(localStorage.getItem('role'), 'staff')
  })

  it('clears all staff session metadata on logout', () => {
    const auth = authModule.useAuth()
    auth.setSession({
      access_token: 'jwt-token',
      username: 'frontdesk-1',
      display_name: '怡君',
      role: 'staff',
    })

    auth.clearSession()

    assert.equal(auth.isAuthenticated.value, false)
    assert.equal(localStorage.getItem('displayName'), null)
    assert.equal(localStorage.getItem('role'), null)
  })
})

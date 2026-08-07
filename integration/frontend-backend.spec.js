import { expect, test } from '@playwright/test'

const frontendUrl = process.env.INTEGRATION_FRONTEND_URL
const apiBaseUrl = process.env.INTEGRATION_API_BASE_URL

function requiredUrl(name, value) {
  expect(value, `${name} must be set for integration tests`).toBeTruthy()
  return new URL(value)
}

function apiUrl(path) {
  const base = requiredUrl('INTEGRATION_API_BASE_URL', apiBaseUrl)
  return new URL(path, base).toString()
}

function normalizePath(pathname) {
  return pathname.replace(/\/+/g, '/')
}

function isExpectedSettingsResponse(response, expectedApiBase) {
  const actualUrl = new URL(response.url())

  return (
    actualUrl.origin === expectedApiBase.origin
    && normalizePath(actualUrl.pathname) === '/api/rsvp/settings'
    && response.ok()
  )
}

test('backend health endpoint is reachable', async ({ request }) => {
  const response = await request.get(apiUrl('/health'))
  const body = await response.json()

  expect(response.ok()).toBeTruthy()
  expect(body).toEqual({ status: 'ok' })
})

test('public RSVP settings API returns the frontend contract shape', async ({ request }) => {
  const response = await request.get(apiUrl('/api/rsvp/settings'))
  const body = await response.json()

  expect(response.ok()).toBeTruthy()
  expect(body).toEqual(expect.objectContaining({
    rsvp_deadline: expect.any(String),
  }))
})

test('deployed frontend can call the configured backend API', async ({ page }) => {
  const frontend = requiredUrl('INTEGRATION_FRONTEND_URL', frontendUrl)
  const apiBase = requiredUrl('INTEGRATION_API_BASE_URL', apiBaseUrl)
  const apiRequests = []

  page.on('request', (request) => {
    if (request.url().includes('/api/')) {
      apiRequests.push(request.url())
    }
  })

  const settingsResponse = page.waitForResponse(
    (response) => isExpectedSettingsResponse(response, apiBase),
  )

  await page.goto(new URL('/rsvp', frontend).toString())
  await page.waitForLoadState('load')
  await settingsResponse.catch((error) => {
    throw new Error(
      `${error.message}\nObserved API requests:\n${apiRequests.join('\n') || '(none)'}`,
    )
  })

  await expect(page.getByRole('heading', { name: '祺元與姵妤' })).toBeVisible()
})

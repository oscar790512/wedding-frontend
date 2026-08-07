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
  const settingsPath = new URL('/api/rsvp/settings', apiBase).toString()

  const settingsResponse = page.waitForResponse(
    (response) => response.url() === settingsPath && response.ok(),
  )

  await page.goto(new URL('/rsvp', frontend).toString())
  await page.waitForLoadState('load')
  await settingsResponse

  await expect(page.getByRole('heading', { name: '祺元與姵妤' })).toBeVisible()
})

import { expect, test } from '@playwright/test'

import { mockWeddingApi } from './fixtures/api.js'

test('redirects protected admin pages to login and then loads the dashboard', async ({ page }) => {
  await mockWeddingApi(page)

  await page.goto('/admin/dashboard')
  await page.waitForLoadState('load')

  await expect(page).toHaveURL(/\/login\?redirect=\/admin\/dashboard/)
  await page.getByLabel('帳號').fill('admin')
  await page.getByLabel('密碼').fill('password123')
  await page.getByRole('button', { name: '登入' }).click()

  await expect(page).toHaveURL(/\/admin\/dashboard$/)
  await expect(page.locator('h1', { hasText: '統計大盤' })).toBeVisible()
  await expect(page.getByText('總 RSVP 組數')).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('displayName'))).toBe('測試管理員')
})

test('loads the guest management list after an authenticated admin login', async ({ page }) => {
  await mockWeddingApi(page)

  await page.goto('/login?redirect=/admin/guests')
  await page.waitForLoadState('load')
  await page.getByLabel('帳號').fill('admin')
  await page.getByLabel('密碼').fill('password123')
  await page.getByRole('button', { name: '登入' }).click()

  await expect(page).toHaveURL(/\/admin\/guests$/)
  await expect(page.getByRole('heading', { name: '完整賓客名單' })).toBeVisible()
  await expect(page.getByText('王小明')).toBeVisible()
  await expect(page.getByText('陳美美')).toBeVisible()
  await expect(page.getByText('1-2 / 2 筆')).toBeVisible()
})

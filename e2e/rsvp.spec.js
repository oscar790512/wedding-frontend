import { expect, test } from '@playwright/test'

import { mockWeddingApi } from './fixtures/api.js'

test('submits an attending RSVP and shows the check-in QR dialog', async ({ page }) => {
  const api = await mockWeddingApi(page)

  await page.goto('/rsvp')
  await page.waitForLoadState('load')

  await page.getByRole('link', { name: '開始填寫' }).click()
  await page.locator('#guest-name').fill('林測試')
  await page.locator('#guest-phone').fill('0911222333')
  await page.locator('#guest-email').fill('guest@example.com')
  await page.locator('#relationship-side').selectOption('男方')
  await page.locator('#relationship-type').selectOption('朋友/同學')
  await page.locator('#adult-count').fill('2')
  await page.locator('#child-count').fill('1')
  await page.locator('#child-seats').fill('1')
  await page.getByLabel('需要素食').check({ force: true })
  await page.locator('#vegetarian-count').fill('1')
  await page.locator('#diet-notes').fill('不吃牛')
  await page.locator('#blessing').fill('新婚快樂')
  await page.getByRole('button', { name: '送出回覆' }).click()

  await expect(page.getByText('已收到您的回覆，期待與您見面！')).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText('婚禮報到 QR Code')

  const [request] = api.requestsFor('/api/rsvp')
  expect(request).toBeTruthy()
  expect(request.postDataJSON()).toMatchObject({
    name: '林測試',
    phone: '0911222333',
    email: 'guest@example.com',
    guest_category: '男方朋友/同學',
    status: 'attend',
    total_adults: 2,
    total_children: 1,
    child_seats: 1,
    vegetarian_count: 1,
    diet_notes: '不吃牛',
    blessing_message: '新婚快樂',
  })
})

test('validates child seat counts before sending the RSVP', async ({ page }) => {
  const api = await mockWeddingApi(page)

  await page.goto('/rsvp')
  await page.waitForLoadState('load')

  await page.locator('#guest-name').fill('林測試')
  await page.locator('#guest-phone').fill('0911222333')
  await page.locator('#relationship-side').selectOption('男方')
  await page.locator('#relationship-type').selectOption('朋友/同學')
  await page.locator('#child-count').fill('1')
  await page.locator('#child-seats').fill('2')
  await page.getByRole('button', { name: '送出回覆' }).click()

  await expect(page.getByText('兒童座椅數量不可超過小孩人數')).toBeVisible()
  expect(api.requestsFor('/api/rsvp')).toHaveLength(0)
})

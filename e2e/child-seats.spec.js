import { expect, test } from '@playwright/test'
import { defaultGuests, mockWeddingApi } from './fixtures/api.js'

async function openSeatMap(page, path, guests) {
  await mockWeddingApi(page, { guests })
  await page.route('http://localhost:8000/api/admin/table-settings', (route) => route.fulfill({
    json: [{ table_name: 'A1', capacity: 8 }],
  }))
  await page.goto(`/login?redirect=${path}`)
  await page.getByLabel('帳號').fill('admin')
  await page.getByLabel('密碼').fill('password123')
  await page.getByRole('button', { name: '登入', exact: true }).click()
  if (path === '/admin/operations') {
    await page.getByRole('tab', { name: '桌次簽到', exact: true }).click()
  }
  await expect(page.locator('.round-table__chair')).toHaveCount(8)
}

test('planning shows planned children in pink, adults in yellow and spare seats empty', async ({ page }) => {
  await openSeatMap(page, '/admin/tables', [{
    ...defaultGuests[0], total_children: 2, child_seats: 0, actual_children: 0,
  }])
  const chairs = page.locator('.round-table__chair')
  await expect(page.locator('.round-table__chair.is-child')).toHaveCount(2)
  await expect(chairs.nth(0)).toHaveCSS('background-color', 'rgb(244, 166, 193)')
  await expect(chairs.nth(2)).toHaveCSS('background-color', 'rgb(240, 181, 63)')
  await expect(page.locator('.round-table__chair:not(.is-occupied):not(.is-child)')).toHaveCount(4)
  await page.screenshot({ path: test.info().outputPath('planning-child-seats.png'), fullPage: true })
})

test('check-in shows arrived and pending children in pink using actual counts with RSVP fallback', async ({ page }) => {
  await openSeatMap(page, '/admin/operations', [
    { ...defaultGuests[0], is_arrived: true, total_children: 2, actual_children: 1 },
    { ...defaultGuests[0], id: 'pending', total_adults: 1, total_children: 1 },
  ])
  const chairs = page.locator('.round-table__chair')
  await expect(page.locator('.round-table__chair.is-child')).toHaveCount(2)
  await expect(chairs.nth(0)).toHaveCSS('background-color', 'rgb(244, 166, 193)')
  await expect(chairs.nth(1)).toHaveClass(/is-arrived/)
  await expect(chairs.nth(1)).not.toHaveClass(/is-child/)
  await expect(chairs.nth(3)).toHaveCSS('background-color', 'rgb(244, 166, 193)')
  await expect(chairs.nth(4)).toHaveCSS('background-color', 'rgb(240, 181, 63)')
  await expect(page.locator('.round-table__chair:not(.is-arrived):not(.is-occupied)')).toHaveCount(3)
  await page.screenshot({ path: test.info().outputPath('checkin-child-seats.png'), fullPage: true })
})

test('tables without children retain adult seat colors', async ({ page }) => {
  await openSeatMap(page, '/admin/tables', [{ ...defaultGuests[0], total_children: 0 }])
  await expect(page.locator('.round-table__chair.is-child')).toHaveCount(0)
  await expect(page.locator('.round-table__chair.is-occupied')).toHaveCount(2)
})

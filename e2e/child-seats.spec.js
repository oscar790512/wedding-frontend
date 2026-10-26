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

for (const path of ['/admin/tables', '/admin/operations']) {
  test(`${path} colors the requested number of child seats regardless of children or arrival counts`, async ({ page }) => {
    await openSeatMap(page, path, [
      { ...defaultGuests[0], child_seats: 2, total_children: 3, actual_children: 0, is_arrived: true },
      { ...defaultGuests[0], id: 'pending', child_seats: 1, total_children: 2, total_adults: 1 },
    ])
    const chairs = page.locator('.round-table__chair')
    await expect(page.locator('.round-table__chair.is-child-seat')).toHaveCount(3)
    for (let index = 0; index < 3; index += 1) {
      await expect(chairs.nth(index)).toHaveCSS('background-color', 'rgb(244, 166, 193)')
    }
    await expect(chairs.nth(3)).toHaveCSS('background-color', 'rgb(240, 181, 63)')
    await page.locator('.venue-floor-plan').screenshot({ path: test.info().outputPath('child-seats.png') })
  })

  test(`${path} leaves seats unchanged when children have no requested child seats`, async ({ page }) => {
    await openSeatMap(page, path, [{ ...defaultGuests[0], total_children: 2, child_seats: 0 }])
    await expect(page.locator('.round-table__chair.is-child-seat')).toHaveCount(0)
    await expect(page.locator('.round-table__chair.is-occupied')).toHaveCount(4)
  })
}

import { expect, test } from '@playwright/test'
import { defaultGuests, mockWeddingApi } from './fixtures/api.js'

async function setupWorkbench(page) {
  await mockWeddingApi(page)
  const guests = Array.from({ length: 102 }, (_, index) => ({
    ...defaultGuests[0],
    id: `guest-${index + 1}`,
    name: `賓客${String(index + 1).padStart(3, '0')}`,
    status: index === 101 ? 'decline' : 'attend',
    total_adults: 1,
    total_children: 0,
    allocated_table: index === 100 ? 'B1' : `A${Math.floor(index / 10) + 1}`,
    is_arrived: index === 100,
    created_at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  }))
  await page.route('http://localhost:8000/api/admin/table-settings', (route) => route.fulfill({ json: [
    ...Array.from({ length: 10 }, (_, i) => ({ table_name: `A${i + 1}`, capacity: 10 })),
    { table_name: 'B1', capacity: 2 },
  ] }))
  await page.route('http://localhost:8000/api/admin/guests**', async (route) => {
    const request = route.request()
    if (request.method() === 'PATCH') {
      const id = new URL(request.url()).pathname.split('/').at(-2)
      const guest = guests.find((item) => item.id === id)
      Object.assign(guest, request.postDataJSON())
      await route.fulfill({ json: guest })
      return
    }
    const params = new URL(request.url()).searchParams
    let matches = guests.filter((guest) => (!params.get('status') || guest.status === params.get('status'))
      && (!params.get('q') || guest.name.includes(params.get('q'))))
    matches = matches.toSorted((a, b) => a.created_at.localeCompare(b.created_at))
    if (params.get('order') === 'desc') matches.reverse()
    const currentPage = Number(params.get('page') || 1)
    const pageSize = Number(params.get('page_size') || 100)
    await route.fulfill({ json: {
      items: matches.slice((currentPage - 1) * pageSize, currentPage * pageSize),
      total: matches.length, page: currentPage, page_size: pageSize,
    } })
  })
  await page.goto('/login?redirect=/admin/operations')
  await page.getByLabel('帳號').fill('admin')
  await page.getByLabel('密碼').fill('password123')
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await expect(page.locator('.checkin-row')).toHaveCount(20)
}

async function expectCompleteTables(page) {
  await page.getByRole('tab', { name: '桌次簽到', exact: true }).click()
  await expect(page.getByRole('button', { name: 'B1 1 / 2', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'A1 0 / 10', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('.dialog-guest strong')).toHaveText(
    Array.from({ length: 10 }, (_, i) => `賓客${String(i + 1).padStart(3, '0')}`),
  )
  await expect(dialog.getByText('已簽到 0 位，未簽到 10 位。')).toBeVisible()
  await dialog.getByRole('button', { name: '關閉', exact: true }).click()
  await page.getByRole('tab', { name: '現場搜尋與收禮', exact: true }).click()
}

test('table counts and guest order stay independent of list sort, pagination, search and attendance filter', async ({ page }) => {
  await setupWorkbench(page)
  await expectCompleteTables(page)
  await page.getByLabel('建立時間排序').selectOption('desc')
  await expect(page.locator('.checkin-row').first()).toContainText('賓客101')
  await expectCompleteTables(page)
  await page.getByRole('button', { name: '下一頁', exact: true }).click()
  await expect(page.locator('.checkin-row').first()).toContainText('賓客081')
  await expectCompleteTables(page)
  await page.getByPlaceholder('搜尋姓名或電話末三碼').fill('賓客101')
  await expect(page.locator('.checkin-row')).toHaveCount(1)
  await expectCompleteTables(page)
  await page.getByPlaceholder('搜尋姓名或電話末三碼').fill('不存在')
  await expect(page.getByText('找不到符合條件的賓客')).toBeVisible()
  await expectCompleteTables(page)
  await page.getByPlaceholder('搜尋姓名或電話末三碼').fill('')
  await page.getByText('只看出席賓客', { exact: true }).click()
  await expect(page.locator('.checkin-row').first()).toContainText('賓客102')
  await expectCompleteTables(page)
})

test('arrival and cancellation update the complete table dataset from a filtered list', async ({ page }) => {
  await setupWorkbench(page)
  await page.getByPlaceholder('搜尋姓名或電話末三碼').fill('賓客001')
  await expect(page.locator('.checkin-row')).toHaveCount(1)
  await page.getByRole('button', { name: '標記到場', exact: true }).click()
  await expect(page.getByRole('button', { name: '取消到場', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '桌次簽到', exact: true }).click()
  await page.getByRole('button', { name: 'A1 1 / 10', exact: true }).click()
  await expect(page.getByRole('dialog').getByText('已簽到 1 位，未簽到 9 位。')).toBeVisible()
  await expect(page.getByRole('dialog').locator('.dialog-guest')).toHaveCount(10)
  await page.getByRole('dialog').getByRole('button', { name: '關閉', exact: true }).click()
  await page.getByRole('tab', { name: '現場搜尋與收禮', exact: true }).click()
  await page.getByRole('button', { name: '取消到場', exact: true }).click()
  await expect(page.getByRole('button', { name: '標記到場', exact: true })).toBeVisible()
  await expectCompleteTables(page)
})

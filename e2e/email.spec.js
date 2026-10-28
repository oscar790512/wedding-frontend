import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import jsQR from 'jsqr'
import { mockWeddingApi, defaultGuests } from './fixtures/api.js'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/wedding-email.json', import.meta.url), 'utf8'))
const batchId = fixture.batch_id
const id = index => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`

async function setup(page, smtpReady = true) {
  await mockWeddingApi(page)
  const requests = []
  const guests = Array.from({ length: 103 }, (_, i) => ({ ...defaultGuests[0], id: id(i + 1), name: i ? `賓客${i + 1}` : '王小明', email: i === 1 ? '' : `guest${i + 1}@example.com`, checkin_token: `token-${i + 1}`, status: 'attend' }))
  await page.route('http://localhost:8000/api/admin/guests**', route => {
    const params = new URL(route.request().url()).searchParams
    const p = Number(params.get('page') || 1), size = Number(params.get('page_size') || 100)
    return route.fulfill({ json: { items: guests.slice((p - 1) * size, p * size), total: guests.length, page: p, page_size: size } })
  })
  const overview = { smtp_ready: smtpReady, sender: smtpReady ? 'sender@gmail.com' : '', storage_ready: true, daily_limit: 450, content: fixture.content, deliveries: [{ guest_id: id(3), status: 'sent' }], batches: [] }
  const deliveries = [
    { id: 'd1', guest_id: id(1), name: '王小明', email: 'guest1@example.com', status: 'sent' },
    { id: 'd2', guest_id: id(4), name: '賓客4', email: 'guest4@example.com', status: 'failed', error: 'SMTP 拒絕此封信件' },
    { id: 'd3', guest_id: id(5), name: '賓客5', email: 'guest5@example.com', status: 'unknown', error: '請先查看寄件備份', attempted_at: '2026-10-28T09:26:46+00:00' },
  ]
  await page.route('http://localhost:8000/api/admin/email/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    if (req.method() === 'POST') requests.push({ path, body: req.postDataJSON() })
    if (path.endsWith('/overview')) return route.fulfill({ json: overview })
    if (path.endsWith('/preview')) return route.fulfill({ json: { ...fixture, total: req.postDataJSON().guest_ids.length } })
    if (path.endsWith('/send')) {
      overview.batches = [{ id: batchId, created_at: '2026-10-26T16:00:00Z', last_error: null }]
      overview.deliveries = [...overview.deliveries, ...deliveries]
      return route.fulfill({ status: 202, json: { batch_id: batchId } })
    }
    if (path.endsWith('/resolve')) {
      const row = deliveries.find(item => item.id === path.split('/').at(-2))
      Object.assign(row, { status: 'failed', error: '已由管理員確認本次未寄出，可手動重試。' })
      return route.fulfill({ json: { id: row.id, batch_id: batchId, status: row.status } })
    }
    if (path.endsWith('/resume')) return route.fulfill({ status: 202, json: { batch_id: batchId } })
    return route.fulfill({ json: { batch_id: batchId, last_error: null, deliveries } })
  })
  await page.goto('/login?redirect=/admin/email')
  await page.getByLabel('帳號', { exact: true }).fill('admin')
  await page.getByLabel('密碼', { exact: true }).fill('password123')
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await expect(page.getByRole('heading', { name: '一封信，準備好相聚' })).toBeVisible()
  await expect(page.getByText('完整名單 103 位', { exact: false })).toBeVisible()
  return requests
}

test('loads all recipients and previews the actual personalized template before SMTP confirmation', async ({ page }, testInfo) => {
  const requests = await setup(page)
  await expect(page.getByRole('checkbox', { name: '選取 賓客2', exact: true })).toBeDisabled()
  await expect(page.getByRole('checkbox', { name: '選取 賓客3', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '全選搜尋結果' }).click()
  await expect(page.getByText('已選 101 位', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '一鍵寄送 Email（101 位）', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  expect(requests.filter(req => req.path.endsWith('/send'))).toHaveLength(0)
  const previewBody = requests.find(req => req.path.endsWith('/preview')).body
  expect(previewBody.guest_ids).toContain(id(103))
  expect(previewBody.guest_ids).not.toContain(id(2))
  expect(previewBody.guest_ids).not.toContain(id(3))
  const frame = page.frameLocator('iframe[title="Email 寄送樣板預覽"]')
  for (const text of ['親愛的 王小明', '2026 年 11 月 8 日', '老新台菜', '開車赴約的小提醒', '@287rlhkg', '請提前將下方 QR Code']) {
    await expect(frame.locator('body')).toContainText(text)
  }
  await expect(frame.getByRole('link', { name: '開啟電子喜帖', exact: true })).toHaveAttribute('href', fixture.content.invitation_url)
  const src = await frame.getByRole('img').getAttribute('src')
  const png = PNG.sync.read(Buffer.from(src.split(',')[1], 'base64'))
  expect(jsQR(new Uint8ClampedArray(png.data), png.width, png.height).data).toBe('wedding-checkin:preview-only-not-a-real-checkin-token')
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.locator('body').evaluate(el => el.clientWidth))
  await page.screenshot({ path: `/tmp/wedding-email-${testInfo.project.name}.png`, fullPage: true })
  await dialog.getByRole('button', { name: '確認寄送給 101 位賓客', exact: true }).click()
  await expect(page.getByRole('heading', { name: '寄送進度 3 / 3' })).toBeVisible()
  expect(requests.filter(req => req.path.endsWith('/send'))).toHaveLength(1)
  expect(requests.find(req => req.path.endsWith('/send')).body.content).toEqual(previewBody.content)
  await expect(page.getByText('有 1 封無法確認是否已寄出', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '只重試失敗信件（1）', exact: true }).click()
  await expect.poll(() => requests.filter(req => req.path.endsWith('/resume')).length).toBe(1)
  expect(requests.find(req => req.path.endsWith('/resume')).body).toEqual({ retry_failed: true })
})

test('SMTP is optional for previews and required for actual delivery', async ({ page }) => {
  const requests = await setup(page, false)
  await page.getByLabel('搜尋姓名或 Email', { exact: true }).fill('王小明')
  await page.getByRole('button', { name: '全選搜尋結果' }).click()
  await page.getByRole('button', { name: '一鍵寄送 Email（1 位）', exact: true }).click()
  await expect(page.getByRole('button', { name: '確認寄送給 1 位賓客', exact: true })).toBeDisabled()
  expect(requests.filter(req => req.path.endsWith('/send'))).toHaveLength(0)
  await page.getByRole('dialog').getByRole('button', { name: '關閉', exact: true }).click()
  await page.getByLabel('信件主旨', { exact: true }).fill('新的婚禮提醒')
  await page.getByRole('button', { name: '一鍵寄送 Email（1 位）', exact: true }).click()
  expect(requests.filter(req => req.path.endsWith('/preview')).at(-1).body.content.subject).toBe('新的婚禮提醒')
})

test('the standalone wedding email stays readable on desktop and mobile', async ({ page }, testInfo) => {
  await page.route('**/email-template-preview', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture.html }))
  await page.goto('/email-template-preview')
  await expect(page.getByRole('heading', { name: '祺元 & 姵妤', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: `../wedding-backend/previews/wedding-email-${testInfo.project.name}.png`, fullPage: true })
})

test('a paused batch keeps polling its sending message until an unconfirmed result is resolved', async ({ page }) => {
  await setup(page)
  let polls = 0
  await page.route(`http://localhost:8000/api/admin/email/batches/${batchId}`, route => {
    polls += 1
    return route.fulfill({ json: {
      batch_id: batchId, last_error: '寄送已暫停，請檢查寄送狀態後繼續；狀態待確認的信件不會自動重寄。',
      deliveries: [{ id: 'delivery-1', guest_id: id(1), name: '王小明', email: 'guest1@example.com', status: polls === 1 ? 'sending' : 'unknown', error: polls === 1 ? null : '請先確認 Gmail 寄件備份' }],
    } })
  })
  await page.getByRole('checkbox', { name: '選取 王小明', exact: true }).check()
  await page.getByRole('button', { name: '一鍵寄送 Email（1 位）', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '確認寄送給 1 位賓客', exact: true }).click()
  await expect(page.getByRole('heading', { name: '寄送進度 1 / 1' })).toBeVisible()
  await expect(page.getByText('有 1 封無法確認是否已寄出', { exact: false })).toBeVisible()
  expect(polls).toBeGreaterThanOrEqual(2)
})

test('a temporary status lookup failure resumes polling without resubmitting the email', async ({ page }) => {
  const requests = await setup(page)
  let polls = 0
  await page.route(`http://localhost:8000/api/admin/email/batches/${batchId}`, route => {
    polls += 1
    if (polls === 1) return route.fulfill({ status: 503, json: { detail: '暫時無法讀取寄送狀態' } })
    return route.fulfill({ json: { batch_id: batchId, last_error: null, deliveries: [{ id: 'delivery-1', guest_id: id(1), name: '王小明', email: 'guest1@example.com', status: 'sent' }] } })
  })
  await page.getByRole('checkbox', { name: '選取 王小明', exact: true }).check()
  await page.getByRole('button', { name: '一鍵寄送 Email（1 位）', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '確認寄送給 1 位賓客', exact: true }).click()
  await expect(page.getByRole('heading', { name: '寄送進度 1 / 1' })).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(requests.filter(request => request.path.endsWith('/send'))).toHaveLength(1)
})

test('manual confirmation enables retry for an unknown delivery without itself sending', async ({ page }, testInfo) => {
  const requests = await setup(page)
  await page.getByRole('checkbox', { name: '選取 王小明', exact: true }).check()
  await page.getByRole('button', { name: '一鍵寄送 Email（1 位）', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '確認寄送給 1 位賓客', exact: true }).click()
  await expect(page.getByRole('heading', { name: '寄送進度 3 / 3' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: '選取 賓客5', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '確認 王小明 未寄出', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '確認 賓客5 未寄出', exact: true }).click()
  const markButton = page.getByRole('button', { name: '標記未寄出，允許重試', exact: true })
  await expect(markButton).toBeDisabled()
  expect(requests.filter(req => req.path.endsWith('/resolve'))).toHaveLength(0)
  await page.getByRole('checkbox', { name: '我已確認這次未寄出', exact: true }).check()
  await expect(markButton).toBeEnabled()
  await page.locator('.email-resolution').screenshot({ path: `/tmp/wedding-email-manual-confirm-${testInfo.project.name}.png` })
  await markButton.click()
  await expect(page.getByRole('button', { name: '只重試失敗信件（2）', exact: true })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: '選取 賓客5', exact: true })).toBeEnabled()
  const resolution = requests.find(req => req.path.endsWith('/resolve'))
  expect(resolution.body).toEqual({ confirmed_not_sent: true, attempted_at: '2026-10-28T09:26:46+00:00' })
  expect(requests.filter(req => req.path.endsWith('/send'))).toHaveLength(1)
  expect(requests.filter(req => req.path.endsWith('/resume'))).toHaveLength(0)
  await page.getByRole('button', { name: '只重試失敗信件（2）', exact: true }).click()
  await expect.poll(() => requests.filter(req => req.path.endsWith('/resume')).length).toBe(1)
})

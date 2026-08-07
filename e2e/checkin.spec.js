import { expect, test } from '@playwright/test'

test('keeps logged-out QR scan links on the public instruction page', async ({ page }) => {
  await page.goto('/admin/operations/scan/legacy-token')
  await page.waitForLoadState('load')

  await expect(page.getByRole('heading', { name: '請出示此畫面給工作人員掃描' })).toBeVisible()
  await expect(page.getByText('直接用手機相機開啟不會完成報到')).toBeVisible()
  await expect(page.getByRole('heading', { name: '管理後台登入' })).toHaveCount(0)
})

import { test, expect, devices } from '@playwright/test'
import { login } from './helpers'

test.use({ ...devices['iPhone 12'] }) // 390x844

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('runs filter tabs show DECLINED without clipping at 390px', async ({ page }) => {
  await page.goto('/runs')
  const declined = page.getByRole('button', { name: /DECLINED/i })
  await expect(declined).toBeVisible({ timeout: 8000 })
  await declined.scrollIntoViewIfNeeded()
  await expect(declined).toBeInViewport()
})

test('admin users cards expose Role on mobile', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByText(/admin|owner|production|crew|external/i).first()).toBeVisible({ timeout: 8000 })
})

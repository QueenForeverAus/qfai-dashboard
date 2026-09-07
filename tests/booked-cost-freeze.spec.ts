import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('BOOKED run Costings sheet shows freeze chrome; proposed run stays editable', async ({ page }) => {
  await page.goto('/runs')
  await page.getByRole('button', { name: /^PROPOSED$/i }).click()
  const proposed = page.locator('a[href*="/runs/"]').first()
  if (await proposed.count()) {
    await proposed.click()
    await expect(page.getByTestId('booked-cost-freeze-banner')).toHaveCount(0)
    await expect(page.getByTestId('cost-field-edit').first()).toBeVisible({ timeout: 10000 })
  }

  await page.goto('/runs')
  await page.getByRole('button', { name: /^BOOKED$/i }).click()
  const booked = page.locator('a[href*="/runs/"]').first()
  if (await booked.count() === 0) {
    test.skip(true, 'No BOOKED run on this environment')
    return
  }
  await booked.click()
  await expect(page.getByTestId('booked-cost-freeze-banner')).toBeVisible({ timeout: 10000 })
  await expect(page.getByTestId('booked-cost-freeze-badge')).toBeVisible()
  await expect(page.getByTestId('cost-field-edit')).toHaveCount(0)
})

import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('R12 Remittance: enter hire $1 off, see variance, open challenge draft (not sent)', async ({ page }) => {
  await page.goto('/settlements/r12/remittance')
  await expect(page).not.toHaveURL(/login/)
  await expect(page.getByTestId('tab-remittance')).toBeVisible({ timeout: 8000 })
  await expect(page.getByTestId('remittance-compare')).toBeVisible()
  await expect(page.getByText(/never auto-send/i).first()).toBeVisible()

  await page.getByTestId('remittance-description').fill('Venue Hire')
  await page.getByTestId('remittance-amount').fill('1649')
  await page.getByTestId('add-remittance').click()

  await expect(page.getByTestId('variance-flag-exact-dollar').first()).toBeVisible({ timeout: 8000 })
  await expect(page.getByText(/proposed \(settlement\) vs paid \(remittance\)/i)).toBeVisible()

  const checkbox = page.locator('[data-testid^="flag-select-"]').first()
  await checkbox.check()
  await page.getByTestId('challenge-reason').fill('Hire is $1 short vs locked snapshot — staging smoke.')
  await page.getByTestId('create-challenge-draft').click()

  await expect(page.getByTestId('challenge-draft-preview')).toBeVisible({ timeout: 8000 })
  await expect(page.getByText(/draft only — not sent/i).first()).toBeVisible()
  await expect(page.getByText(/Harbour/i).first()).toBeVisible()
  await expect(page.getByTestId('challenge-draft-preview')).toContainText(/not sent/i)
})

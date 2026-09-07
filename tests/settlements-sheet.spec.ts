import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('pre-show Settlements Sheet is hard-blocked', async ({ page }) => {
  await page.goto('/settlements/r12/sheet')
  if (!page.url().match(/\/settlements\/r12\/sheet/i)) {
    test.skip(true, 'R12 sheet not available')
    return
  }
  await expect(page.getByTestId('settlements-sheet-pre-show')).toBeVisible({ timeout: 8000 })
  await expect(page.getByText('Data not yet available — check back when the show has occurred.')).toBeVisible()
  await expect(page.getByText('Stakeholders use Advancing, not Settlements.')).toBeVisible()
  await expect(page.getByTestId('settlements-sheet')).toHaveCount(0)
  await expect(page.locator('input[type="range"]')).toHaveCount(0)
  await expect(page.getByTestId('tab-settlement')).toBeVisible()
  await expect(page.getByTestId('tab-remittance')).toBeVisible()
})

test('post-show TCOMP1 Sheet shows 3-col live expected + Col3 placeholder', async ({ page }) => {
  await page.goto('/settlements/tcomp1/sheet')
  if (!page.url().match(/\/settlements\/tcomp1\/sheet/i)) {
    test.skip(true, 'TCOMP1 sheet not available')
    return
  }
  await expect(page.getByTestId('settlements-sheet')).toBeVisible({ timeout: 8000 })
  await expect(page.getByTestId('settlements-sheet-pre-show')).toHaveCount(0)
  await expect(page.getByTestId('settlements-sheet-col1').first()).toHaveText(/line/i)
  await expect(page.getByTestId('settlements-sheet-col2').first()).toHaveText(/expected \(advancing\)/i)
  await expect(page.getByTestId('settlements-sheet-col3').first()).toHaveText(/actuals/i)
  await expect(page.getByTestId('settlements-sheet-col3-note')).toContainText(/Phase 4/)
  await expect(page.getByText('Tickets sold (actual count)').first()).toBeVisible()
  await expect(page.getByTestId('sheet-row-harbour_commission').first()).toBeVisible()
  await expect(page.getByText('Venue Hire').first()).toBeVisible()
  await expect(page.locator('input[type="range"]')).toHaveCount(0)
  await expect(page.getByTestId('pnl-owner-revenue')).toHaveCount(0)
})

test('Wave 1 Settlement and Remittance tabs still work beside the Sheet', async ({ page }) => {
  await page.goto('/settlements/r12')
  if (!page.url().match(/\/settlements\/r12/i)) {
    test.skip(true, 'R12 workspace not available')
    return
  }
  await expect(page.getByTestId('tab-sheet')).toBeVisible({ timeout: 8000 })
  await expect(page.getByTestId('settlements-left-pane')).toBeVisible()
  await expect(page.getByTestId('settlements-right-pane')).toBeVisible()
  await expect(page.getByText('Band Costs')).toBeVisible()
  await page.getByTestId('tab-remittance').click()
  await page.waitForURL(/\/settlements\/r12\/remittance/i)
  await expect(page.getByTestId('remittance-compare')).toBeVisible()
})

import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('sidebar shows Settlements (post-show) and Tour Desk (pre-show)', async ({ page }) => {
  await page.goto('/runs')
  await expect(page.getByRole('link', { name: /^tour desk$/i })).toHaveCount(0)
  await expect(page.getByRole('group', { name: /^tour desk$/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /^run costings$/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /^advancing shows$/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /^settlements$/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /^settlement$/i })).toHaveCount(0)
})

test('Settlements lists runs with nested shows and two-pane workspace', async ({ page }) => {
  await page.goto('/settlements')
  await expect(page).not.toHaveURL(/login/)
  await expect(page.getByRole('heading', { name: /^settlements$/i })).toBeVisible({ timeout: 8000 })
  await expect(page.getByText(/proposed payment/i)).toBeVisible()
  await expect(page.getByText(/^remittance$/i).first()).toBeVisible()

  const r12 = page.getByTestId('settlement-run-R12')
  if (await r12.count() === 0) {
    test.skip(true, 'R12 not present on this environment')
    return
  }
  await expect(r12).toBeVisible()
  await expect(page.getByTestId(/settlement-show-/).first()).toBeVisible()

  await r12.click()
  await page.waitForURL(/\/settlements\/r12/i)
  await expect(page.getByTestId('settlements-left-pane')).toBeVisible()
  await expect(page.getByTestId('settlements-right-pane')).toBeVisible()
  await expect(page.getByText('Agent Settlement')).toBeVisible()
  await expect(page.getByText('Band Costs')).toBeVisible()
  await expect(page.getByTestId('close-gate-summary')).toBeVisible()
  await expect(page.getByTestId('new-band-cost-quote-note')).toBeVisible()
  await expect(page.getByTestId('new-band-cost-attach')).toBeVisible()
  await expect(page.getByTestId('finalise-costing').or(page.getByTestId('finalised-badge'))).toBeVisible()
  await expect(page.getByTestId('tab-remittance')).toBeVisible()
  await page.getByTestId('tab-remittance').click()
  await page.waitForURL(/\/settlements\/r12\/remittance/i)
  await expect(page.getByTestId('remittance-compare')).toBeVisible()
  await expect(page.getByTestId('add-remittance')).toBeVisible()
})

test('Band Costs quote/invoice stub attaches a dummy PDF and shows a chip', async ({ page }) => {
  await page.goto('/settlements/r12')
  if (!page.url().match(/\/settlements\/r12/i)) {
    test.skip(true, 'R12 workspace not available')
    return
  }
  await expect(page.getByTestId('settlements-right-pane')).toBeVisible({ timeout: 8000 })
  const stamp = `W15 stub ${Date.now()}`
  await page.getByPlaceholder('e.g. Uber from hotel').fill(stamp)
  await page.getByTestId('settlements-right-pane').getByPlaceholder('Amount').fill('12')
  await page.getByTestId('new-band-cost-quote-note').fill('Link quote/invoice later')
  await page.getByTestId('new-band-cost-attach').setInputFiles({
    name: 'dummy-quote.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 stub'),
  })
  await page.getByTestId('add-band-cost').click()
  await expect(page.getByText(stamp)).toBeVisible({ timeout: 8000 })
  await expect(page.getByText('dummy-quote.pdf').first()).toBeVisible()
})

test('legacy /settlement redirects to Settlements', async ({ page }) => {
  await page.goto('/settlement')
  await expect(page).toHaveURL(/\/settlements/)
  await expect(page.getByRole('heading', { name: /^settlements$/i })).toBeVisible({ timeout: 8000 })
})

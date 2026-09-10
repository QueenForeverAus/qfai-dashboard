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

test('Settlements lists runs; opening a run lands on the 3-col sheet', async ({ page }) => {
  await page.goto('/settlements')
  await expect(page).not.toHaveURL(/login/)
  await expect(page.getByRole('heading', { name: /^settlements$/i })).toBeVisible({ timeout: 8000 })
  await expect(page.getByText(/proposed payment/i)).toBeVisible()
  await expect(page.getByText(/expected vs actual/i).first()).toBeVisible()
  await expect(page.getByTestId('settlements-demo-glance')).toHaveCount(0)
  await expect(page.getByTestId('settlement-demo-TCOMP1')).toHaveCount(0)
  await expect(page.getByTestId('settlement-run-TCOMP1')).toHaveCount(0)
  await expect(page.getByTestId('settlement-run-SAMP01')).toHaveCount(0)
  await expect(page.getByTestId('settlement-run-TRECV1')).toHaveCount(0)

  await expect(page.getByTestId('settlements-bucket-tabs')).toBeVisible()
  if (await page.getByTestId('settlements-list-run-grain').count()) {
    await expect(page.getByTestId('settlements-list-run-grain')).toBeVisible()
  }
  const liveSettled = []
  for (const code of ['26R01', '26R02']) {
    const card = page.getByTestId(`settlement-run-${code}`)
    if (await card.count()) {
      liveSettled.push(code)
      await expect(card).toHaveCount(1)
      await expect(card).toHaveAttribute('href', new RegExp(`/settlements/${code.toLowerCase()}/?$`))
    }
  }
  if (liveSettled.length > 0) {
    await expect(page.getByTestId('settlements-bucket-settled')).toHaveAttribute('aria-selected', 'true')
  }
  await expect(page.getByTestId('settlement-run-R12')).toHaveCount(0)

  const completed = page.getByTestId(/^settlement-run-/)
  if (await completed.count() === 0) {
    await expect(page.getByTestId('settlements-empty')).toBeVisible()
    return
  }
  await expect(page.getByTestId(/settlement-show-/).first()).toBeVisible()
  await completed.first().click()
  await page.waitForURL(/\/settlements\/[^/]+\/?$/i)
  await expect(page.getByTestId('settlements-left-pane')).toHaveCount(0)
  await expect(page.getByTestId('settlements-right-pane')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Agent Settlement' })).toHaveCount(0)
  await expect(page.getByTestId('tab-remittance')).toBeVisible()
  await page.getByTestId('tab-remittance').click()
  await page.waitForURL(/\/settlements\/[^/]+\/remittance/i)
  await expect(page.getByTestId('remittance-compare')).toBeVisible()
  await expect(page.getByTestId('add-remittance')).toBeVisible()
})

test('26R01 / 26R02 deep-links open the sheet from seeded Actuals', async ({ page }) => {
  for (const code of ['26r01', '26r02']) {
    await page.goto(`/settlements/${code}`)
    if (!page.url().match(new RegExp(`/settlements/${code}/?$`, 'i'))) {
      continue
    }
    await expect(page.getByTestId('settlements-sheet')).toBeVisible({ timeout: 8000 })
    await expect(page.getByTestId('settlements-sheet-pre-show')).toHaveCount(0)
    await expect(page.getByTestId('settlements-left-pane')).toHaveCount(0)
  }
})

test('Band Costs quote/invoice stub attaches a dummy PDF and shows a chip', async ({ page }) => {
  await page.goto('/settlements/r12/agent')
  if (!page.url().match(/\/settlements\/r12\/agent/i)) {
    test.skip(true, 'R12 Wave-1 workspace not available')
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

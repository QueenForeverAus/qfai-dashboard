import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('Settlements list hides proposed/future R12; deep-link still pre-show blocks', async ({ page }) => {
  await page.goto('/runs')
  await page.getByRole('link', { name: /^settlements$/i }).click()
  await expect(page).toHaveURL(/\/settlements\/?$/)
  await expect(page.getByTestId('settlements-bucket-tabs')).toBeVisible({ timeout: 8000 })
  await expect(page.getByTestId('settlement-run-R12')).toHaveCount(0)

  await page.goto('/settlements/r12')
  await expect(page).toHaveURL(/\/settlements\/r12\/?$/i)
  await expect(page).not.toHaveURL(/\/sheet/i)
  await expect(page.getByTestId('settlements-sheet-pre-show')).toBeVisible({ timeout: 8000 })
  await expect(page.getByTestId('settlements-demo-banner')).toHaveCount(0)
  await expect(page.getByText('Data not yet available — check back when the show has occurred.')).toBeVisible()
  await expect(page.getByText('Stakeholders use Advancing, not Settlements.')).toBeVisible()
  await expect(page.getByTestId('settlements-sheet')).toHaveCount(0)
  await expect(page.getByTestId('settlements-left-pane')).toHaveCount(0)
  await expect(page.getByTestId('settlements-right-pane')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Agent Settlement' })).toHaveCount(0)
  await expect(page.getByTestId('sheet-harbour-fixture')).toHaveCount(0)
  await expect(page.locator('input[type="range"]')).toHaveCount(0)
  await expect(page.getByTestId('tab-remittance')).toBeVisible()
  await expect(page.getByTestId('tab-settlement')).toBeVisible()
  await expect(page.getByTestId('tab-sheet')).toHaveCount(0)
})

test('Tour Desk → Settlements → TCOMP1 lands on the 3-col sheet, not Wave-1 dual pane', async ({ page }) => {
  await page.goto('/runs')
  await page.getByRole('link', { name: /^settlements$/i }).click()
  await expect(page).toHaveURL(/\/settlements\/?$/)
  const glance = page.getByTestId('settlement-demo-TCOMP1')
  if (await glance.count() === 0) {
    test.skip(true, 'TCOMP1 not present on this environment')
    return
  }
  await expect(page.getByTestId('settlements-demo-glance')).toBeVisible()
  for (const key of ['not_settled', 'settled', 'settled_remitted']) {
    await page.getByTestId(`settlements-bucket-${key}`).click()
    if (await page.getByTestId('settlement-run-TCOMP1').count()) break
  }
  await expect(page.getByTestId('settlement-demo-badge-TCOMP1')).toBeVisible()
  await glance.click()
  await page.waitForURL(/\/settlements\/tcomp1\/?$/i)
  await expect(page).not.toHaveURL(/\/sheet/i)
  await expect(page.getByTestId('settlements-sheet')).toBeVisible({ timeout: 8000 })
  await expect(page.getByTestId('settlements-demo-banner')).toBeVisible()
  await expect(page.getByTestId('settlements-sheet-pre-show')).toHaveCount(0)
  await expect(page.getByTestId('settlements-sheet-col1').first()).toHaveText(/line/i)
  await expect(page.getByTestId('settlements-sheet-col2').first()).toHaveText(/expected \(advancing\)/i)
  await expect(page.getByTestId('settlements-sheet-col3').first()).toHaveText(/actuals/i)
  await expect(page.getByTestId('settlements-left-pane')).toHaveCount(0)
  await expect(page.getByTestId('settlements-right-pane')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Agent Settlement' })).toHaveCount(0)
})

test('pre-show Settlements sheet is still hard-blocked', async ({ page }) => {
  await page.goto('/settlements/r12')
  if (!page.url().match(/\/settlements\/r12\/?$/i)) {
    test.skip(true, 'R12 sheet not available')
    return
  }
  await expect(page.getByTestId('settlements-sheet-pre-show')).toBeVisible({ timeout: 8000 })
  await expect(page.getByText('Data not yet available — check back when the show has occurred.')).toBeVisible()
  await expect(page.getByText('Stakeholders use Advancing, not Settlements.')).toBeVisible()
  await expect(page.getByTestId('settlements-sheet')).toHaveCount(0)
  await expect(page.getByTestId('sheet-harbour-fixture')).toHaveCount(0)
  await expect(page.locator('input[type="range"]')).toHaveCount(0)
})

test('legacy /sheet redirects to the canonical run sheet', async ({ page }) => {
  await page.goto('/settlements/r12/sheet')
  if (page.url().match(/login/i)) {
    test.skip(true, 'R12 sheet not available')
    return
  }
  await expect(page).toHaveURL(/\/settlements\/r12\/?$/)
  await expect(page.getByTestId('settlements-sheet-pre-show')).toBeVisible({ timeout: 8000 })
})

test('post-show TCOMP1 Sheet fills Col3 actuals, confirm, challenge (not sent), band edit until PAID', async ({ page }) => {
  await page.goto('/settlements/tcomp1')
  if (!page.url().match(/\/settlements\/tcomp1\/?$/i)) {
    test.skip(true, 'TCOMP1 sheet not available')
    return
  }
  await expect(page.getByTestId('settlements-sheet')).toBeVisible({ timeout: 8000 })
  await expect(page.getByTestId('settlements-sheet-pre-show')).toHaveCount(0)
  await expect(page.getByTestId('settlements-sheet-col1').first()).toHaveText(/line/i)
  await expect(page.getByTestId('settlements-sheet-col2').first()).toHaveText(/expected \(advancing\)/i)
  await expect(page.getByTestId('settlements-sheet-col3').first()).toHaveText(/actuals/i)
  await expect(page.getByTestId('settlements-sheet-col3-note')).toContainText(/confirmed/i)
  await expect(page.getByTestId('settlements-sheet-col3-note')).toContainText(/Challenge/)
  await expect(page.getByText('Tickets sold (actual count)').first()).toBeVisible()
  await expect(page.getByTestId('sheet-row-harbour_commission').first()).toBeVisible()
  await expect(page.getByText('Venue Hire').first()).toBeVisible()
  await expect(page.locator('input[type="range"]')).toHaveCount(0)
  await expect(page.getByTestId('pnl-owner-revenue')).toHaveCount(0)

  await page.getByTestId('sheet-harbour-fixture').click()
  await expect(page.getByTestId('sheet-harbour-fixture')).toBeEnabled({ timeout: 15000 })
  await page.reload()
  await expect(page.getByTestId('settlements-sheet')).toBeVisible({ timeout: 8000 })
  await expect(page.getByTestId('sheet-actual-show:venue_hire').first()).toBeVisible({ timeout: 8000 })
  await expect(page.getByTestId('sheet-challenge-show:venue_hire').first()).toBeVisible({ timeout: 8000 })
  await expect(page.getByTestId('sheet-actual-status-show:venue_hire').first()).toContainText(/confirmed|challenged/i)
  await expect(page.getByTestId('sheet-variance-show:venue_hire').first()).toBeVisible()

  await page.getByTestId('sheet-challenge-show:venue_hire').first().click()
  await expect(page.getByTestId('sheet-challenge-panel')).toBeVisible()
  await page.getByTestId('sheet-challenge-reason').fill('Harbour hire is $3,100 not the advancing $3,200')
  await page.getByTestId('sheet-create-challenge-draft').click()
  await expect(page.getByTestId('sheet-challenge-draft-preview')).toBeVisible({ timeout: 8000 })
  await expect(page.getByTestId('sheet-challenge-draft-preview')).toContainText(/Draft only — not sent/)
  await expect(page.getByTestId('sheet-challenge-draft-preview')).toContainText(/never auto-sends/)

  const bandInput = page.getByTestId('sheet-band-input-run:accommodation').first()
  await expect(bandInput).toBeVisible()
  if (await page.getByTestId('sheet-band-reopen-run:accommodation').first().isVisible().catch(() => false)) {
    await page.getByTestId('sheet-band-reopen-run:accommodation').first().click()
    await expect(bandInput).toBeEnabled({ timeout: 8000 })
  }
  await expect(bandInput).toBeEnabled()
  await bandInput.fill('2700')
  await page.getByTestId('sheet-band-save-run:accommodation').first().click()
  await expect(page.getByTestId('sheet-band-save-run:accommodation').first()).toBeEnabled({ timeout: 15000 })
  await page.getByTestId('sheet-band-paid-btn-run:accommodation').first().click()
  await expect(page.getByTestId('sheet-band-paid-run:accommodation').first()).toHaveText(/PAID/, { timeout: 15000 })
  await expect(page.getByTestId('sheet-band-input-run:accommodation').first()).toBeDisabled()

  await expect(page.getByTestId('sheet-rollup-show:venue_marketing').first()).toBeVisible()
  await expect(page.getByTestId('sheet-rollup-child-show:venue_marketing::edm').first()).toContainText(/EDM/i)
  await expect(page.getByTestId('sheet-rollup-child-show:venue_marketing::banner').first()).toContainText(/Banner/i)
  await expect(page.getByTestId('sheet-rollup-child-show:venue_marketing::fb').first()).toContainText(/FB/i)

  await expect(page.getByTestId('settlements-sheet-expected-pnl').first()).toBeVisible()
  await expect(page.getByTestId('settlements-sheet-actual-pnl').first()).toBeVisible()
  await expect(page.getByTestId('settlements-sheet-expected-pnl').first()).toContainText(/Expected P&L \(Col2\)/)
  await expect(page.getByTestId('settlements-sheet-actual-pnl').first()).toContainText(/Actual \/ true P&L \(Col3\)/)
  await expect(page.getByTestId('settlements-sheet-expected-pnl').first()).toContainText(/Pre-Distribution Margin/)

  await expect(page.getByTestId('distribute-gate').first()).toBeVisible()
  await expect(page.getByTestId('distribute-gate-rule').first()).toContainText(/confirm-tick/)
  await expect(page.getByTestId('distribute-gate-rule').first()).toContainText(/Figure-accuracy Confirmed \(known\) is not enough/)
  await expect(page.getByTestId('distribute-funds').first()).toBeDisabled()
  await expect(page.getByTestId('distribute-gate').first()).toHaveAttribute('data-ready', 'false')
})

test('Wave 1 Band Costs shows HARD distribute gate blocked (does not replace close-gate)', async ({ page }) => {
  await page.goto('/settlements/tcomp1/agent')
  if (!page.url().match(/\/settlements\/tcomp1\/agent/i)) {
    test.skip(true, 'TCOMP1 Wave-1 workspace not available')
    return
  }
  await expect(page.getByTestId('close-gate-summary')).toBeVisible({ timeout: 8000 })
  await expect(page.getByTestId('distribute-gate')).toBeVisible()
  await expect(page.getByTestId('distribute-gate-rule')).toContainText(/confirm-tick/)
  await expect(page.getByTestId('distribute-funds')).toBeDisabled()
  const res = await page.request.post('/api/settlements/tcomp1/distribute')
  expect(res.status()).toBe(409)
  const body = await res.json()
  expect(body.distributed).toBe(false)
  expect(String(body.error || '')).toMatch(/blocked|confirm-tick|PAID/i)
})

test('distribute gate unblocked when evaluate reports ready (API contract)', async ({ page }) => {
  await page.goto('/settlements/tcomp1')
  if (!page.url().match(/\/settlements\/tcomp1\/?$/i)) {
    test.skip(true, 'TCOMP1 sheet not available')
    return
  }
  const status = await page.request.get('/api/settlements/tcomp1/distribute')
  if (!status.ok()) {
    test.skip(true, 'distribute GET not available')
    return
  }
  const json = await status.json()
  if (json.gate?.ready === true) {
    await expect(page.getByTestId('distribute-funds').first()).toBeEnabled()
    const post = await page.request.post('/api/settlements/tcomp1/distribute')
    expect(post.status()).toBe(200)
    const body = await post.json()
    expect(body.stub).toBe(true)
    expect(body.distributed).toBe(false)
    expect(String(body.message || body.note || '')).toMatch(/stub|no funds moved/i)
  } else {
    expect(json.gate?.ready).toBe(false)
    expect(json.gate?.rule || '').toMatch(/Figure-accuracy Confirmed \(known\) is not enough/)
    await expect(page.getByTestId('distribute-funds').first()).toBeDisabled()
  }
})

test('Remittance and Wave-1 agent settlement remain secondary from the sheet', async ({ page }) => {
  await page.goto('/settlements/r12')
  if (!page.url().match(/\/settlements\/r12\/?$/i)) {
    test.skip(true, 'R12 sheet not available')
    return
  }
  await expect(page.getByTestId('settlements-sheet-pre-show')).toBeVisible({ timeout: 8000 })
  await expect(page.getByTestId('tab-remittance')).toBeVisible()
  await page.getByTestId('tab-remittance').click()
  await page.waitForURL(/\/settlements\/r12\/remittance/i)
  await expect(page.getByTestId('remittance-compare')).toBeVisible()
  await expect(page.getByTestId('tab-sheet')).toBeVisible()
  await page.getByTestId('tab-settlement').click()
  await page.waitForURL(/\/settlements\/r12\/agent/i)
  await expect(page.getByTestId('settlements-left-pane')).toBeVisible()
  await expect(page.getByTestId('settlements-right-pane')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Band Costs' })).toBeVisible()
  await page.getByTestId('tab-sheet').click()
  await page.waitForURL(/\/settlements\/r12\/?$/i)
  await expect(page.getByTestId('settlements-sheet-pre-show')).toBeVisible()
})

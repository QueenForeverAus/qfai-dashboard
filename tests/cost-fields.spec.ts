import { test, expect, Page } from '@playwright/test'
import { login } from './helpers'

// Core regression: cost field entries persist after refresh (API write path)

test.beforeEach(async ({ page }) => {
  await login(page)
})

async function seedTestRun(page: Page): Promise<string> {
  const res = await page.request.post('/api/admin/seed-run', {
    data: { runCode: 'TEST01' },
    headers: { 'Content-Type': 'application/json' },
  })
  const body = await res.json().catch(() => ({}))
  return body.runId ?? ''
}

test('cost field entry saves and persists after refresh', async ({ page }) => {
  await page.goto('/runs')

  const runLinks = page.getByRole('link', { name: /R\d+|TEST/i })
  const count = await runLinks.count()

  if (count === 0) {
    test.skip(true, 'No runs available on staging — seed one first')
    return
  }

  await runLinks.first().click()
  await page.waitForURL(/\/runs\//)

  const costingTab = page.getByRole('button', { name: /run costing/i })
  if (await costingTab.isVisible()) await costingTab.click()

  // Line total is read-only — edit sub-item entries instead
  const entriesToggle = page.locator('button').filter({ hasText: /▼/ }).first()
  await expect(entriesToggle).toBeVisible({ timeout: 5000 })
  await entriesToggle.click()

  const descInput = page.getByPlaceholder(/description/i)
  await descInput.fill('Playwright test entry')

  const amountInput = page.getByPlaceholder(/\$0/i)
  await amountInput.fill('50')

  await page.getByRole('button', { name: /\+ add/i }).click()
  await page.waitForTimeout(1500)

  await expect(page.getByText('Playwright test entry').first()).toBeVisible()

  await page.reload()
  await page.waitForLoadState('networkidle')

  const tab = page.getByRole('button', { name: /run costing/i })
  if (await tab.isVisible()) await tab.click()

  const toggle2 = page.locator('button').filter({ hasText: /▼/ }).first()
  if (await toggle2.isVisible()) await toggle2.click()

  await expect(page.getByText('Playwright test entry').first()).toBeVisible({ timeout: 5000 })
  await expect(page.getByText(/\d+\s+entr(y|ies)/).first()).toBeVisible()
  await expect(page.getByText(/\d+ receipts?/)).not.toBeVisible()
})

test('confirming every line rolls the section up to CONFIRMED; unticking restores it', async ({ page }) => {
  await page.goto('/runs')
  const runLinks = page.getByRole('link', { name: /R\d+|TEST/i })
  if (await runLinks.count() === 0) {
    test.skip(true, 'No runs available on staging — seed one first')
    return
  }

  await runLinks.first().click()
  await page.waitForURL(/\/runs\//)

  const costingTab = page.getByRole('button', { name: /run costing/i })
  if (await costingTab.isVisible()) await costingTab.click()

  const field = page.locator('[data-testid="cost-field-venue_hire"]').first()
  await expect(field).toBeVisible({ timeout: 8000 })

  await field.locator('button').filter({ hasText: /▼/ }).click()

  const ticks = field.getByTestId('entry-confirm-tick')
  await expect(ticks.first()).toBeVisible({ timeout: 5000 })

  const count = await ticks.count()
  for (let i = 0; i < count; i++) {
    const tick = ticks.nth(i)
    if (!(await tick.isVisible())) continue
    if ((await tick.getAttribute('aria-pressed')) !== 'true') {
      await tick.click()
      await page.waitForTimeout(400)
    }
  }

  await expect(field.getByTestId('cost-field-state')).toHaveText(/CONFIRMED/i, { timeout: 8000 })
  await expect(field.getByText('All confirmed ✓')).toBeVisible()

  await ticks.first().click()
  await expect(field.getByTestId('cost-field-state')).not.toHaveText(/CONFIRMED/i, { timeout: 8000 })
})

test('confirm then mark PAID locks the line; un-pay unlocks; section PAID rolls up', async ({ page }) => {
  await page.goto('/runs')
  const runLinks = page.getByRole('link', { name: /R\d+|TEST/i })
  if (await runLinks.count() === 0) {
    test.skip(true, 'No runs available on staging — seed one first')
    return
  }

  await runLinks.first().click()
  await page.waitForURL(/\/runs\//)

  const costingTab = page.getByRole('button', { name: /run costing/i })
  if (await costingTab.isVisible()) await costingTab.click()

  const field = page.locator('[data-testid="cost-field-venue_hire"]').first()
  await expect(field).toBeVisible({ timeout: 8000 })
  await field.locator('button').filter({ hasText: /▼/ }).click()

  const ticks = field.getByTestId('entry-confirm-tick')
  await expect(ticks.first()).toBeVisible({ timeout: 5000 })

  const count = await ticks.count()
  for (let i = 0; i < count; i++) {
    const tick = ticks.nth(i)
    if (!(await tick.isVisible())) continue
    if ((await tick.getAttribute('aria-pressed')) !== 'true') {
      await tick.click()
      await page.waitForTimeout(400)
    }
  }

  await expect(field.getByTestId('cost-field-state')).toHaveText(/CONFIRMED/i, { timeout: 8000 })
  await expect(field.getByTestId('cost-field-paid')).toHaveCount(0)

  const payButtons = field.getByTestId('entry-paid-toggle')
  await expect(payButtons.first()).toBeVisible({ timeout: 5000 })
  const payCount = await payButtons.count()
  for (let i = 0; i < payCount; i++) {
    const btn = payButtons.nth(i)
    if (!(await btn.isVisible())) continue
    if ((await btn.getAttribute('aria-pressed')) !== 'true') {
      await btn.click()
      await page.waitForTimeout(400)
    }
  }

  await expect(field.getByTestId('cost-field-paid')).toHaveText(/PAID/i, { timeout: 8000 })
  await expect(field.getByTestId('cost-field-state')).toHaveText(/CONFIRMED/i)
  await expect(field.getByTestId('entry-paid-lock').first()).toBeVisible()
  await expect(ticks.first()).toBeDisabled()

  await payButtons.first().click()
  await expect(field.getByTestId('cost-field-paid')).toHaveCount(0, { timeout: 8000 })
  await expect(ticks.first()).toBeEnabled()
  await expect(field.getByTestId('cost-field-state')).toHaveText(/CONFIRMED/i)
})

async function openVenueHire(page: Page) {
  const costingTab = page.getByRole('button', { name: /run costing/i })
  if (await costingTab.isVisible()) await costingTab.click()
  const field = page.locator('[data-testid="cost-field-venue_hire"]').first()
  await expect(field).toBeVisible({ timeout: 8000 })
  await field.locator('button').filter({ hasText: /▼/ }).click()
  return field
}

async function ensureTwoEntries(page: Page, field: ReturnType<Page['locator']>) {
  const rows = field.getByTestId('entry-row')
  await expect(rows.first()).toBeVisible({ timeout: 5000 })
  if (await rows.count() < 2) {
    await field.getByPlaceholder(/description/i).fill('W12b second line')
    await field.getByPlaceholder(/\$0/i).fill('25')
    await field.getByRole('button', { name: /\+ add/i }).click()
    await expect(rows).toHaveCount(2, { timeout: 8000 })
  }
}

test('MARK ALL AS PAID works with partial ticks, restores paid snapshot, and writes Audit Trail', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/runs')
  const runLinks = page.getByRole('link', { name: /R\d+|TEST/i })
  if (await runLinks.count() === 0) {
    test.skip(true, 'No runs available on staging — seed one first')
    return
  }

  await runLinks.first().click()
  await page.waitForURL(/\/runs\//)

  const field = await openVenueHire(page)
  await ensureTwoEntries(page, field)

  const ticks = field.getByTestId('entry-confirm-tick')
  const payButtons = field.getByTestId('entry-paid-toggle')
  const count = await ticks.count()
  for (let i = 0; i < count; i++) {
    const tick = ticks.nth(i)
    if (!(await tick.isVisible())) continue
    const pressed = (await tick.getAttribute('aria-pressed')) === 'true'
    if (i === 0 && !pressed) {
      await tick.click()
      await page.waitForTimeout(400)
    }
    if (i > 0 && pressed) {
      await tick.click()
      await page.waitForTimeout(400)
    }
  }

  const firstRow = field.getByTestId('entry-row').first()
  await expect(ticks.first()).toHaveAttribute('aria-pressed', 'true')
  const firstPay = payButtons.first()
  await expect(firstPay).toBeVisible({ timeout: 5000 })
  if ((await firstPay.getAttribute('aria-pressed')) !== 'true') {
    await firstPay.click()
  }
  await expect(firstRow).toHaveAttribute('data-paid', 'true', { timeout: 8000 })

  await expect(field.getByTestId('cost-field-paid')).toHaveCount(0)
  await expect(field.getByTestId('cost-field-edit-select')).toHaveCount(0)

  await field.getByTestId('cost-field-edit').click()
  const select = field.getByTestId('cost-field-edit-select')
  await expect(select).toBeVisible()
  await expect(field.getByTestId('cost-field-bulk-paid-option')).toBeEnabled()
  await expect(field.getByTestId('cost-field-bulk-paid-option')).toHaveText(/MARK ALL AS PAID/)
  await select.selectOption('bulk_paid')
  await field.getByTestId('cost-field-edit-save').click()
  await expect(field.getByTestId('cost-field-edit-save')).toHaveCount(0, { timeout: 8000 })

  await expect(field.getByTestId('cost-field-paid')).toHaveText(/PAID/i, { timeout: 8000 })
  await expect(field.getByTestId('entry-paid-lock').first()).toBeVisible()
  const lockCount = await field.getByTestId('entry-paid-lock').count()
  expect(lockCount).toBeGreaterThanOrEqual(2)

  await field.getByTestId('cost-field-edit').click()
  await expect(field.getByTestId('cost-field-edit-select')).toHaveValue('bulk_paid')
  await field.getByTestId('cost-field-edit-select').selectOption('known')
  await field.getByTestId('cost-field-edit-save').click()
  await expect(field.getByTestId('cost-field-edit-save')).toHaveCount(0, { timeout: 8000 })

  await expect(field.getByTestId('cost-field-paid')).toHaveCount(0, { timeout: 8000 })
  await expect(field.getByTestId('cost-field-state')).toHaveText(/CONFIRMED/i)
  const rows = field.getByTestId('entry-row')
  await expect(rows.first()).toHaveAttribute('data-paid', 'true', { timeout: 8000 })
  await expect(rows.nth(1)).toHaveAttribute('data-paid', 'false')

  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  const auditTab = page.getByRole('button', { name: /audit trail/i })
  if (await auditTab.isVisible()) await auditTab.click()
  await expect(page.getByText(/MARK ALL AS PAID/i).first()).toBeVisible({ timeout: 8000 })
  await expect(page.getByText(/marked all lines/i).first()).toBeVisible()
  await expect(page.getByText(/not confirm-ticked/i).first()).toBeVisible()
  await expect(page.getByText(/PAID snapshot restore/i).first()).toBeVisible()
  await expect(page.getByText(/restored prior PAID snapshot/i).first()).toBeVisible()
})

test('entries label shows "entries" not "receipts"', async ({ page }) => {
  await page.goto('/runs')
  const runLinks = page.getByRole('link', { name: /R\d+|TEST/i })
  if (await runLinks.count() === 0) {
    test.skip(true, 'No runs available')
    return
  }

  await runLinks.first().click()
  await page.waitForURL(/\/runs\//)

  const costingTab = page.getByRole('button', { name: /run costing/i })
  if (await costingTab.isVisible()) await costingTab.click()

  const receiptsText = page.locator('[class*="text-slate"]').filter({ hasText: /\d+ receipts/ })
  await expect(receiptsText).toHaveCount(0)
})

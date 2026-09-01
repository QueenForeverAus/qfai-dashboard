import { test, expect, Page } from '@playwright/test'
import { login } from './helpers'

// This test creates a run and verifies cost field entry persistence
// The core regression that was broken: entries not saving to DB

test.beforeEach(async ({ page }) => {
  await login(page)
})

async function seedTestRun(page: Page): Promise<string> {
  // Use the seed-run API to create a test run on staging
  const res = await page.request.post('/api/admin/seed-run', {
    data: { runCode: 'TEST01' },
    headers: { 'Content-Type': 'application/json' },
  })
  const body = await res.json().catch(() => ({}))
  return body.runId ?? ''
}

test('cost field entry saves and persists after refresh', async ({ page }) => {
  await page.goto('/runs')

  // Find a run link — take the first one available
  const runLinks = page.getByRole('link', { name: /R\d+|TEST/i })
  const count = await runLinks.count()

  if (count === 0) {
    test.skip(true, 'No runs available on staging — seed one first')
    return
  }

  await runLinks.first().click()
  await page.waitForURL(/\/runs\//)

  // Click into the "Run Costing" tab if not already active
  const costingTab = page.getByRole('button', { name: /run costing/i })
  if (await costingTab.isVisible()) await costingTab.click()

  // Find a cost field Edit button (not the synopsis one)
  const editBtn = page.locator('[data-testid="cost-field-edit"]').first()
  await expect(editBtn).toBeVisible({ timeout: 5000 })
  await editBtn.click()

  // Set value and change status to Confirmed
  const valueInput = page.locator('input[type="number"]').first()
  await valueInput.fill('100')

  const statusSelect = page.locator('select').first()
  await statusSelect.selectOption('known')

  // Save
  await page.getByRole('button', { name: /^save$/i }).click()
  await page.waitForTimeout(1000)

  // Open the entries panel (▼ button)
  const entriesToggle = page.locator('button').filter({ hasText: /▼/ }).last()
  if (await entriesToggle.isVisible()) {
    await entriesToggle.click()

    // Add an entry
    const descInput = page.getByPlaceholder(/description/i)
    await descInput.fill('Playwright test entry')

    const amountInput = page.getByPlaceholder(/\$0/i)
    await amountInput.fill('50')

    await page.getByRole('button', { name: /\+ add/i }).click()
    await page.waitForTimeout(1500)

    // Verify entry appears (use first() in case prior test runs left duplicate entries)
    await expect(page.getByText('Playwright test entry').first()).toBeVisible()

    // Refresh the page
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Click Run Costing tab again
    const tab = page.getByRole('button', { name: /run costing/i })
    if (await tab.isVisible()) await tab.click()

    // Open entries panel again (click the ▼ toggle on the field we edited)
    const toggle2 = page.locator('button').filter({ hasText: /▼/ }).last()
    if (await toggle2.isVisible()) await toggle2.click()

    // Entry should still be there — this is the core regression test
    await expect(page.getByText('Playwright test entry').first()).toBeVisible({ timeout: 5000 })
    // Subtitle shows "1 entry" or "N entries" — just check the word "entr"
    await expect(page.getByText(/\d+\s+entr(y|ies)/)).toBeVisible()
    await expect(page.getByText(/\d+ receipts?/)).not.toBeVisible()
  }
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

  // Should never see the word "receipts" on cost fields
  const costingTab = page.getByRole('button', { name: /run costing/i })
  if (await costingTab.isVisible()) await costingTab.click()

  // Check that "receipts" label doesn't appear in the cost field area
  const receiptsText = page.locator('[class*="text-slate"]').filter({ hasText: /\d+ receipts/ })
  await expect(receiptsText).toHaveCount(0)
})

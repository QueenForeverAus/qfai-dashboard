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

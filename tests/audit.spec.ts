import { test, expect } from '@playwright/test'
import { login } from './helpers'

const PAGES = [
  { path: '/', name: 'home' },
  { path: '/runs', name: 'runs-list' },
  { path: '/calculator', name: 'calculator' },
  { path: '/factors', name: 'factors' },
  { path: '/settlement', name: 'settlement' },
  { path: '/emails', name: 'emails' },
  { path: '/admin', name: 'admin' },
  { path: '/settings', name: 'settings' },
  { path: '/feedback', name: 'feedback' },
]

test.beforeEach(async ({ page }) => {
  await login(page)
})

for (const { path, name } of PAGES) {
  test(`audit: ${name} (${path})`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: `test-results/audit-${name}.png`, fullPage: true })
    // Flag if redirected to login (shouldn't happen when logged in)
    await expect(page).not.toHaveURL(/login/, { timeout: 3000 })
  })
}

test('audit: run detail + all tabs', async ({ page }) => {
  await page.goto('/runs')
  await page.waitForLoadState('networkidle')
  // Run code is a <span>; the run name is the <Link> — click that
  const runLink = page.getByRole('link', { name: /Playwright Test Run/i })
    .or(page.getByText('TEST01').locator('..').getByRole('link'))
  await expect(runLink.first()).toBeVisible({ timeout: 10000 })
  await runLink.first().click()
  await page.waitForURL(/\/runs\//)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'test-results/audit-run-detail.png', fullPage: true })

  // P&L Calculator tab
  const plTab = page.getByRole('button', { name: /p&l calculator/i })
  if (await plTab.isVisible()) {
    await plTab.click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'test-results/audit-run-pl.png', fullPage: true })
  }

  // Run Costing tab
  const costTab = page.getByRole('button', { name: /run costing/i })
  if (await costTab.isVisible()) {
    await costTab.click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'test-results/audit-run-costing.png', fullPage: true })
  }

  // Audit Trail tab
  const auditTab = page.getByRole('button', { name: /audit trail/i })
  if (await auditTab.isVisible()) {
    await auditTab.click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'test-results/audit-run-audit.png', fullPage: true })
  }
})

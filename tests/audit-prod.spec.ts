import { test, Page } from '@playwright/test'

const BASE = 'https://tours.queenforever.com.au'
const EMAIL = 'audit@queenforever.com.au'
const PASS  = 'AuditQF2026!'

async function prodLogin(page: Page) {
  await page.goto(BASE + '/login')
  await page.waitForLoadState('networkidle')
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /sign in/i }).click()
  // May land on mfa-enroll (no factors), runs, or home
  await page.waitForURL(/\/(runs|mfa-enroll|$)/, { timeout: 15000 })
  if (page.url().includes('mfa-enroll')) {
    await page.goto(BASE + '/runs')
    await page.waitForURL(/\/runs/, { timeout: 10000 })
  }
}

test('prod: mission control', async ({ page }) => {
  await prodLogin(page)
  await page.goto(BASE + '/')
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'test-results/prod-home.png', fullPage: true })
})

test('prod: runs list', async ({ page }) => {
  await prodLogin(page)
  await page.goto(BASE + '/runs')
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'test-results/prod-runs.png', fullPage: true })
})

test('prod: calculator', async ({ page }) => {
  await prodLogin(page)
  await page.goto(BASE + '/calculator')
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'test-results/prod-calculator.png', fullPage: true })
})

test('prod: first run detail + costing', async ({ page }) => {
  await prodLogin(page)
  await page.goto(BASE + '/runs')
  await page.waitForLoadState('networkidle')
  // Click first run name link
  const firstLink = page.getByRole('link').filter({ hasText: /Broken Hill|Taree|Springwood|Penrith|Bunbury|Feb|Mar|Apr/i }).first()
  const visible = await firstLink.isVisible({ timeout: 5000 }).catch(() => false)
  if (visible) {
    await firstLink.click()
    await page.waitForURL(/\/runs\//, { timeout: 10000 })
  } else {
    // Fallback: navigate to r01 directly
    await page.goto(BASE + '/runs/r01')
  }
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'test-results/prod-run-detail.png', fullPage: true })
  const costTab = page.getByRole('button', { name: /run costing/i })
  if (await costTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await costTab.click()
    await page.waitForTimeout(800)
  }
  await page.screenshot({ path: 'test-results/prod-run-costing.png', fullPage: true })
})

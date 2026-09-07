import { Page } from '@playwright/test'

export const TEST_EMAIL = 'test@queenforever.com.au'
export const TEST_PASS  = 'TestQF2026!'

export async function login(page: Page) {
  const share = process.env.PLAYWRIGHT_SHARE_URL
  if (share) {
    await page.goto(share)
    await page.waitForLoadState('domcontentloaded')
    // Share cookie is set after redirect; wait until the Vercel SSO wall is gone.
    await page.waitForFunction(
      () => !document.title.includes('Log in to Vercel'),
      undefined,
      { timeout: 20000 },
    ).catch(() => {})
  }
  await page.goto('/login')
  await page.locator('input[type="password"]').waitFor({ timeout: 20000 })
  if (await page.getByText('Log in to Vercel').isVisible().catch(() => false)) {
    throw new Error('Vercel Deployment Protection is still blocking /login — refresh PLAYWRIGHT_SHARE_URL')
  }
  await page.locator('input[type="email"]').last().fill(TEST_EMAIL)
  await page.locator('input[type="password"]').last().fill(TEST_PASS)
  await page.getByRole('button', { name: /sign in/i }).click()
  // Accept landing on runs, home, or mfa-enroll (staging test user has no MFA set up)
  await page.waitForURL(/\/(runs|mfa-enroll|mfa-verify|$)/, { timeout: 10000 })
  // If redirected to MFA enroll, skip it by navigating to runs directly
  if (page.url().includes('mfa-enroll')) {
    await page.goto('/runs')
    await page.waitForURL(/\/runs/, { timeout: 10000 })
  }
}

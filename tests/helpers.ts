import { Page } from '@playwright/test'

export const TEST_EMAIL = 'test@queenforever.com.au'
export const TEST_PASS  = 'TestQF2026!'

export async function login(page: Page) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(TEST_EMAIL)
  await page.locator('input[type="password"]').fill(TEST_PASS)
  await page.getByRole('button', { name: /sign in/i }).click()
  // Accept landing on runs, home, or mfa-enroll (staging test user has no MFA set up)
  await page.waitForURL(/\/(runs|mfa-enroll|mfa-verify|$)/, { timeout: 10000 })
  // If redirected to MFA enroll, skip it by navigating to runs directly
  if (page.url().includes('mfa-enroll')) {
    await page.goto('/runs')
    await page.waitForURL(/\/runs/, { timeout: 10000 })
  }
}

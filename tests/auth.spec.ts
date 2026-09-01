import { test, expect } from '@playwright/test'
import { login } from './helpers'

test('login page loads', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await expect(page.locator('input[type="password"]')).toBeVisible()
})

test('login with valid credentials', async ({ page }) => {
  await login(page)
  await expect(page).not.toHaveURL(/login/)
})

test('login with bad password shows error', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill('test@queenforever.com.au')
  await page.locator('input[type="password"]').fill('wrongpassword')
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page.getByText(/invalid|incorrect|wrong|error/i)).toBeVisible({ timeout: 5000 })
})

test('unauthenticated access redirects to login', async ({ page }) => {
  await page.goto('/runs')
  await expect(page).toHaveURL(/login/)
})

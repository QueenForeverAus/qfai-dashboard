import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('runs list page loads', async ({ page }) => {
  await page.goto('/runs')
  await expect(page).not.toHaveURL(/login/)
  // Page title or heading
  await expect(page.getByRole('heading', { name: /runs/i })).toBeVisible({ timeout: 5000 })
})

test('sidebar navigation is visible', async ({ page }) => {
  await page.goto('/runs')
  await expect(page.getByRole('link', { name: /mission control/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /runs/i })).toBeVisible()
})

test('shows SHOWS / RUNS heading and tabs', async ({ page }) => {
  await page.goto('/runs')
  await expect(page.getByRole('heading', { name: /shows \/ runs/i })).toBeVisible({ timeout: 5000 })
  await expect(page.getByRole('button', { name: /ALL/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /PROPOSED/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /CONFIRMED/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /DECLINED/i })).toBeVisible()
})

test('proposed run shows Accept and Decline buttons', async ({ page }) => {
  await page.goto('/runs')
  await page.getByRole('button', { name: /PROPOSED/i }).click()
  // TEST01 was set to proposed
  await expect(page.getByRole('button', { name: 'Accept' }).first()).toBeVisible({ timeout: 5000 })
  await expect(page.getByRole('button', { name: 'Decline' }).first()).toBeVisible()
})

test('completed run (past date) appears in COMPLETED tab', async ({ page }) => {
  await page.goto('/runs')
  await page.getByRole('button', { name: /COMPLETED/i }).click()
  // TCOMP1 has July 2026 dates — should appear as completed
  await expect(page.getByText('TCOMP1')).toBeVisible({ timeout: 5000 })
})

test('TCOMP1 detail page loads and shows cost fields', async ({ page }) => {
  await page.goto('/runs/tcomp1')
  await expect(page).not.toHaveURL(/login|404/)
  await expect(page.getByText('Geelong Performing Arts Centre')).toBeVisible({ timeout: 8000 })
  // Should show some known and some estimated fields
  await expect(page.getByText(/KNOWN|ESTIMATED/i).first()).toBeVisible()
})

test('Drafts menu item is not visible', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: /drafts/i })).not.toBeVisible()
})

import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('Tour Desk is a heading with Run Costings, Advancing Shows, Settlements', async ({ page }) => {
  await page.goto('/runs')
  const desk = page.getByRole('navigation').getByRole('group', { name: /^tour desk$/i })
  await expect(desk).toBeVisible()
  await expect(desk.getByRole('link', { name: /^run costings$/i })).toBeVisible()
  await expect(desk.getByRole('link', { name: /^advancing shows$/i })).toBeVisible()
  await expect(desk.getByRole('link', { name: /^settlements$/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /^tour desk$/i })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /p&l calculator/i })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /run calculator/i })).toHaveCount(0)
})

test('Run Costings opens the existing Tour Desk run list', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /^run costings$/i }).click()
  await expect(page).toHaveURL(/\/runs\/?$/)
  await expect(page.getByRole('heading', { name: /tour desk/i })).toBeVisible({ timeout: 5000 })
})

test('Advancing Shows opens the advancing entry and a run lands on Advancing tab', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /^advancing shows$/i }).click()
  await expect(page).toHaveURL(/\/advancing\/?$/)
  await expect(page.getByRole('heading', { name: /^advancing shows$/i })).toBeVisible({ timeout: 5000 })

  const r12 = page.getByRole('link', { name: /R12/i }).or(page.locator('a[href*="/runs/r12"]')).first()
  if (await r12.count() === 0) {
    test.skip(true, 'R12 not present on this environment')
    return
  }
  await r12.click()
  await expect(page).toHaveURL(/\/runs\/r12/i)
  await expect(page).toHaveURL(/tab=advancement/)
  await expect(page.getByRole('button', { name: /^advancing shows$/i })).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('button', { name: /p&l calculator/i })).toHaveCount(0)
})

test('Settlements child still opens Wave 1 Settlements', async ({ page }) => {
  await page.goto('/runs')
  await page.getByRole('link', { name: /^settlements$/i }).click()
  await expect(page).toHaveURL(/\/settlements\/?$/)
  await expect(page.getByRole('heading', { name: /^settlements$/i })).toBeVisible({ timeout: 8000 })
})

test('R12 Run Costing tabs still work after nav IA', async ({ page }) => {
  await page.goto('/runs/r12')
  await expect(page).toHaveURL(/\/runs\/r12\/?$/i)
  await expect(page.getByRole('button', { name: /run costing/i })).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('button', { name: /ticket outlook/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /audit trail/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /p&l calculator/i })).toHaveCount(0)
  await page.getByRole('button', { name: /run costing/i }).click()
  await expect(page.getByText(/CONFIRMED|KNOWN|ESTIMATED|PAID/i).first()).toBeVisible({ timeout: 8000 })
})

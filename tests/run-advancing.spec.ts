import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('proposed Run Costing stays editable', async ({ page }) => {
  await page.goto('/runs')
  await page.getByRole('button', { name: /^PROPOSED$/i }).click()
  const proposed = page.locator('a[href*="/runs/"]').first()
  if (await proposed.count() === 0) {
    test.skip(true, 'No proposed run on this environment')
    return
  }
  await proposed.click()
  await expect(page.getByTestId('run-costing-sheet')).toBeVisible({ timeout: 10000 })
  await expect(page.getByTestId('booked-cost-freeze-banner')).toHaveCount(0)
  await expect(page.getByTestId('cost-field-edit').first()).toBeVisible()
})

test('BOOKED Costing is locked, sell-through sliders stay editable', async ({ page }) => {
  await page.goto('/runs')
  await page.getByRole('button', { name: /^BOOKED$/i }).click()
  const booked = page.locator('a[href*="/runs/"]').first()
  if (await booked.count() === 0) {
    test.skip(true, 'No BOOKED run on this environment')
    return
  }
  await booked.click()
  await expect(page.getByTestId('booked-cost-freeze-banner')).toBeVisible({ timeout: 10000 })
  await expect(page.getByTestId('cost-field-edit')).toHaveCount(0)
  const slider = page.getByTestId('sell-through-slider').first()
  if (await slider.count()) {
    await expect(slider).toBeEnabled()
  }
})

test('Run Advancing shows the BOOKED copy and stays editable without write-back', async ({ page }) => {
  await page.goto('/advancing')
  await page.getByRole('button', { name: /^BOOKED$/i }).click()
  const booked = page.locator('a[href*="/runs/"]').first()
  if (await booked.count() === 0) {
    test.skip(true, 'No BOOKED run on advancing list')
    return
  }
  await booked.click()
  await expect(page).toHaveURL(/tab=run_advancing/)
  await expect(page.getByRole('button', { name: /^run advancing$/i })).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('button', { name: /^advancing checklist$/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /^worksheet$/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /^run costing$/i })).toHaveCount(0)

  const empty = page.getByTestId('run-advancing-empty')
  if (await empty.count()) {
    test.skip(true, 'Advancing workspace not copied on this environment yet')
    return
  }

  await expect(page.getByTestId('run-advancing-sheet')).toBeVisible({ timeout: 10000 })
  await expect(page.getByTestId('run-advancing-banner')).toBeVisible()
  await expect(page.getByTestId('cost-field-edit').first()).toBeVisible()

  const firstValue = page.getByTestId('cost-field-state').first()
  const before = (await firstValue.textContent()) ?? ''
  await page.getByTestId('cost-field-edit').first().click()
  const select = page.getByTestId('cost-field-edit-select')
  await expect(select).toBeVisible()
  const current = await select.inputValue()
  const next = current === 'guess' ? 'estimated' : 'guess'
  await select.selectOption(next)
  await page.getByTestId('cost-field-edit-save').click()
  await expect(page.getByTestId('cost-field-edit').first()).toBeVisible({ timeout: 8000 })

  const costingHref = page.url().replace(/[?&]tab=run_advancing/, '').replace(/\?$/, '')
  await page.goto(costingHref)
  await expect(page.getByTestId('run-costing-sheet')).toBeVisible({ timeout: 10000 })
  await expect(page.getByTestId('booked-cost-freeze-banner')).toBeVisible()
  await expect(page.getByTestId('cost-field-edit')).toHaveCount(0)
  const costingState = (await page.getByTestId('cost-field-state').first().textContent()) ?? ''
  if (before) {
    expect(costingState.toLowerCase()).not.toContain(next === 'guess' ? 'estimate' : 'guess')
  }
})

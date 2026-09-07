import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('Audit Trail tab shows sentences, not field keys or JSON dumps', async ({ page }) => {
  await page.goto('/runs')
  const runLinks = page.getByRole('link', { name: /R\d+|TEST/i })
  if (await runLinks.count() === 0) {
    test.skip(true, 'No runs available on staging — seed one first')
    return
  }

  await runLinks.first().click()
  await page.waitForURL(/\/runs\//)

  const auditTab = page.getByRole('button', { name: /audit trail/i })
  await expect(auditTab).toBeVisible({ timeout: 8000 })
  await auditTab.click()

  const table = page.getByTestId('audit-trail-table')
  await expect(table).toBeVisible({ timeout: 8000 })
  await expect(table.getByRole('columnheader', { name: /what happened/i })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: /^field$/i })).toHaveCount(0)

  const sentences = page.getByTestId('audit-trail-sentence')
  await expect(sentences.first()).toBeVisible()
  const texts = await sentences.allTextContents()
  expect(texts.length).toBeGreaterThan(0)
  for (const text of texts) {
    expect(text).not.toMatch(/entries\[[^\]]+\]/)
    expect(text).not.toMatch(/^\s*\{/)
    expect(text).not.toMatch(/venue_hire\.value|flights\.state/)
  }
})

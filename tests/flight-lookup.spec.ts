import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('Worksheet flight Lookup (mock) fills QF441 and auto airport call on R01/TRECV1', async ({ page }) => {
  await page.goto('/runs')
  let opened = false
  for (const code of ['R01', 'TRECV1']) {
    const link = page.getByRole('link', { name: new RegExp(`\\b${code}\\b`) }).first()
    if (await link.count()) {
      await link.click()
      opened = true
      break
    }
  }
  if (!opened) {
    test.skip(true, 'R01 / TRECV1 not on this environment')
    return
  }

  const worksheet = page.getByRole('button', { name: /^worksheet$/i })
  await expect(worksheet).toBeVisible({ timeout: 15000 })
  await worksheet.click()

  const travel = page.getByTestId('worksheet-travel-blocks')
  await expect(travel).toBeVisible({ timeout: 15000 })

  const addDep = travel.getByRole('button', { name: /^\+ Dep$/i })
  if (await addDep.count()) {
    await addDep.click()
  }

  const card = travel.getByTestId('travel-flight-card').first()
  await expect(card).toBeVisible()
  await card.getByTestId('flight-number').fill('QF441')
  await card.getByTestId('flight-date').fill('2027-02-10')
  await card.getByTestId('flight-lookup-btn').click()

  await expect(card.getByTestId('flight-airline')).toHaveValue('Qantas', { timeout: 10000 })
  await expect(card.getByTestId('flight-from')).toHaveValue('SYD')
  await expect(card.getByTestId('flight-to')).toHaveValue('BHQ')
  await expect(card.getByTestId('flight-dep-time')).toHaveValue('06:30')
  await expect(card.getByTestId('flight-arr-time')).toHaveValue('08:15')
  await expect(card.getByTestId('flight-dep-terminal')).toHaveValue('T3')
  await expect(card.getByTestId('flight-arr-terminal')).toHaveValue('')
  await expect(card.getByTestId('flight-airport-call')).toHaveValue('05:30')

  await card.getByTestId('flight-airport-call').fill('04:55')
  await card.getByTestId('flight-dep-time').fill('07:00')
  await expect(card.getByTestId('flight-airport-call')).toHaveValue('04:55')

  await card.getByTestId('flight-airport-call').fill('')
  await card.getByTestId('flight-dep-time').fill('07:30')
  await expect(card.getByTestId('flight-airport-call')).toHaveValue('06:30')
})

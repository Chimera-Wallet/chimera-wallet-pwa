import { test, expect } from './utils'

// Ported from arkade-os/wallet (#1046, #1048). Strings are the English locale
// values from src/lib/locales/en.

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Restore Wallet' }).click()
})

test('suggests recovery words without rewriting typed prefixes or showing premature errors', async ({ page }) => {
  const input = page.getByRole('combobox', { name: 'Recovery phrase or private key' })
  await input.pressSequentially('ah')
  await expect(input).toHaveValue('ah')
  await expect(input).toHaveAttribute('aria-invalid', 'false')
  await page.getByRole('option', { name: 'ahead', exact: true }).click()
  await expect(input).toHaveValue('ahead ')
  await expect(input).toBeFocused()

  await input.pressSequentially('agr')
  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(input).toHaveValue('ahead agree ')
  await expect(input).toHaveAttribute('aria-invalid', 'false')

  await input.pressSequentially('aban')
  await expect(input).toHaveValue('ahead agree aban')
  await page.getByRole('option', { name: 'abandon', exact: true }).click()
  await expect(input).toHaveValue('ahead agree abandon ')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByText('Enter the complete recovery phrase: 12, 15, 18, 21 or 24 words.')).toBeVisible()
})

test('preserves manual hex entry and reports finished-word errors with a stable Continue label', async ({ page }) => {
  const input = page.getByRole('combobox', { name: 'Recovery phrase or private key' })
  const key = 'abadef' + 'a'.repeat(58)
  await input.pressSequentially(key)
  await expect(input).toHaveValue(key)
  await expect(page.getByRole('option')).toHaveCount(0)

  await input.fill('abnadon')
  await expect(input).toHaveAttribute('aria-invalid', 'false')
  await input.press('Space')
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await input.fill('abandon ')
  await expect(input).toHaveAttribute('aria-invalid', 'false')
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled()
})

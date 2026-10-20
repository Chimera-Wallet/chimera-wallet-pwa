import { test, expect, createWallet, resetAndRestoreWallet } from './utils'

// Test to verify that settings are saved to nostr and restored correctly
// Since config persists across wallet resets, we need to add an extra step:
// 1. Enable nostr backups
// 2. Change a setting (fiat currency to euro)
// 3. Verify setting is euro
// 4. Disable nostr backups
// 5. Change setting (fiat currency to usd)
// 6. Verify setting is usd
// 7. Get nsec key
// 8. Reset wallet
// 9. Restore wallet with nsec key
// 10. Verify setting is euro (proving it was restored from nostr)
test('should save config to nostr', async ({ page }) => {
  test.setTimeout(60000)
  // create wallet
  await createWallet(page)

  // enable nostr backups
  await page.getByTestId('tab-settings').click()
  await page.getByText('backup', { exact: true }).click()
  await page.getByTestId('toggle-backup').click()

  // change fiat currency to euro
  await page.getByLabel('Go back').click()
  await page.getByText('general', { exact: true }).click()
  await expect(page.getByText('USD')).toBeVisible()
  await page.getByText('Fiat currency').click()
  await page.getByText('EUR').click()
  await page.waitForTimeout(500)

  // verify fiat currency is euro
  await page.getByLabel('Go back').click()
  await expect(page.getByText('EUR')).toBeVisible({ timeout: 2000 })

  // disable nostr backups
  await page.getByLabel('Go back').click()
  await page.getByText('backup', { exact: true }).click()
  await page.getByTestId('toggle-backup').click()

  // change fiat currency to usd
  await page.getByLabel('Go back').click()
  await page.getByText('general', { exact: true }).click()
  await page.getByText('Fiat currency').click()
  await page.getByText('USD').click()

  // verify fiat currency is usd
  await page.getByLabel('Go back').click()
  await expect(page.getByText('USD')).toBeVisible()

  // restore wallet
  await resetAndRestoreWallet(page)

  // verify fiat currency is euro
  await page.getByTestId('tab-settings').click()
  await page.getByText('general', { exact: true }).click()
  await expect(page.getByText('EUR')).toBeVisible()
})

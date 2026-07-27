import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:8081'

test('History and Share buttons render in document header', async ({ page }) => {
  // Login
  await page.goto(BASE + '/')
  await page.waitForLoadState('networkidle')
  await page.locator('#login').fill('admin')
  await page.locator('#password').fill('admin123')
  await Promise.all([
    page.waitForNavigation({ timeout: 10000 }),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ])
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveURL(BASE + '/')

  // Open an existing document
  const docLink = page.locator('.tree-item.document .document-link').first()
  await expect(docLink).toBeVisible({ timeout: 5000 })
  await Promise.all([
    page.waitForNavigation({ timeout: 10000 }),
    docLink.click(),
  ])
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(3000)

  // Take screenshot for debugging
  await page.screenshot({ path: 'test-results/debug-buttons-page.png', fullPage: true })

  // Check all expected buttons exist
  const historyBtn = page.getByRole('button', { name: /История|Скрыть историю/ })
  await expect(historyBtn).toBeVisible({ timeout: 5000 })

  const shareBtn = page.getByRole('button', { name: 'Share' })
  await expect(shareBtn).toBeVisible({ timeout: 5000 })

  const dashboardBtn = page.getByRole('button', { name: 'Dashboard' })
  await expect(dashboardBtn).toBeVisible({ timeout: 5000 })

  // Click History button - modal should appear
  await historyBtn.click()
  await page.waitForTimeout(500)

  // Revision history modal should be visible
  const historyModal = page.locator('.modal-overlay')
  await expect(historyModal).toBeVisible({ timeout: 5000 })

  // Click Share button - dialog should appear
  // Close the history modal first by clicking its own overlay area
  await page.locator('.modal-overlay').first().click({ position: { x: 10, y: 10 } })
  await page.waitForTimeout(500)
  await page.locator('.modal-overlay').first().count().then(async (c) => {
    // If still open, close again
    if (c > 0) {
      await page.locator('.modal-overlay').first().click({ position: { x: 10, y: 10 } })
      await page.waitForTimeout(500)
    }
  })
  await shareBtn.click()
  await page.waitForTimeout(500)

  const shareDialog = page.locator('.share-dialog')
  await expect(shareDialog).toBeVisible({ timeout: 5000 })
})

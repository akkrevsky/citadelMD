import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:8081'

test('History and Share buttons render in document header', async ({ page }) => {
  // Login
  await page.goto(BASE + '/')
  await page.waitForLoadState('domcontentloaded')
  await page.locator('#login').fill('admin')
  await page.locator('#password').fill('admin123')
  // LoginPage uses client-side navigation — wait for URL change.
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => !url.pathname.includes('login'), { timeout: 10000 })
  await page.waitForLoadState('domcontentloaded')

  // The app auto-resumes to the last opened document. If not on a document
  // page yet, open the first document from the tree; create one via the API
  // if the tree is empty.
  await page.waitForTimeout(1500)
  if (!page.url().includes('/documents/')) {
    let docLink = page.locator('.tree-row.document').first()
    if ((await docLink.count()) === 0) {
      await page.evaluate(async () => {
        const res = await fetch('/api/tree', { credentials: 'same-origin' })
        const body = await res.json()
        const folderId = body.tree?.[0]?.id
        if (folderId) {
          await fetch(`/api/folders/${folderId}/documents`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'E2E Buttons Doc' }),
          })
        }
      })
      await page.reload()
      await page.waitForTimeout(2000)
      docLink = page.locator('.tree-row.document').first()
    }
    await expect(docLink).toBeVisible({ timeout: 10000 })
    await docLink.click()
    await page.waitForURL(/\/documents\/.*\/edit/, { timeout: 10000 })
  }
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(3000)

  // Take screenshot for debugging
  await page.screenshot({ path: 'test-results/debug-buttons-page.png', fullPage: true })

  // Check all expected buttons exist. Note: two history buttons exist —
  // one in the document header, one in the editor toolbar. Target the
  // header one via .first().
  const historyBtn = page.getByRole('button', { name: /История|Скрыть историю/ }).first()
  await expect(historyBtn).toBeVisible({ timeout: 5000 })

  const shareBtn = page.getByRole('button', { name: 'Share' })
  await expect(shareBtn).toBeVisible({ timeout: 5000 })

  const dashboardBtn = page.getByRole('button', { name: 'Dashboard' })
  await expect(dashboardBtn).toBeVisible({ timeout: 5000 })

  // Click History button — the version history side panel should appear
  await historyBtn.click()
  await page.waitForTimeout(500)

  // History renders as a side panel, not a modal
  const historyPanel = page.locator('.history-panel')
  await expect(historyPanel).toBeVisible({ timeout: 5000 })

  // Close the history panel via its close button
  await page.locator('.history-panel-close').first().click().catch(() => {})
  await page.waitForTimeout(500)

  // Click Share button - dialog should appear
  await shareBtn.click()
  await page.waitForTimeout(500)

  const shareDialog = page.locator('.share-dialog')
  await expect(shareDialog).toBeVisible({ timeout: 5000 })
})

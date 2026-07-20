import { test, expect } from '@playwright/test'

test.describe('Phase 4 — Markdown Extensions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8081/login')
    await page.fill('input[type="text"]', 'admin')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button:has-text("Sign in")')
    await page.waitForURL(/\/dashboard/)
    // Click first document to edit
    const editLink = page.locator('a:has-text("Edit")').first()
    if (await editLink.isVisible()) {
      await editLink.click()
      await page.waitForSelector('.cm-content, .code-editor-pane', { timeout: 5000 })
    }
  })

  test('page loads and shows editor', async ({ page }) => {
    await expect(page.locator('body')).toBeAttached()
    const editor = page.locator('.cm-content, .code-editor-pane')
    await expect(editor).toBeAttached({ timeout: 5000 })
  })

  test('editor toolbar has Draw Diagram button', async ({ page }) => {
    await expect(page.locator('button:has-text("Draw Diagram")')).toBeAttached({ timeout: 5000 })
  })

  test('editor toolbar has Show Preview button', async ({ page }) => {
    await expect(page.locator('button:has-text("Show Preview")')).toBeAttached({ timeout: 5000 })
  })

  test('editor toolbar has Attach File button', async ({ page }) => {
    await expect(page.locator('button:has-text("Attach File")')).toBeAttached({ timeout: 5000 })
  })

  test('preview toggle shows and hides preview pane', async ({ page }) => {
    const toggleBtn = page.locator('button:has-text("Show Preview")')
    await expect(toggleBtn).toBeAttached({ timeout: 5000 })
    await toggleBtn.click()
    await expect(page.locator('.preview-pane, .markdown-preview')).toBeAttached({ timeout: 3000 })
    await expect(page.locator('button:has-text("Hide Preview")')).toBeAttached({ timeout: 3000 })
  })
})

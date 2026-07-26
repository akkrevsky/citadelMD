import { test, expect } from '@playwright/test'

test.describe('Batch A verification', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('http://localhost:8081/')
    await page.waitForLoadState('networkidle')
    await page.locator('#login').fill('admin')
    await page.locator('#password').fill('admin123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL('http://localhost:8081/')
  })

  test('Toolbar: Bold wraps selected text', async ({ page }) => {
    // Create a test document first
    await page.getByRole('button', { name: 'Create New Document' }).click()
    await page.getByPlaceholder('Document title').fill('Test Bold')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.waitForLoadState('networkidle')

    // Type content in editor
    const editor = page.locator('.cm-editor .cm-content')
    await editor.click()
    await page.keyboard.type('Hello world')

    // Select "world" by using keyboard
    await page.keyboard.press('Shift+ArrowLeft')
    await page.keyboard.press('Shift+ArrowLeft')
    await page.keyboard.press('Shift+ArrowLeft')
    await page.keyboard.press('Shift+ArrowLeft')
    await page.keyboard.press('Shift+ArrowLeft')

    // Click Bold button — now uses onMouseDown
    await page.getByRole('button', { name: 'Bold (Ctrl+B)' }).click()

    // Wait briefly for the event to process
    await page.waitForTimeout(300)

    // Read editor content — should contain **world**
    const text = await editor.textContent()
    console.log('Editor content after Bold:', text)
    expect(text).toContain('**world**')
  })

  test('Title: inline edit works', async ({ page }) => {
    await page.getByRole('button', { name: 'Create New Document' }).click()
    await page.getByPlaceholder('Document title').fill('Original Title')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.waitForLoadState('networkidle')

    // The title input should show the document title
    const titleInput = page.locator('.document-title-input')
    await expect(titleInput).toBeVisible({ timeout: 5000 })
    const titleVal = await titleInput.inputValue()
    console.log('Title input value:', titleVal)
    expect(titleVal).toBe('Original Title')

    // Edit the title
    await titleInput.click()
    await titleInput.fill('Renamed Document')
    await titleInput.blur()
    await page.waitForTimeout(500)

    // Reload and verify
    await page.reload()
    await page.waitForLoadState('networkidle')
    const newTitle = await page.locator('.document-title-input').inputValue()
    console.log('Title after reload:', newTitle)
    expect(newTitle).toBe('Renamed Document')
  })

  test('Share: dialog opens', async ({ page }) => {
    // Click on an existing document or create one
    await page.getByRole('button', { name: 'Create New Document' }).click()
    await page.getByPlaceholder('Document title').fill('Test Share')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.waitForLoadState('networkidle')

    // Click Share button
    await page.getByRole('button', { name: 'Share' }).click()
    await page.waitForTimeout(500)

    // Share dialog should be visible
    const shareDialog = page.locator('.share-dialog')
    await expect(shareDialog).toBeVisible({ timeout: 3000 })
    await expect(shareDialog.getByText('Share Document')).toBeVisible()

    // Close it
    await shareDialog.getByRole('button', { name: 'Close' }).click()
    await expect(shareDialog).not.toBeVisible()
  })

  test('Scroll-sync: editor scroll moves preview', async ({ page }) => {
    await page.getByRole('button', { name: 'Create New Document' }).click()
    await page.getByPlaceholder('Document title').fill('Test Scroll')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.waitForLoadState('networkidle')

    // Switch to split view if needed
    const splitBtn = page.locator('.view-mode-btn').filter({ hasText: 'Split' })
    const isActive = await splitBtn.evaluate(el => el.classList.contains('active'))
    if (!isActive) await splitBtn.click()

    // Type lots of content to make scrollable
    const editor = page.locator('.cm-editor .cm-content')
    await editor.click()
    const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`).join('\n')
    await page.keyboard.type(lines, { delay: 1 })
    await page.waitForTimeout(500)

    // Scroll editor to bottom
    const scroller = page.locator('.cm-editor .cm-scroller')
    await scroller.evaluate(el => { el.scrollTop = el.scrollHeight })
    await page.waitForTimeout(500)

    // Check preview scrolled
    const preview = page.locator('.preview-pane .markdown-preview')
    const previewScrollParent = preview.locator('..') // .preview-wrapper
    const previewScroll = await previewScrollParent.evaluate(el => el.scrollTop)
    console.log('Preview scrollTop after editor scroll:', previewScroll)
    expect(previewScroll).toBeGreaterThan(0)
  })
})

import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:8081'

async function login(page: Awaited<ReturnType<typeof test['info']>>['page']) {
  await page.goto(BASE + '/')
  await page.waitForLoadState('networkidle')
  await page.locator('#login').fill('admin')
  await page.locator('#password').fill('admin123')
  await Promise.all([
    page.waitForNavigation({ timeout: 10000 }),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ])
  await page.waitForLoadState('networkidle')
}

async function ensureDocument(page: Awaited<ReturnType<typeof test['info']>>['page']) {
  // Check if documents exist
  const docCount = await page.locator('.tree-item.document .document-link').count()
  if (docCount === 0) {
    await page.getByRole('button', { name: 'Create New Document' }).click()
    await page.waitForTimeout(300)
    await page.locator('input[placeholder="Document title"]').fill('E2E Test ' + Date.now())
    await Promise.all([
      page.waitForNavigation({ timeout: 10000 }),
      page.getByRole('button', { name: 'Create' }).click(),
    ])
  } else {
    await Promise.all([
      page.waitForNavigation({ timeout: 10000 }),
      page.locator('.tree-item.document .document-link').first().click(),
    ])
  }
  await page.waitForLoadState('networkidle')
  // Wait for Yjs WebSocket connection and editor init
  await page.waitForTimeout(3000)
}

test.describe('Batch A — Toolbar formatting', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await ensureDocument(page)
  })

  test('Bold wraps selected text (onMouseDown preserves focus)', async ({ page }) => {
    const editor = page.locator('.cm-editor .cm-content')
    await expect(editor).toBeVisible({ timeout: 20000 })

    // Clear existing content and type fresh
    await editor.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('Hello world')

    // Select "world" — cursor is at end after typing, go back 5 chars selecting them
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft')

    // Click Bold — onMouseDown preserves selection
    await page.locator('.toolbar-btn[title="Bold (Ctrl+B)"]').click()
    await page.waitForTimeout(500)

    const text = await editor.textContent()
    expect(text).toContain('**world**')
  })
})

test.describe('Batch A — Inline title editing', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await ensureDocument(page)
  })

  test('Title input is visible and pre-filled', async ({ page }) => {
    const titleInput = page.locator('.document-title-input')
    await expect(titleInput).toBeVisible({ timeout: 15000 })

    const value = await titleInput.inputValue()
    expect(value.length).toBeGreaterThan(0)
  })

  test('Enter blurs title input', async ({ page }) => {
    const titleInput = page.locator('.document-title-input')
    await expect(titleInput).toBeVisible({ timeout: 15000 })

    await titleInput.click()
    await page.keyboard.press('Enter')
    await expect(titleInput).not.toBeFocused()
  })
})

test.describe('Batch A — Share dialog', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await ensureDocument(page)
  })

  test('Share button opens dialog, closes on Close', async ({ page }) => {
    const shareBtn = page.getByRole('button', { name: 'Share' })
    await expect(shareBtn).toBeVisible({ timeout: 15000 })
    await shareBtn.click()

    const dialog = page.locator('.share-dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(dialog.getByText('Share Document')).toBeVisible()

    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('Share dialog closes on overlay click', async ({ page }) => {
    await page.getByRole('button', { name: 'Share' }).click()
    const dialog = page.locator('.share-dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    await page.locator('.share-overlay').click({ position: { x: 5, y: 5 } })
    await expect(dialog).not.toBeVisible()
  })
})

test.describe('Batch A — Keyboard shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await ensureDocument(page)
  })

  test('Find button opens search panel', async ({ page }) => {
    const editor = page.locator('.cm-editor .cm-content')
    await expect(editor).toBeVisible({ timeout: 20000 })
    await editor.click()

    // Click Find button in toolbar (Ctrl+H may be intercepted by Firefox)
    await page.locator('.toolbar-btn[title="Find (Ctrl+H)"]').click()
    await page.waitForTimeout(1000)

    // CodeMirror search panel should appear
    const panel = page.locator('.cm-panel')
    await expect(panel.first()).toBeVisible({ timeout: 5000 })
  })

  test('Ctrl+E cycles view modes', async ({ page }) => {
    await page.waitForTimeout(1000)

    // Default is split
    let active = page.locator('.view-mode-btn.active')
    await expect(active).toBeVisible({ timeout: 10000 })
    await expect(active).toContainText('Split')

    await page.keyboard.press('Control+e')
    await page.waitForTimeout(500)
    active = page.locator('.view-mode-btn.active')
    await expect(active).toContainText('Preview')

    await page.keyboard.press('Control+e')
    await page.waitForTimeout(500)
    active = page.locator('.view-mode-btn.active')
    await expect(active).toContainText('Code')

    await page.keyboard.press('Control+e')
    await page.waitForTimeout(500)
    active = page.locator('.view-mode-btn.active')
    await expect(active).toContainText('Split')
  })
})

test.describe('Batch A — UI elements', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await ensureDocument(page)
  })

  test('Document page has all key UI elements', async ({ page }) => {
    // Header
    await expect(page.locator('.document-title-input')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.document-path')).toBeVisible()

    // Actions
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Commit' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Discard' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Share' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible()

    // Toolbar (there are two .editor-toolbar elements — formatting + attach bar)
    await expect(page.locator('.editor-toolbar').first()).toBeVisible()

    // StatusBar
    await expect(page.locator('.status-bar')).toBeVisible()
  })

  test('Resize handle is visible in split view', async ({ page }) => {
    const splitBtn = page.locator('.view-mode-btn').filter({ hasText: 'Split' })
    await expect(splitBtn).toBeVisible({ timeout: 10000 })

    const isActive = await splitBtn.evaluate(el => el.classList.contains('active'))
    if (!isActive) await splitBtn.click()
    await page.waitForTimeout(500)

    await expect(page.locator('.resize-handle')).toBeVisible({ timeout: 5000 })
  })

  test('data-theme attribute is set', async ({ page }) => {
    const theme = await page.locator('html').getAttribute('data-theme')
    expect(['dark', 'light']).toContain(theme)
  })

  test('Toolbar buttons are visible', async ({ page }) => {
    // Check a few key toolbar buttons
    await expect(page.locator('.toolbar-btn[title="Bold (Ctrl+B)"]')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.toolbar-btn[title="Italic (Ctrl+I)"]')).toBeVisible()
    await expect(page.locator('.toolbar-btn[title="Undo"]')).toBeVisible()
    await expect(page.locator('.toolbar-btn[title="Redo"]')).toBeVisible()
    await expect(page.locator('.toolbar-btn[title="Find (Ctrl+H)"]')).toBeVisible()
  })
})

test.describe('Batch A — Scroll sync', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await ensureDocument(page)
  })

  test('Preview pane exists and renders content', async ({ page }) => {
    const editor = page.locator('.cm-editor .cm-content')
    await expect(editor).toBeVisible({ timeout: 20000 })

    await editor.click()
    await page.keyboard.type('# Hello Markdown\n\nSome paragraph text.')
    await page.waitForTimeout(1000)

    // Preview should render the heading
    const preview = page.locator('.markdown-preview')
    await expect(preview).toBeVisible({ timeout: 5000 })
    const previewHTML = await preview.innerHTML()
    expect(previewHTML).toContain('Hello Markdown')
  })

  test('Editor scroll moves preview', async ({ page }) => {
    const editor = page.locator('.cm-editor .cm-content')
    await expect(editor).toBeVisible({ timeout: 20000 })

    // Clear content and type lots of lines
    await editor.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    const lines = Array.from({ length: 80 }, (_, i) => `Line ${i + 1}`).join('\n')
    await page.keyboard.type(lines, { delay: 1 })
    await page.waitForTimeout(1000)

    const previewWrapper = page.locator('.preview-wrapper')
    const initialScroll = await previewWrapper.evaluate(el => el.scrollTop)

    // Scroll editor using mouse wheel to trigger real scroll events
    const scroller = page.locator('.cm-editor .cm-scroller')
    await scroller.hover()
    await page.mouse.wheel(0, 500)
    await page.waitForTimeout(800)

    const newScroll = await previewWrapper.evaluate(el => el.scrollTop)
    expect(newScroll).toBeGreaterThan(initialScroll)
  })
})

import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:8081'

async function login(page: Awaited<ReturnType<typeof test['info']>>['page']) {
  await page.goto(BASE + '/')
  // WS reconnects keep the network busy, so networkidle may never fire.
  await page.waitForLoadState('domcontentloaded')
  await page.locator('#login').fill('admin')
  await page.locator('#password').fill('admin123')
  // LoginPage uses client-side navigation (navigate('/')), which does not
  // emit a full page load — wait for the URL change instead.
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => !url.pathname.includes('login'), { timeout: 10000 })
  await page.waitForLoadState('domcontentloaded')
}

async function ensureDocument(page: Awaited<ReturnType<typeof test['info']>>['page']) {
  // The app auto-resumes to the last opened document after login. That doc
  // may be an Excalidraw diagram (no .cm-editor), so always verify the
  // markdown editor is present; otherwise navigate to a markdown document.
  await page.waitForTimeout(1500)
  const editorVisible = await page
    .locator('.cm-editor .cm-content')
    .isVisible()
    .catch(() => false)
  if (page.url().includes('/documents/') && editorVisible) {
    await page.waitForTimeout(2000)
    return
  }

  // Navigate to a markdown document: diagram links carry a .doc-kind-icon
  // (title "Diagram") inside them.
  const mdLink = page
    .locator('.tree-row.document')
    .filter({ hasNot: page.locator('.doc-kind-icon') })
    .first()
  await expect(mdLink).toBeVisible({ timeout: 10000 })
  await mdLink.click()
  await page.waitForURL(/\/documents\/.*\/edit/, { timeout: 10000 })
  // Wait for Yjs WebSocket connection and editor init
  await page.waitForTimeout(3000)
}

test.describe('Batch A — View mode switching preserves content', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await ensureDocument(page)
  })

  test('Content typed in split mode survives switch to source mode', async ({ page }) => {
    const editor = page.locator('.cm-editor .cm-content')
    await expect(editor).toBeVisible({ timeout: 20000 })

    // Clear and type a unique marker
    await editor.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('UNIQUE_MARKER_SPLIT_TO_SOURCE')
    await page.waitForTimeout(500)

    // Switch to source (Code) view
    await page.locator('.view-mode-btn').filter({ hasText: 'Code' }).click()
    await page.waitForTimeout(1500)

    // Editor should still contain the marker — content must NOT be lost
    const editorInSource = page.locator('.cm-editor .cm-content')
    await expect(editorInSource).toBeVisible({ timeout: 5000 })
    const textAfterSwitch = await editorInSource.textContent()
    expect(textAfterSwitch).toContain('UNIQUE_MARKER_SPLIT_TO_SOURCE')
  })

  test('Content survives a full Code -> Split -> Preview -> Split cycle', async ({ page }) => {
    const editor = page.locator('.cm-editor .cm-content')
    await expect(editor).toBeVisible({ timeout: 20000 })

    await editor.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('PRESERVE_ACROSS_CYCLE_42')
    await page.waitForTimeout(500)

    const codeBtn = page.locator('.view-mode-btn').filter({ hasText: 'Code' })
    const splitBtn = page.locator('.view-mode-btn').filter({ hasText: 'Split' })
    const previewBtn = page.locator('.view-mode-btn').filter({ hasText: 'Preview' })

    // Code -> Split -> Preview -> Split, checking content each step
    for (const [label, btn] of [
      ['Code', codeBtn],
      ['Split', splitBtn],
      ['Preview', previewBtn],
      ['Code', codeBtn],
      ['Split', splitBtn],
    ] as const) {
      await btn.click()
      await page.waitForTimeout(800)
      const text = await page.locator('.cm-editor .cm-content').textContent().catch(() => null)
      // Editor content must always contain the marker (even when hidden in preview, it stays in DOM)
      if (text !== null) {
        expect(text).toContain('PRESERVE_ACROSS_CYCLE_42')
      }
    }
  })

  test('Preview reflects edits made in source mode after switching', async ({ page }) => {
    const editor = page.locator('.cm-editor .cm-content')
    await expect(editor).toBeVisible({ timeout: 20000 })

    // Type in source mode
    await page.locator('.view-mode-btn').filter({ hasText: 'Code' }).click()
    await page.waitForTimeout(800)
    await editor.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('# Heading From Source Mode')
    await page.waitForTimeout(800)

    // Switch to preview — preview must show the heading
    await page.locator('.view-mode-btn').filter({ hasText: 'Preview' }).click()
    await page.waitForTimeout(1500)

    const preview = page.locator('.markdown-preview')
    const html = await preview.innerHTML()
    expect(html.toLowerCase()).toContain('heading from source mode')
  })
})

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

    // Click Find button via onMouseDown
    const findBtn = page.locator('.toolbar-btn[title="Find (Ctrl+H)"]')
    await findBtn.dispatchEvent('mousedown', { bubbles: true })
    await page.waitForTimeout(1000)

    // Check if search panel appeared — CodeMirror uses .cm-panel
    const panelCount = await page.locator('.cm-panel').count()
    // The search panel should be visible
    expect(panelCount).toBeGreaterThan(0)
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

  test('Scroll-sync: preview scrollHeight exceeds clientHeight', async ({ page }) => {
    const editor = page.locator('.cm-editor .cm-content')
    await expect(editor).toBeVisible({ timeout: 20000 })

    // Clear and type enough content that preview overflows
    await editor.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    // Use paragraphs to generate vertical space
    const lines = Array.from({ length: 150 }, (_, i) => `Line ${i + 1}`).join('\n\n')
    await page.keyboard.type(lines, { delay: 1 })
    await page.waitForTimeout(1500)

    // Sanity: the typed content must have reached the editor
    const editorText = await editor.textContent()
    expect(editorText).toContain('Line 150')

    // Verify preview has scrollable content
    const previewWrapper = page.locator('.preview-wrapper')
    const scrollHeight = await previewWrapper.evaluate(el => el.scrollHeight)
    const clientHeight = await previewWrapper.evaluate(el => el.clientHeight)
    expect(scrollHeight).toBeGreaterThan(clientHeight)

    // Typing scrolls the editor to follow the cursor, leaving the scroll
    // position arbitrary — reset to the top so the wheel checks below start
    // from a known state.
    const scroller = page.locator('.cm-editor .cm-scroller')
    await scroller.evaluate((el: HTMLElement) => { el.scrollTop = 0 })
    await page.waitForTimeout(500)

    // Scroll-sync check #1: wheel-scroll the editor down; the preview must
    // follow and scroll away from the top. The poll re-wheels on each
    // interval so a single swallowed wheel event cannot flake the check.
    await scroller.hover()
    await expect
      .poll(
        async () => {
          await page.mouse.wheel(0, 400)
          return previewWrapper.evaluate(el => el.scrollTop)
        },
        { timeout: 10000, intervals: [500] },
      )
      .toBeGreaterThan(0)
    const syncedScroll = await previewWrapper.evaluate(el => el.scrollTop)

    // Scroll-sync check #2: scroll the editor back to the top; the preview
    // must follow back to the top.
    await scroller.evaluate((el) => {
      el.scrollTop = 0
    })
    // Dispatch the event through user-like interaction instead:
    await scroller.hover()
    await expect
      .poll(
        async () => {
          await page.mouse.wheel(0, -800)
          return previewWrapper.evaluate(el => el.scrollTop)
        },
        { timeout: 10000, intervals: [500] },
      )
      .toBeLessThan(syncedScroll)
  })
})

test.describe('Batch A — Document switching & save', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await ensureDocument(page)
  })

  test('Preview updates when switching between documents', async ({ page }) => {
    const editor = page.locator('.cm-editor .cm-content')
    await expect(editor).toBeVisible({ timeout: 20000 })

    // Ensure split view so preview is visible
    const splitBtn = page.locator('.view-mode-btn').filter({ hasText: 'Split' })
    if (!(await splitBtn.evaluate((el) => el.classList.contains('active')))) await splitBtn.click()
    await page.waitForTimeout(500)

    // Type marker A in the current doc
    await editor.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('# MarkerDocAlpha')
    await page.waitForTimeout(1000)
    let previewHtml = await page.locator('.markdown-preview').innerHTML()
    expect(previewHtml).toContain('MarkerDocAlpha')

    // Remember doc A title to find it in the sidebar later
    const docATitle = await page.locator('.document-title-input').inputValue()

    // Create a second document via the API (the app auto-resumes on
    // dashboard visits, so the in-UI create form is no longer reachable).
    const docBTitle = 'DocB_' + Date.now()
    const folderId = await page.evaluate(async () => {
      const res = await fetch('/api/tree', { credentials: 'same-origin' })
      const body = await res.json()
      return body.tree?.[0]?.id ?? null
    })
    expect(folderId).toBeTruthy()
    await page.evaluate(
      async ([fid, title]) => {
        await fetch(`/api/folders/${fid}/documents`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        })
      },
      [folderId, docBTitle],
    )

    // Open doc B via the sidebar link. The tree was loaded at page mount
    // and does not know about the API-created document, so reload first.
    await page.reload()
    await page.waitForTimeout(2500)
    const docBLink = page.locator('.tree-row.document').filter({ hasText: docBTitle })
    await expect(docBLink).toBeVisible({ timeout: 10000 })
    await docBLink.click()
    await page.waitForURL(/\/documents\/.*\/edit/, { timeout: 10000 })
    await page.waitForTimeout(3000)

    // Ensure split view on doc B
    const splitBtnB = page.locator('.view-mode-btn').filter({ hasText: 'Split' })
    if (!(await splitBtnB.evaluate((el) => el.classList.contains('active')))) await splitBtnB.click()
    await page.waitForTimeout(500)

    // Type marker B
    const editorB = page.locator('.cm-editor .cm-content')
    await editorB.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('# MarkerDocBeta')
    await expect
      .poll(async () => page.locator('.markdown-preview').innerHTML(), { timeout: 5000 })
      .toContain('MarkerDocBeta')

    // Navigate back to doc A via the sidebar (client-side navigation)
    await page.locator('.tree-row.document').filter({ hasText: docATitle }).click()
    await page.waitForTimeout(3000)

    // Preview must now show doc A's marker, NOT doc B's stale content
    await expect
      .poll(async () => page.locator('.markdown-preview').innerHTML(), { timeout: 5000 })
      .toContain('MarkerDocAlpha')
    previewHtml = await page.locator('.markdown-preview').innerHTML()
    expect(previewHtml).not.toContain('MarkerDocBeta')
  })

  test('Ctrl+S commits the document and clears unsaved indicator', async ({ page }) => {
    const editor = page.locator('.cm-editor .cm-content')
    await expect(editor).toBeVisible({ timeout: 20000 })

    // Type content to create unsaved state
    await editor.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('Ctrl S Save Test ' + Date.now())
    await page.waitForTimeout(500)

    // Unsaved indicator must appear
    await expect(page.locator('.changes-indicator')).toBeVisible({ timeout: 3000 })

    // Press Ctrl+S
    await page.keyboard.press('Control+s')
    await page.waitForTimeout(2000)

    // Unsaved indicator must be cleared (save succeeded)
    await expect(page.locator('.changes-indicator')).not.toBeVisible({ timeout: 5000 })
  })
})


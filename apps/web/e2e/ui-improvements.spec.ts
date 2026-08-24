import { test, expect } from '@playwright/test'
import {
  login,
  createNote,
  createDiagram,
  waitForMarkdownEditor,
  waitForExcalidraw,
  drawOnExcalidraw,
  saveWithKeyboard,
  saveWithRussianShortcut,
  saveDiagramWithKeyboard,
  ensureTwoPinnedTabs,
  ensurePinnedTab,
} from './fixtures/helpers'

test.describe('UI improvements — markdown', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('Ctrl+S clears unsaved indicator (physical KeyS)', async ({ page }) => {
    const title = `E2E Save ${Date.now()}`
    await createNote(page, title)
    const editor = await waitForMarkdownEditor(page)

    await editor.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.type(`Save marker ${Date.now()}`)
    await expect(page.locator('.changes-indicator')).toBeVisible({ timeout: 5000 })

    await saveWithKeyboard(page)
    await expect(page.locator('.changes-indicator')).not.toBeVisible({ timeout: 10000 })
  })

  test('Ctrl+С (Russian layout) triggers save via KeyS code', async ({ page }) => {
    const title = `E2E RU Save ${Date.now()}`
    await createNote(page, title)
    const editor = await waitForMarkdownEditor(page)

    await editor.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.type(`Russian save ${Date.now()}`)
    await expect(page.locator('.changes-indicator')).toBeVisible({ timeout: 5000 })

    await saveWithRussianShortcut(page)
    await expect(page.locator('.changes-indicator')).not.toBeVisible({ timeout: 10000 })
  })

  test('multiple Ctrl+S saves appear in revision history', async ({ page }) => {
    const title = `E2E History ${Date.now()}`
    await createNote(page, title)
    const editor = await waitForMarkdownEditor(page)

    await editor.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('# Version 1\n')
    await saveWithKeyboard(page)

    await editor.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('# Version 2\n')
    await saveWithKeyboard(page)

    await page.locator('.document-header').getByRole('button', { name: 'История' }).click()
    await expect(page.locator('.history-panel')).toBeVisible({ timeout: 5000 })

    const commits = page.locator('.revision-entry:not(.uncommitted)')
    await expect(commits).toHaveCount(3, { timeout: 10000 })
  })

  test('history diff shows only added/removed lines', async ({ page }) => {
    const title = `E2E Diff ${Date.now()}`
    await createNote(page, title)
    const editor = await waitForMarkdownEditor(page)

    await editor.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('# Version 1\n')
    await saveWithKeyboard(page)

    await editor.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('# Version 2\nExtra line\n')
    await saveWithKeyboard(page)

    await page.locator('.document-header').getByRole('button', { name: 'История' }).click()
    await expect(page.locator('.history-panel')).toBeVisible({ timeout: 5000 })

    const latestRevision = page.locator('.revision-entry:not(.uncommitted)').first()
    await expect(latestRevision).toBeVisible({ timeout: 5000 })
    await latestRevision.locator('.revision-header').click()

    const diff = page.locator('.revision-entry.expanded .revision-diff')
    await expect(diff).toBeVisible({ timeout: 15000 })
    await expect(diff.locator('.diff-line-added, .diff-line-removed')).not.toHaveCount(0)
    await expect(diff.locator('.diff-line-context')).toHaveCount(0)
    await expect(diff.locator('div').filter({ hasText: /^@@/ })).toHaveCount(0)
  })
})

test.describe('UI improvements — diagrams', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('diagram creation keeps cyrillic title in tree', async ({ page }) => {
    const title = `Диаграмма ${Date.now()}`
    await createDiagram(page, title)

    const treeLink = page.locator('.tree-row.document').filter({ hasText: title })
    await expect(treeLink).toBeVisible({ timeout: 10000 })
    await expect(treeLink).toContainText(title)
  })

  test('diagram Ctrl+S clears unsaved and sidebar uncommitted highlight', async ({ page }) => {
    const title = `E2E Diagram Save ${Date.now()}`
    await createDiagram(page, title)
    await waitForExcalidraw(page)
    await drawOnExcalidraw(page)

    await expect(page.locator('.changes-indicator')).toBeVisible({ timeout: 10000 })

    const docRow = page.locator('.tree-node.doc-active .tree-row')
    await expect(docRow).toHaveClass(/doc-uncommitted/, { timeout: 5000 })

    await saveDiagramWithKeyboard(page)
    await page.waitForTimeout(1000)

    await expect(page.locator('.changes-indicator')).not.toBeVisible({ timeout: 10000 })
    await expect(docRow).not.toHaveClass(/doc-uncommitted/, { timeout: 10000 })
  })

  test('diagram Ctrl+С (Russian layout) saves via KeyS code', async ({ page }) => {
    const title = `E2E Diagram RU ${Date.now()}`
    await createDiagram(page, title)
    await waitForExcalidraw(page)
    await drawOnExcalidraw(page)

    await expect(page.locator('.changes-indicator')).toBeVisible({ timeout: 10000 })

    const saveResponse = page.waitForResponse(
      (r) => r.url().includes('/content') && r.request().method() === 'PUT',
      { timeout: 15000 },
    )
    await page.evaluate(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ы',
          code: 'KeyS',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      )
    })
    expect((await saveResponse).status()).toBe(200)

    await expect(page.locator('.changes-indicator')).not.toBeVisible({ timeout: 10000 })
  })
})

test.describe('UI improvements — tabs', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('tabs can be reordered by drag-and-drop', async ({ page }) => {
    const titleA = `Tab A ${Date.now()}`
    const titleB = `Tab B ${Date.now() + 1}`
    await ensureTwoPinnedTabs(page, titleA, titleB)

    const tabs = page.locator('.tab-bar .tab-item')
    const before = await tabs.evaluateAll((els) =>
      els.map((el) => el.querySelector('.tab-label')?.textContent?.replace('*', '').trim() ?? ''),
    )

    await tabs.nth(1).dragTo(tabs.nth(0))
    await page.waitForTimeout(400)

    const after = await tabs.evaluateAll((els) =>
      els.map((el) => el.querySelector('.tab-label')?.textContent?.replace('*', '').trim() ?? ''),
    )

    expect(after[0]).toBe(before[1])
    expect(after[1]).toBe(before[0])
  })

  test('tab context menu offers rename, move, delete', async ({ page }) => {
    const title = `Tab Menu ${Date.now()}`
    await createNote(page, title)
    await waitForMarkdownEditor(page)
    await ensurePinnedTab(page)

    const tab = page.locator('.tab-bar .tab-item').first()
    await tab.click({ button: 'right' })

    const menu = page.locator('.tab-context-menu')
    await expect(menu).toBeVisible({ timeout: 5000 })
    await expect(menu.getByRole('button', { name: 'Rename' })).toBeVisible()
    await expect(menu.getByRole('button', { name: 'Move to folder' })).toBeVisible()
    await expect(menu.getByRole('button', { name: 'Delete' })).toBeVisible()
    await expect(menu.getByRole('button', { name: 'Close others' })).toBeVisible()
  })

  test('tab rename updates tab label', async ({ page }) => {
    const title = `Rename Me ${Date.now()}`
    await createNote(page, title)
    await waitForMarkdownEditor(page)
    await ensurePinnedTab(page)

    const newTitle = `Renamed ${Date.now()}`
    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('prompt')
      await dialog.accept(newTitle)
    })

    const tab = page.locator('.tab-bar .tab-item').first()
    await tab.click({ button: 'right' })
    await page.locator('.tab-context-menu').getByRole('button', { name: 'Rename' }).click()

    await expect(page.locator('.tab-bar .tab-item').first()).toContainText(newTitle, {
      timeout: 10000,
    })
  })
})

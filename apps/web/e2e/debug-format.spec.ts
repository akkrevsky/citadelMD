import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:8081'

test('Debug: Bold format with screenshot', async ({ page }) => {
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

  // Open/create document
  const docCount = await page.locator('.tree-item.document .document-link').count()
  if (docCount === 0) {
    await page.getByRole('button', { name: 'Create New Document' }).click()
    await page.waitForTimeout(300)
    await page.locator('input[placeholder="Document title"]').fill('Format Test')
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
  await page.waitForTimeout(3000)

  const editor = page.locator('.cm-editor .cm-content')
  await expect(editor).toBeVisible({ timeout: 20000 })

  // Take screenshot of initial state
  await page.screenshot({ path: 'test-results/debug-format-01-initial.png' })

  // Clear and type
  await editor.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('Hello world')
  await page.waitForTimeout(300)

  await page.screenshot({ path: 'test-results/debug-format-02-typed.png' })

  // Select "world" — 5 Shift+ArrowLeft from end
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft')
  await page.waitForTimeout(300)

  await page.screenshot({ path: 'test-results/debug-format-03-selected.png' })

  // Log editor content and toolbar state
  const textBefore = await editor.textContent()
  console.log('Text before Bold:', JSON.stringify(textBefore))

  // Check toolbar button exists
  const boldBtn = page.locator('.toolbar-btn[title="Bold (Ctrl+B)"]')
  const btnCount = await boldBtn.count()
  console.log('Bold button count:', btnCount)
  const btnVisible = await boldBtn.isVisible()
  console.log('Bold button visible:', btnVisible)

  // Click the button
  await boldBtn.click()
  await page.waitForTimeout(500)

  await page.screenshot({ path: 'test-results/debug-format-04-after-bold.png' })

  const textAfter = await editor.textContent()
  console.log('Text after Bold:', JSON.stringify(textAfter))

  // Also try keyboard shortcut
  await page.keyboard.press('Control+z') // undo
  await page.waitForTimeout(300)
  const textAfterUndo = await editor.textContent()
  console.log('Text after Ctrl+Z:', JSON.stringify(textAfterUndo))

  // Try Bold via keyboard shortcut on selection
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Control+b') // CodeMirror default bold?
  await page.waitForTimeout(500)
  const textAfterCtrlB = await editor.textContent()
  console.log('Text after Ctrl+B:', JSON.stringify(textAfterCtrlB))
})

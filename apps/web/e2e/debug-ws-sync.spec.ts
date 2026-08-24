import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:8081'

test('Debug: does typed content reach the server via WS?', async ({ page }) => {
  await page.goto(BASE + '/')
  await page.waitForLoadState('domcontentloaded')
  await page.locator('#login').fill('admin')
  await page.locator('#password').fill('admin123')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 10000 })
  await page.waitForTimeout(1500)

  const editorVisible = await page.locator('.cm-editor .cm-content').isVisible().catch(() => false)
  if (!page.url().includes('/documents/') || !editorVisible) {
    const mdLink = page
      .locator('.tree-row.document')
      .filter({ hasNot: page.locator('.doc-kind-icon') })
      .first()
    await mdLink.click()
    await page.waitForURL(/\/documents\/.*\/edit/, { timeout: 10000 })
  }
  await page.waitForTimeout(4000)

  const editor = page.locator('.cm-editor .cm-content')
  await expect(editor).toBeVisible({ timeout: 20000 })

  const docId = page.url().match(/\/documents\/([^/]+)\/edit/)![1]
  const marker = 'WSSYNC_' + Date.now()
  await editor.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.type(marker)
  console.log('Typed marker:', marker)

  await page.waitForTimeout(8000)

  const exported = await page.evaluate(async (id) => {
    const res = await fetch(`/api/documents/${id}/export`, { credentials: 'same-origin' })
    return await res.text()
  }, docId)
  console.log('Exported content:', JSON.stringify(exported))
  expect(exported).toContain(marker)
})

test('Debug: check connection status in status bar', async ({ page }) => {
  await page.goto(BASE + '/')
  await page.waitForLoadState('domcontentloaded')
  await page.locator('#login').fill('admin')
  await page.locator('#password').fill('admin123')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 10000 })
  await page.waitForTimeout(1500)

  const editorVisible = await page.locator('.cm-editor .cm-content').isVisible().catch(() => false)
  if (!page.url().includes('/documents/') || !editorVisible) {
    const mdLink = page
      .locator('.tree-row.document')
      .filter({ hasNot: page.locator('.doc-kind-icon') })
      .first()
    await mdLink.click()
    await page.waitForURL(/\/documents\/.*\/edit/, { timeout: 10000 })
  }
  await page.waitForTimeout(5000)

  const statusBar = await page.locator('.status-bar').innerText().catch(() => '')
  console.log('Status bar:', JSON.stringify(statusBar))
  const dotClass = await page.locator('.status-dot').getAttribute('class').catch(() => 'none')
  console.log('Status dot class:', dotClass)
})

test('Debug: print docId and check flush', async ({ page }) => {
  await page.goto(BASE + '/')
  await page.waitForLoadState('domcontentloaded')
  await page.locator('#login').fill('admin')
  await page.locator('#password').fill('admin123')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 10000 })
  await page.waitForTimeout(1500)

  const editorVisible = await page.locator('.cm-editor .cm-content').isVisible().catch(() => false)
  if (!page.url().includes('/documents/') || !editorVisible) {
    const mdLink = page
      .locator('.tree-row.document')
      .filter({ hasNot: page.locator('.doc-kind-icon') })
      .first()
    await mdLink.click()
    await page.waitForURL(/\/documents\/.*\/edit/, { timeout: 10000 })
  }
  await page.waitForTimeout(3000)

  const docId = page.url().match(/\/documents\/([^/]+)\/edit/)![1]
  console.log('DOCID:', docId)

  const editor = page.locator('.cm-editor .cm-content')
  const marker = 'FLUSHTEST_' + Date.now()
  await editor.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.type(marker)

  // Call internal flush directly from the browser? No — flush is internal.
  // Instead wait for auto-save and export.
  await page.waitForTimeout(7000)

  const exported = await page.evaluate(async (id) => {
    const res = await fetch(`/api/documents/${id}/export`, { credentials: 'same-origin' })
    return await res.text()
  }, docId)
  console.log('MARKER:', marker)
  console.log('EXPORTED:', JSON.stringify(exported))
})

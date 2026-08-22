import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:8081'

async function login(page: import('@playwright/test').Page) {
  await page.goto(BASE + '/')
  await page.waitForLoadState('domcontentloaded')
  await page.locator('#login').fill('admin')
  await page.locator('#password').fill('admin123')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 10000 })
  await page.waitForTimeout(1500)
}

test('Desktop: no console errors across main pages', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console.error] ${msg.text().substring(0, 200)}`)
  })
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message.substring(0, 200)}`))
  page.on('requestfailed', (req) => {
    const f = req.failure()
    if (f?.errorText !== 'net::ERR_ABORTED') {
      errors.push(`[requestfailed] ${req.method()} ${req.url().substring(0, 120)} — ${f?.errorText}`)
    }
  })

  await login(page)

  // Dashboard + auto-resume to a document
  await page.waitForTimeout(3000)

  // If on a markdown doc, interact: type, toolbar, history, share
  const editorVisible = await page.locator('.cm-editor .cm-content').isVisible().catch(() => false)
  if (!page.url().includes('/documents/') || !editorVisible) {
    const mdLink = page
      .locator('.tree-item.document .document-link')
      .filter({ hasNot: page.locator('.doc-kind-icon') })
      .first()
    await mdLink.click()
    await page.waitForURL(/\/documents\/.*\/edit/, { timeout: 10000 })
  }
  await page.waitForTimeout(3000)

  // Interact with the editor
  const editor = page.locator('.cm-editor .cm-content')
  await editor.click()
  await page.keyboard.type(' console test ')
  await page.waitForTimeout(500)

  // Open history panel
  const historyBtn = page.getByRole('button', { name: /История|Скрыть историю/ }).first()
  await historyBtn.click()
  await page.waitForTimeout(800)
  await historyBtn.click()
  await page.waitForTimeout(300)

  // Open share dialog and close
  await page.getByRole('button', { name: 'Share' }).click()
  await page.waitForTimeout(500)
  await page.locator('.share-dialog').getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(300)

  // Open an Excalidraw doc
  const diagramLink = page.locator('.tree-item.document .document-link').filter({ has: page.locator('.doc-kind-icon') }).first()
  const diagramCount = await diagramLink.count()
  if (diagramCount > 0) {
    await diagramLink.click()
    await page.waitForURL(/\/documents\/.*\/edit/, { timeout: 10000 })
    await page.waitForTimeout(5000) // let excalidraw lazy-load
  }

  console.log('ERRORS FOUND:', errors.length)
  for (const e of errors) console.log('  ' + e)

  expect(errors).toEqual([])
})

test('Mobile viewport: no console errors', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console.error] ${msg.text().substring(0, 200)}`)
  })
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message.substring(0, 200)}`))

  await login(page)
  await page.waitForTimeout(3000)

  const editorVisible = await page.locator('.cm-editor .cm-content').isVisible().catch(() => false)
  if (!page.url().includes('/documents/') || !editorVisible) {
    const mdLink = page
      .locator('.tree-item.document .document-link')
      .filter({ hasNot: page.locator('.doc-kind-icon') })
      .first()
    await mdLink.click()
    await page.waitForURL(/\/documents\/.*\/edit/, { timeout: 10000 })
  }
  await page.waitForTimeout(3000)

  // Toggle the mobile toolbar drawer
  await page.locator('.toolbar-peek-btn').click()
  await page.waitForTimeout(500)
  await page.locator('.toolbar-peek-btn').click()
  await page.waitForTimeout(300)

  console.log('MOBILE ERRORS FOUND:', errors.length)
  for (const e of errors) console.log('  ' + e)

  expect(errors).toEqual([])
})

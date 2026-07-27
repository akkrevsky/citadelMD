import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:8081'

async function setup(page: import('@playwright/test').Page) {
  await page.goto(BASE + '/')
  await page.waitForLoadState('networkidle')
  await page.locator('#login').fill('admin')
  await page.locator('#password').fill('admin123')
  await Promise.all([
    page.waitForNavigation({ timeout: 10000 }),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ])
  await page.waitForLoadState('networkidle')
  const docCount = await page.locator('.tree-item.document .document-link').count()
  if (docCount === 0) {
    await page.getByRole('button', { name: 'Create New Document' }).click()
    await page.waitForTimeout(300)
    await page.locator('input[placeholder="Document title"]').fill('SaveDebug ' + Date.now())
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
}

test('Debug: Save button vs Ctrl+S', async ({ page }) => {
  const responses: string[] = []
  page.on('response', async (r) => {
    if (r.url().includes('/commit') || r.url().includes('/flush')) {
      responses.push(`${r.status()} ${r.url()}`)
    }
  })
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'log') responses.push(`CONSOLE[${m.type()}]: ${m.text()}`)
  })

  await setup(page)
  const editor = page.locator('.cm-editor .cm-content')
  await expect(editor).toBeVisible({ timeout: 20000 })

  await editor.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('DebugSaveMarker ' + Date.now())
  await page.waitForTimeout(800)

  const indicatorVisible1 = await page.locator('.changes-indicator').isVisible()
  console.log('After typing, indicator visible:', indicatorVisible1)

  // Try the Save BUTTON first
  console.log('--- Clicking Save button ---')
  const saveBtn = page.getByRole('button', { name: 'Saving...' }).or(page.getByRole('button', { name: 'Save' }))
  await saveBtn.click()
  await page.waitForTimeout(2500)
  const indicatorAfterButton = await page.locator('.changes-indicator').isVisible()
  console.log('After Save button, indicator visible:', indicatorAfterButton)
  console.log('Responses so far:', responses.slice(-10))

  // Now type again and try Ctrl+S
  await editor.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' MORE CONTENT')
  await page.waitForTimeout(800)
  const indicatorVisible2 = await page.locator('.changes-indicator').isVisible()
  console.log('After typing more, indicator visible:', indicatorVisible2)

  console.log('--- Pressing Ctrl+S ---')
  responses.length = 0
  await page.keyboard.press('Control+s')
  await page.waitForTimeout(2500)
  const indicatorAfterCtrlS = await page.locator('.changes-indicator').isVisible()
  console.log('After Ctrl+S, indicator visible:', indicatorAfterCtrlS)
  console.log('Responses during Ctrl+S:', responses)
})

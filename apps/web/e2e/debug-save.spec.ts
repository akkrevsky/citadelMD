import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:8081'

test('Debug: Ctrl+S with console/network monitoring', async ({ page }) => {
  const events: string[] = []
  page.on('console', m => {
    if (m.type() === 'log') events.push(`LOG: ${m.text().substring(0,120)}`)
    if (m.type() === 'error') events.push(`ERR: ${m.text().substring(0,120)}`)
  })
  page.on('response', async r => {
    if (r.url().includes('/commit')) events.push(`RESP: ${r.status()} ${r.url().split('/').slice(-3).join('/')}`)
  })
  page.on('requestfailed', r => {
    events.push(`FAIL: ${r.url().split('/').slice(-3).join('/')} ${r.failure()?.errorText || ''}`)
  })

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

  // Create doc
  await page.getByRole('button', { name: 'Create New Document' }).click()
  await page.waitForTimeout(300)
  await page.locator('input[placeholder="Document title"]').fill('CtrlSTest ' + Date.now())
  await Promise.all([
    page.waitForNavigation({ timeout: 10000 }),
    page.getByRole('button', { name: 'Create' }).click(),
  ])

  // Wait for document to load including WS connection
  await page.waitForTimeout(5000)

  // Show recent console messages
  const preLogs = events.filter(e => e.startsWith('LOG') || e.startsWith('ERR')).slice(-15)
  console.log('Console before typing:', preLogs)

  // Type
  const editor = page.locator('.cm-editor .cm-content')
  await expect(editor).toBeVisible({ timeout: 10000 })
  await editor.click()

  // Clear any existing content
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('Ctrl+S test content ' + Date.now())
  await page.waitForTimeout(3000)

  const typeLogs = events.filter(e => e.startsWith('LOG') || e.startsWith('ERR')).slice(-5)
  console.log('Console after typing:', typeLogs)

  // Check indicator
  const indicator = page.locator('.changes-indicator')
  const vis = await indicator.isVisible().catch(() => false)
  console.log('Unsaved indicator visible:', vis)

  events.length = 0 // clear
  // Press Ctrl+S
  await page.keyboard.press('Control+s')
  await page.waitForTimeout(5000)

  console.log('All events after Ctrl+S:', events.slice(-10))

  const visAfter = await indicator.isVisible().catch(() => false)
  console.log('Unsaved indicator after Ctrl+S:', visAfter)
})

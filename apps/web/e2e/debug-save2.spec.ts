import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:8081'

test('Debug: Ctrl+S network trace', async ({ page }) => {
  const events: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') events.push(`ERR: ${m.text().substring(0, 120)}`)
  })
  page.on('response', async (r) => {
    if (r.url().includes('/commit')) {
      const body = await r.text().catch(() => '')
      events.push(`RESP: ${r.status()} ${r.url().split('/api/')[1] || r.url()} ${body.substring(0, 120)}`)
    }
  })
  page.on('request', (r) => {
    if (r.url().includes('/commit')) events.push(`REQ: ${r.url().split('/api/')[1] || r.url()}`)
  })

  await page.goto(BASE + '/')
  await page.waitForLoadState('domcontentloaded')
  await page.locator('#login').fill('admin')
  await page.locator('#password').fill('admin123')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 10000 })
  await page.waitForTimeout(2500)

  // If not on document, open one
  if (!page.url().includes('/documents/')) {
    const link = page.locator('.tree-row.document').first()
    await expect(link).toBeVisible({ timeout: 10000 })
    await link.click()
    await page.waitForURL(/\/documents\/.*\/edit/, { timeout: 10000 })
    await page.waitForTimeout(3000)
  }

  const editor = page.locator('.cm-editor .cm-content')
  await expect(editor).toBeVisible({ timeout: 20000 })
  await editor.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('SaveDebug ' + Date.now())
  await page.waitForTimeout(800)

  const indVisible = await page.locator('.changes-indicator').isVisible().catch(() => false)
  console.log('Indicator before Ctrl+S:', indVisible)

  events.length = 0
  await page.keyboard.press('Control+s')
  await page.waitForTimeout(3000)

  console.log('Events after Ctrl+S:', events.length ? events : ['<none>'])
  const indAfter = await page.locator('.changes-indicator').isVisible().catch(() => false)
  console.log('Indicator after Ctrl+S:', indAfter)
})

import { test } from '@playwright/test'

const BASE = 'http://localhost:8081'

test('Debug: does opening an Excalidraw doc create a WS connection?', async ({ page }) => {
  const logs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().substring(0, 150)}`)
  })

  await page.goto(BASE + '/')
  await page.waitForLoadState('domcontentloaded')
  await page.locator('#login').fill('admin')
  await page.locator('#password').fill('admin123')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 10000 })
  await page.waitForTimeout(1500)

  console.log('After login URL:', page.url())

  // Navigate directly to the Excalidraw doc
  await page.goto(BASE + '/documents/0eaf86b8-3ac3-4c48-b663-01122922256b/edit')
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(5000)

  console.log('Diagram page URL:', page.url())
  const canvasCount = await page.locator('.excalidraw-canvas').count()
  const cmCount = await page.locator('.cm-editor').count()
  console.log('excalidraw canvas:', canvasCount, '| cm-editor:', cmCount)
  console.log('Console logs:')
  for (const l of logs) console.log('  ' + l)
})

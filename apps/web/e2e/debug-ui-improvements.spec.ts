import { test, expect } from '@playwright/test'
import {
  login,
  createDiagram,
  waitForExcalidraw,
  drawOnExcalidraw,
  BASE,
} from './fixtures/helpers'

test('Debug: diagram save flow on dev server', async ({ page }) => {
  const events: string[] = []
  page.on('response', (r) => {
    const url = r.url()
    if (url.includes('/content') || url.includes('/commit')) {
      events.push(`${r.status()} ${url.split('/api/').pop()}`)
    }
  })

  await login(page)
  const title = `Debug Diagram ${Date.now()}`
  await createDiagram(page, title)
  await waitForExcalidraw(page)
  await drawOnExcalidraw(page)

  console.log('BASE URL:', BASE)
  console.log('Unsaved before save:', await page.locator('.changes-indicator').isVisible())

  await page.keyboard.press('Control+s')
  await page.waitForTimeout(3000)

  console.log('API calls:', events)
  console.log('Unsaved after save:', await page.locator('.changes-indicator').isVisible())
  console.log(
    'Sidebar uncommitted:',
    (await page.locator('.tree-node.doc-active .tree-row').getAttribute('class')) ?? '',
  )

  await page.screenshot({ path: 'test-results/debug-diagram-save.png', fullPage: true })

  await expect(page.locator('.changes-indicator')).not.toBeVisible({ timeout: 10000 })
})

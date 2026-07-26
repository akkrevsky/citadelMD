import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:8081'

test('Debug: Find and scroll', async ({ page }) => {
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

  // Open document
  const docCount = await page.locator('.tree-item.document .document-link').count()
  if (docCount === 0) {
    await page.getByRole('button', { name: 'Create New Document' }).click()
    await page.waitForTimeout(300)
    await page.locator('input[placeholder="Document title"]').fill('Debug Doc')
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

  // Test Find
  await editor.click()
  await page.waitForTimeout(300)

  console.log('Testing Find button...')
  // Check CM panel initially
  let panelCount = await page.locator('.cm-panel').count()
  console.log('Initial .cm-panel count:', panelCount)

  // Click find button
  const findBtn = page.locator('.toolbar-btn[title="Find (Ctrl+H)"]')
  console.log('Find button exists:', await findBtn.count())

  await findBtn.click()
  await page.waitForTimeout(1000)

  panelCount = await page.locator('.cm-panel').count()
  console.log('.cm-panel count after click:', panelCount)

  // Check all CM-related elements
  const cmPanels = await page.locator('[class*="cm-panel"]').count()
  console.log('Elements with cm-panel in class:', cmPanels)

  // Also check via evaluate
  const cmPanelDOM = await page.evaluate(() => {
    const panels = document.querySelectorAll('.cm-panel')
    return panels.length
  })
  console.log('DOM .cm-panel count:', cmPanelDOM)

  await page.screenshot({ path: 'test-results/debug-find.png' })

  // Test scroll sync
  console.log('\nTesting scroll sync...')
  await editor.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  const lines = Array.from({ length: 80 }, (_, i) => `Line ${i + 1}`).join('\n')
  await page.keyboard.type(lines, { delay: 1 })
  await page.waitForTimeout(1000)

  const previewCount = await page.locator('.preview-wrapper').count()
  console.log('.preview-wrapper count:', previewCount)

  const previewScrollHeight = await page.locator('.preview-wrapper').evaluate(el => el.scrollHeight)
  console.log('Preview scrollHeight:', previewScrollHeight)
  const previewClientHeight = await page.locator('.preview-wrapper').evaluate(el => el.clientHeight)
  console.log('Preview clientHeight:', previewClientHeight)

  const cmScroller = page.locator('.cm-editor .cm-scroller')
  const scrollerScrollHeight = await cmScroller.evaluate(el => el.scrollHeight)
  console.log('CM scroller scrollHeight:', scrollerScrollHeight)
  const scrollerClientHeight = await cmScroller.evaluate(el => el.clientHeight)
  console.log('CM scroller clientHeight:', scrollerClientHeight)

  // Scroll via dispatchEvent
  await cmScroller.evaluate(el => {
    el.scrollTop = el.scrollHeight
    el.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await page.waitForTimeout(1000)

  const newScroll = await page.locator('.preview-wrapper').evaluate(el => el.scrollTop)
  console.log('Preview scrollTop after scroll:', newScroll)

  await page.screenshot({ path: 'test-results/debug-scroll.png' })
})

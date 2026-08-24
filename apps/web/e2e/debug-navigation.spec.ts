import { test } from '@playwright/test'

const BASE = 'http://localhost:8081'

test('Debug: document page loading', async ({ page }) => {
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

  console.log('Dashboard URL:', page.url())

  // Find document link
  const docLinks = page.locator('.tree-row.document')
  const count = await docLinks.count()
  console.log('Document links count:', count)

  if (count === 0) {
    console.log('No documents! Creating one...')
    await page.getByRole('button', { name: 'Create New Document' }).click()
    await page.waitForTimeout(500)
    await page.locator('input[placeholder="Document title"]').fill('E2E Test Doc')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.waitForTimeout(3000)
    console.log('After create, URL:', page.url())
  } else {
    const href = await docLinks.first().getAttribute('href')
    console.log('First doc href:', href)

    await Promise.all([
      page.waitForNavigation({ timeout: 10000 }).catch(() => console.log('No navigation')),
      docLinks.first().click(),
    ])
    await page.waitForTimeout(3000)
    console.log('After click, URL:', page.url())
  }

  // Take screenshot
  await page.screenshot({ path: 'test-results/debug-doc-page.png', fullPage: true })

  // Dump body content
  const bodyHTML = await page.locator('body').innerHTML()
  console.log('Body HTML (first 2000 chars):', bodyHTML.substring(0, 2000))
})

import { test } from '@playwright/test'

test('Debug login flow', async ({ page }) => {
  page.on('console', (m) => console.log(`[console.${m.type()}] ${m.text().substring(0, 150)}`))
  page.on('response', (r) => {
    if (r.url().includes('/api/')) console.log(`[api] ${r.status()} ${r.url()}`)
  })

  await page.goto('http://localhost:8081/')
  await page.waitForLoadState('domcontentloaded')
  console.log('URL after goto:', page.url())
  console.log('Login field count:', await page.locator('#login').count())

  await page.locator('#login').fill('admin')
  await page.locator('#password').fill('admin123')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await page.waitForTimeout(5000)
  console.log('URL after 5s:', page.url())

  const bodyText = await page.locator('body').innerText().catch(() => '')
  console.log('Body (first 400):', bodyText.substring(0, 400))
  await page.screenshot({ path: 'test-results/debug-login.png', fullPage: true })
})

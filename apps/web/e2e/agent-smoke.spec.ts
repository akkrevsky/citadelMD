import { test, expect } from '@playwright/test'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123'

test('home page shows the dsh agent iframe with a chat toggle', async ({ page }) => {
  await page.goto('http://localhost:8081/')
  await page.waitForLoadState('networkidle')
  await page.locator('#login').fill('admin')
  await page.locator('#password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForLoadState('networkidle')

  // Login auto-resumes the last opened document; the Dashboard link (state
  // { home: true }) is what actually opens the home screen with the agent.
  await page.getByRole('link', { name: 'Dashboard' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 })

  // Agent is the default view
  const agentPanel = page.getByTestId('agent-panel')
  await expect(agentPanel).toBeVisible({ timeout: 10000 })
  const frame = page.getByTestId('agent-frame')
  const src = await frame.getAttribute('src')
  expect(src).toContain(':8082/')
  console.log(`PROBE iframe src: ${src}`)

  // The dsh SPA should load inside the iframe (boot page or app shell)
  const frameEl = page.frameLocator('[data-testid="agent-frame"]')
  await expect(frameEl.locator('body')).not.toBeEmpty({ timeout: 30000 })
  console.log('PROBE iframe body non-empty: true')

  // Switch to chat and back
  await page.getByRole('tab', { name: 'Чат' }).click()
  await expect(page.getByTestId('chat-panel')).toBeVisible({ timeout: 5000 })
  await expect(page.getByPlaceholder('Спросите ИИ…')).toBeVisible()
  console.log('PROBE chat panel visible: true')
  await page.getByRole('tab', { name: 'Агент' }).click()
  await expect(page.getByTestId('agent-panel')).toBeVisible({ timeout: 5000 })
  console.log('PROBE agent panel visible again: true')
})

import { expect, type Page } from '@playwright/test'

export const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174'

export async function login(page: Page) {
  await page.goto(`${BASE}/`)
  await page.waitForLoadState('networkidle')
  await page.locator('#login').fill('admin')
  await page.locator('#password').fill('admin123')
  await Promise.all([
    page.waitForURL(`${BASE}/`, { timeout: 15000 }),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ])
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible({ timeout: 10000 })
}

export async function createNote(page: Page, title: string) {
  await page.getByRole('button', { name: '+ Note' }).click()
  const input = page.locator('.tree-inline-form input[placeholder="Note title"]')
  await expect(input).toBeVisible({ timeout: 5000 })
  await input.fill(title)
  await Promise.all([
    page.waitForURL(/\/documents\/[^/]+\/edit/, { timeout: 15000 }),
    page.locator('.tree-inline-form').getByRole('button', { name: 'Add' }).click(),
  ])
  await page.waitForLoadState('networkidle')
}

export async function createDiagram(page: Page, title: string) {
  await page.getByRole('button', { name: '+ Diagram' }).click()
  const input = page.locator('.tree-inline-form input[placeholder="Diagram title"]')
  await expect(input).toBeVisible({ timeout: 5000 })
  await input.fill(title)
  await Promise.all([
    page.waitForURL(/\/documents\/[^/]+\/edit/, { timeout: 15000 }),
    page.locator('.tree-inline-form').getByRole('button', { name: 'Add' }).click(),
  ])
  await page.waitForLoadState('networkidle')
}

export async function waitForMarkdownEditor(page: Page) {
  const editor = page.locator('.cm-editor .cm-content')
  await expect(editor).toBeVisible({ timeout: 25000 })
  await expect(page.locator('.status-bar-connection .value')).toHaveText('Connected', {
    timeout: 20000,
  })
  await page.waitForTimeout(500)
  return editor
}

export async function waitForExcalidraw(page: Page) {
  const canvas = page.locator('canvas.excalidraw__canvas.interactive')
  await expect(canvas).toBeVisible({ timeout: 30000 })
  return canvas
}

/** Draw a rectangle on the Excalidraw interactive canvas to trigger unsaved state. */
export async function drawOnExcalidraw(page: Page) {
  const canvas = page.locator('canvas.excalidraw__canvas.interactive')
  await expect(canvas).toBeVisible({ timeout: 30000 })
  await canvas.click({ force: true })
  await page.keyboard.press('r')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Excalidraw canvas has no bounding box')
  const x1 = box.x + box.width * 0.4
  const y1 = box.y + box.height * 0.4
  const x2 = box.x + box.width * 0.6
  const y2 = box.y + box.height * 0.55
  await page.mouse.move(x1, y1)
  await page.mouse.down()
  await page.mouse.move(x2, y2)
  await page.mouse.up()
  await page.waitForTimeout(800)
}

export async function saveWithKeyboard(page: Page) {
  const commitResponse = page.waitForResponse(
    (r) => r.url().includes('/commit') && r.request().method() === 'POST',
    { timeout: 15000 },
  )
  await page.keyboard.press('Control+s')
  const response = await commitResponse
  expect(response.status()).toBe(200)
}

export async function saveWithRussianShortcut(page: Page) {
  const commitResponse = page.waitForResponse(
    (r) => r.url().includes('/commit') && r.request().method() === 'POST',
    { timeout: 15000 },
  )
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ы',
        code: 'KeyS',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  const response = await commitResponse
  expect(response.status()).toBe(200)
}

export async function saveDiagramWithKeyboard(page: Page) {
  const saveResponse = page.waitForResponse(
    (r) => r.url().includes('/content') && r.request().method() === 'PUT',
    { timeout: 15000 },
  )
  await page.keyboard.press('Control+s')
  const response = await saveResponse
  expect(response.status()).toBe(200)
}

export async function ensureTwoPinnedTabs(page: Page, titleA: string, titleB: string) {
  await createNote(page, titleA)
  await waitForMarkdownEditor(page)
  await page.locator('.document-header').getByRole('button', { name: 'Dashboard' }).click()
  await page.waitForLoadState('networkidle')
  await createNote(page, titleB)
  await waitForMarkdownEditor(page)
  const tabs = page.locator('.tab-bar .tab-item')
  await expect(tabs).toHaveCount(2, { timeout: 5000 })
}

export async function ensurePinnedTab(page: Page) {
  const tabs = page.locator('.tab-bar .tab-item')
  if ((await tabs.count()) > 0) return
  await page.locator('.tree-item.document .document-link').first().dblclick()
  await expect(tabs.first()).toBeVisible({ timeout: 5000 })
}

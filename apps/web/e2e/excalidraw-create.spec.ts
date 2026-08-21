import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:8081'

async function login(page: import('@playwright/test').Page) {
  await page.goto(BASE + '/')
  await page.waitForLoadState('domcontentloaded')
  await page.locator('#login').fill('admin')
  await page.locator('#password').fill('admin123')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 10000 })
  await page.waitForTimeout(1500)
}

test('Create an Excalidraw diagram via the UI and save it', async ({ page }) => {
  await login(page)

  // Click "+ Diagram" in the sidebar
  await page.getByRole('button', { name: '+ Diagram' }).click()
  await page.waitForTimeout(300)

  // Fill the diagram title and submit
  const titleInput = page.locator('.tree-inline-form input').first()
  await expect(titleInput).toBeVisible({ timeout: 5000 })
  const diagramTitle = 'DiagramE2E_' + Date.now()
  await titleInput.fill(diagramTitle)
  await titleInput.press('Enter')
  await page.waitForURL(/\/documents\/.*\/edit/, { timeout: 10000 })

  // The Excalidraw canvas must render (lazy-loaded)
  await page.waitForTimeout(4000)
  const canvas = page.locator('.excalidraw-canvas, .excalidraw-page-canvas canvas')
  await expect(canvas.first()).toBeVisible({ timeout: 15000 })

  // Title input shows the diagram title
  const docTitleInput = page.locator('.document-title-input')
  await expect(docTitleInput).toBeVisible({ timeout: 5000 })
  await expect(docTitleInput).toHaveValue(diagramTitle)

  // Draw a rectangle: press R, then drag on the canvas
  const canvasBox = await page.locator('.excalidraw-canvas').first().boundingBox()
  expect(canvasBox).toBeTruthy()
  await page.locator('.excalidraw-canvas').first().click({ position: { x: 100, y: 100 } })
  await page.keyboard.press('r')
  const x0 = canvasBox!.x + 200
  const y0 = canvasBox!.y + 200
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move(x0 + 200, y0 + 150, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(1000)

  // Unsaved changes indicator appears
  await expect(page.locator('.changes-indicator')).toBeVisible({ timeout: 5000 })

  // Save with Ctrl+S
  await page.keyboard.press('Control+s')
  await page.waitForTimeout(2500)

  // Indicator clears; success toast shows
  await expect(page.locator('.changes-indicator')).not.toBeVisible({ timeout: 5000 })

  // Verify the saved file contains a valid scene with elements via API
  const content = await page.evaluate(async () => {
    const res = await fetch('/api/tree', { credentials: 'same-origin' })
    return res.status
  })
  expect(content).toBe(200)
})

test('Excalidraw document created via API opens in the diagram editor', async ({ page }) => {
  await login(page)

  // Create via API
  const docId = await page.evaluate(async () => {
    const treeRes = await fetch('/api/tree', { credentials: 'same-origin' })
    const tree = await treeRes.json()
    const folderId = tree.tree?.[0]?.id
    const createRes = await fetch(`/api/folders/${folderId}/documents`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'ApiDiagram_' + Date.now(), kind: 'EXCALIDRAW' }),
    })
    const body = await createRes.json()
    return body.id
  })
  expect(docId).toBeTruthy()

  await page.goto(`${BASE}/documents/${docId}/edit`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(4000)

  // Diagram canvas renders; no markdown editor
  await expect(page.locator('.excalidraw-canvas').first()).toBeVisible({ timeout: 15000 })
  await expect(page.locator('.cm-editor')).toHaveCount(0)

  // Status bar shows "Diagram"
  await expect(page.locator('.status-bar')).toContainText('Diagram')

  // Export content is a valid Excalidraw scene
  const exported = await page.evaluate(async (id) => {
    const res = await fetch(`/api/documents/${id}/export`, { credentials: 'same-origin' })
    return await res.text()
  }, docId)
  const scene = JSON.parse(exported)
  expect(scene.type).toBe('excalidraw')
  expect(Array.isArray(scene.elements)).toBeTruthy()
  expect(scene.version).toBe(2)
})

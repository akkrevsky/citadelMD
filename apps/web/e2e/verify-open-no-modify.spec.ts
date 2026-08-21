import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:8081'

test('Opening a document does not duplicate its content', async ({ page }) => {
  // Create a fresh doc with known content via API
  const docTitle = 'NoModify_' + Date.now()
  // The backend writes this exact content on creation: `# <title>\n\n`
  const initialBody = `# ${docTitle}\n\n`
  const result = await page.request.post(`${BASE}/api/auth/login`, {
    data: { login: 'admin', password: 'admin123' },
  })
  expect(result.ok()).toBeTruthy()
  const cookie = result.headers()['set-cookie'] ?? ''
  const tokenMatch = cookie.match(/token=([^;]+)/)

  const treeRes = await page.request.get(`${BASE}/api/tree`, {
    headers: { cookie: `token=${tokenMatch![1]}` },
  })
  const tree = await treeRes.json()
  const folderId = tree.tree?.[0]?.id

  const createRes = await page.request.post(`${BASE}/api/folders/${folderId}/documents`, {
    headers: { cookie: `token=${tokenMatch![1]}`, 'Content-Type': 'application/json' },
    data: { title: docTitle },
  })
  expect(createRes.ok()).toBeTruthy()
  const doc = await createRes.json()
  const docId = doc.id

  // Open the doc in the browser (this is what used to corrupt the file)
  await page.goto(`${BASE}/documents/${docId}/edit`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(8000) // allow WS sync + 5s auto-save to fire

  // Export the content back via API and verify no duplication
  const exportRes = await page.request.get(`${BASE}/api/documents/${docId}/export`, {
    headers: { cookie: `token=${tokenMatch![1]}` },
  })
  expect(exportRes.ok()).toBeTruthy()
  const content = await exportRes.text()
  console.log('Exported content:', JSON.stringify(content))

  // Content must contain the original text exactly once — no duplication
  expect(content).toBe(initialBody)
})

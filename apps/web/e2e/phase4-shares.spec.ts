import { test, expect } from '@playwright/test'

test.describe('Phase 4 — Share Links', () => {
  test('share API creates and resolves share link', async ({ request }) => {
    // Login
    const loginRes = await request.post('http://localhost:3000/api/auth/login', {
      data: { login: 'admin', password: 'admin123' },
    })
    expect(loginRes.ok()).toBeTruthy()
    const cookies = await loginRes.headerValues('set-cookie')
    const tokenCookie = cookies.find((c: string) => c.startsWith('token='))
    const token = tokenCookie!.split(';')[0].replace('token=', '')

    // Get a document
    const treeRes = await request.get('http://localhost:3000/api/tree', {
      headers: { Cookie: `token=${token}` },
    })
    expect(treeRes.ok()).toBeTruthy()
    const tree = await treeRes.json()
    const docId = tree.tree?.[0]?.documents?.[0]?.id
    test.skip(!docId, 'No documents available')

    // Create share
    const createRes = await request.post(`http://localhost:3000/api/documents/${docId}/shares`, {
      headers: { Cookie: `token=${token}`, 'Content-Type': 'application/json' },
      data: { permission: 'READ', ttlHours: 24 },
    })
    expect(createRes.status()).toBe(201)
    const share = (await createRes.json()).share
    expect(share.token).toBeTruthy()
    expect(share.permission).toBe('READ')

    // Resolve share
    const resolveRes = await request.get(`http://localhost:3000/api/shares/${share.token}`)
    expect(resolveRes.ok()).toBeTruthy()
    const resolved = await resolveRes.json()
    expect(resolved.share.token).toBe(share.token)
    expect(resolved.share.document.id).toBe(docId)

    // Revoke share
    const revokeRes = await request.delete(`http://localhost:3000/api/shares/${share.token}`, {
      headers: { Cookie: `token=${token}` },
    })
    expect(revokeRes.status()).toBe(204)
  })
})

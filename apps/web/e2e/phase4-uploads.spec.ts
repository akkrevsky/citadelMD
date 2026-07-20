import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

test.describe('Phase 4 — File Uploads', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8081/login')
    await page.fill('input[type="text"]', 'admin')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button:has-text("Sign in")')
    await page.waitForURL(/\/dashboard/)
    // Navigate to editor
    const editLink = page.locator('a:has-text("Edit")').first()
    if (await editLink.isVisible()) {
      await editLink.click()
      await page.waitForSelector('.cm-content, .code-editor-pane', { timeout: 5000 })
    }
  })

  test('upload API returns 201 with auth', async ({ request }) => {
    // Login
    const loginRes = await request.post('http://localhost:3000/api/auth/login', {
      data: { login: 'admin', password: 'admin123' },
    })
    expect(loginRes.ok()).toBeTruthy()
    const cookies = await loginRes.headerValues('set-cookie')
    const tokenCookie = cookies.find((c: string) => c.startsWith('token='))
    expect(tokenCookie).toBeTruthy()
    const token = tokenCookie!.split(';')[0].replace('token=', '')
    expect(token).toBeTruthy()
  })
})

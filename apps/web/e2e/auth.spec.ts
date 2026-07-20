import { test, expect } from '@playwright/test'

test.describe('citadelMD Authentication', () => {
  
  test('should show login form on homepage', async ({ page }) => {
    await page.goto('http://localhost:8081/')
    
    // Wait for the page to fully load and React to render
    await page.waitForLoadState('networkidle')
    
    await expect(page).toHaveTitle('citadelMD')
    await expect(page.getByRole('heading', { name: 'citadelMD' })).toBeVisible()
    
    // Wait for form elements to appear (using ID selectors)
    await expect(page.locator('#login')).toBeVisible({ timeout: 10000 })  
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('should login with valid credentials', async ({ page }) => {
    await page.goto('http://localhost:8081/')
    
    // Wait for the page to fully load
    await page.waitForLoadState('networkidle')
    
    // Fill login form (using ID selectors)
    await page.locator('#login').fill('admin')
    await page.locator('#password').fill('admin123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    
    // Wait for navigation and dashboard to load
    await page.waitForLoadState('networkidle')
    
    // Should redirect to dashboard
    await expect(page).toHaveURL('http://localhost:8081/') 
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Administrator (admin)')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  test('should show folder tree after login', async ({ page }) => {
    // Login first
    await page.goto('http://localhost:8081/')
    await page.waitForLoadState('networkidle')
    await page.locator('#login').fill('admin')
    await page.locator('#password').fill('admin123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForLoadState('networkidle')
    
    // Check folder tree
    await expect(page.getByText('FOLDERS')).toBeVisible()
    await expect(page.getByText('Root')).toBeVisible()
  })

  test('should not have JavaScript errors', async ({ page }) => {
    const errors: string[] = []
    
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text()
        // Ignore expected authentication-related 401 errors
        if (!text.includes('401') && !text.includes('Unauthorized')) {
          errors.push(`Console error: ${text}`)
        }
      }
    })
    
    page.on('pageerror', (error) => {
      errors.push(`Page error: ${error.message}`)
    })
    
    await page.goto('http://localhost:8081/')
    await page.waitForLoadState('networkidle')
    await page.locator('#login').fill('admin')
    await page.locator('#password').fill('admin123')  
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForLoadState('networkidle')
    
    // Wait for dashboard to load
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    
    // Check for errors (excluding expected auth-related ones)
    expect(errors, `Found JavaScript errors: ${errors.join(', ')}`).toHaveLength(0)
  })

})
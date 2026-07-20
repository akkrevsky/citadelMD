import { test, expect } from '@playwright/test'

test.describe('citadelMD Authentication', () => {
  
  test('should show login form on homepage', async ({ page }) => {
    await page.goto('/')
    
    await expect(page).toHaveTitle('citadelMD')
    await expect(page.getByRole('heading', { name: 'citadelMD' })).toBeVisible()
    await expect(page.getByPlaceholder('Login')).toBeVisible()  
    await expect(page.getByPlaceholder('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/')
    
    // Fill login form
    await page.getByPlaceholder('Login').fill('admin')
    await page.getByPlaceholder('Password').fill('admin123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    
    // Should redirect to dashboard
    await expect(page).toHaveURL('/') 
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByText('Administrator (admin)')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  test('should show folder tree after login', async ({ page }) => {
    // Login first
    await page.goto('/')
    await page.getByPlaceholder('Login').fill('admin')
    await page.getByPlaceholder('Password').fill('admin123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    
    // Check folder tree
    await expect(page.getByText('FOLDERS')).toBeVisible()
    await expect(page.getByText('Root')).toBeVisible()
  })

  test('should not have JavaScript errors', async ({ page }) => {
    const errors: string[] = []
    
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(`Console error: ${msg.text()}`)
      }
    })
    
    page.on('pageerror', (error) => {
      errors.push(`Page error: ${error.message}`)
    })
    
    await page.goto('/')
    await page.getByPlaceholder('Login').fill('admin')
    await page.getByPlaceholder('Password').fill('admin123')  
    await page.getByRole('button', { name: 'Sign in' }).click()
    
    // Wait for dashboard to load
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    
    // Check for errors
    expect(errors, `Found JavaScript errors: ${errors.join(', ')}`).toHaveLength(0)
  })

})
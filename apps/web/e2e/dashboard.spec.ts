import { test, expect } from '@playwright/test'

test.describe('citadelMD Dashboard', () => {

  // Helper function to login
  async function login(page: any) {
    await page.goto('/')
    await page.getByPlaceholder('Login').fill('admin')
    await page.getByPlaceholder('Password').fill('admin123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  }

  test('should display navigation menu', async ({ page }) => {
    await login(page)
    
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Admin Users' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Profile' })).toBeVisible()
  })

  test('should navigate to Admin Users page', async ({ page }) => {
    await login(page)
    
    await page.getByRole('link', { name: 'Admin Users' }).click()
    // Wait for navigation
    await page.waitForLoadState('networkidle')
    
    // Should show admin users page
    await expect(page.getByRole('heading', { name: 'Admin Users' }) || 
                 page.getByText('Users') ||
                 page.getByText('Admin')).toBeVisible()
  })

  test('should navigate to Profile page', async ({ page }) => {
    await login(page)
    
    await page.getByRole('link', { name: 'Profile' }).click()
    await page.waitForLoadState('networkidle')
    
    // Should show profile page  
    await expect(page.getByRole('heading', { name: 'Profile' }) ||
                 page.getByText('Profile') ||
                 page.getByText('User')).toBeVisible()
  })

  test('should be able to sign out', async ({ page }) => {
    await login(page)
    
    await page.getByRole('button', { name: 'Sign out' }).click()
    
    // Should redirect to login page
    await expect(page.getByRole('heading', { name: 'citadelMD' })).toBeVisible()
    await expect(page.getByPlaceholder('Login')).toBeVisible()
  })

  test('should interact with folder tree', async ({ page }) => {
    await login(page)
    
    // Root folder should be clickable
    const rootFolder = page.getByText('Root')
    await expect(rootFolder).toBeVisible()
    
    // Click on root folder (should expand or select)
    await rootFolder.click()
    
    // Should not crash - check for errors
    const errors: string[] = []
    page.on('pageerror', (error) => {
      errors.push(`Error after folder click: ${error.message}`)
    })
    
    // Wait a bit for any errors to surface
    await page.waitForTimeout(1000)
    
    expect(errors).toHaveLength(0)
  })

})
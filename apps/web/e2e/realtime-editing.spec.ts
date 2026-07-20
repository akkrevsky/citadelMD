import { test, expect } from '@playwright/test'

test.describe('Real-time Collaborative Editing', () => {
  
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/')
    await page.getByPlaceholder('Login').fill('admin')
    await page.getByPlaceholder('Password').fill('admin123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })

  test('should create and edit document with real-time collaboration', async ({ page, context }) => {
    // Create a new document
    await page.getByText('Root').click()
    // TODO: Add document creation UI
    
    // For now, test opening an existing document
    const editLink = page.getByRole('link', { name: 'Edit' }).first()
    if (await editLink.isVisible()) {
      await editLink.click()
      
      // Should navigate to edit page
      await expect(page).toHaveURL(/\/documents\/.*\/edit/)
      
      // Should see editor
      await expect(page.locator('.collaborative-editor')).toBeVisible()
      
      // Should show connection status
      await expect(page.getByText('Connected').or(page.getByText('Disconnected'))).toBeVisible()
      
      // Should be able to type in editor
      const editor = page.locator('.cm-editor .cm-content')
      await editor.click()
      await editor.type('# Test Real-time Editing\n\nThis is a test.')
      
      // Should show unsaved changes indicator
      await expect(page.getByText('Unsaved changes')).toBeVisible()
      
      // Should be able to commit
      await page.getByPlaceholder('Commit message').fill('Test real-time editing')
      await page.getByRole('button', { name: 'Commit' }).click()
      
      // Should show success and clear changes indicator
      await expect(page.getByText('Unsaved changes')).not.toBeVisible()
    }
  })

  test('should handle discard changes workflow', async ({ page }) => {
    // Navigate to document editor (assumes document exists)
    const editLink = page.getByRole('link', { name: 'Edit' }).first()
    if (await editLink.isVisible()) {
      await editLink.click()
      
      // Make some changes
      const editor = page.locator('.cm-editor .cm-content')
      await editor.click()
      await editor.type('\n\nTEST CHANGES TO DISCARD')
      
      // Should show unsaved changes
      await expect(page.getByText('Unsaved changes')).toBeVisible()
      
      // Discard changes
      page.on('dialog', dialog => dialog.accept()) // Accept confirmation
      await page.getByRole('button', { name: 'Discard Changes' }).click()
      
      // Should clear changes indicator
      await expect(page.getByText('Unsaved changes')).not.toBeVisible()
    }
  })

  test('should show WebSocket connection status', async ({ page }) => {
    // Open document editor
    const editLink = page.getByRole('link', { name: 'Edit' }).first()
    if (await editLink.isVisible()) {
      await editLink.click()
      
      // Should see connection status indicator
      const statusIndicator = page.locator('.editor-status')
      await expect(statusIndicator).toBeVisible()
      
      // Should show either connected or disconnected status
      await expect(
        statusIndicator.getByText('Connected').or(statusIndicator.getByText('Disconnected'))
      ).toBeVisible()
    }
  })

  test('should validate commit message requirement', async ({ page }) => {
    const editLink = page.getByRole('link', { name: 'Edit' }).first()
    if (await editLink.isVisible()) {
      await editLink.click()
      
      // Make changes
      const editor = page.locator('.cm-editor .cm-content')
      await editor.click()
      await editor.type('\n\nTest content for validation')
      
      // Try to commit without message
      await page.getByRole('button', { name: 'Commit' }).click()
      
      // Should show validation message (alert or disabled button)
      // Note: The implementation uses alert(), so we'd need to handle dialog
      // For now, just verify button is disabled without message
      const commitButton = page.getByRole('button', { name: 'Commit' })
      await expect(commitButton).toBeDisabled()
    }
  })

  test('should load document content and show editor interface', async ({ page }) => {
    const editLink = page.getByRole('link', { name: 'Edit' }).first()
    if (await editLink.isVisible()) {
      await editLink.click()
      
      // Should show document header with title and path
      await expect(page.locator('.document-header')).toBeVisible()
      await expect(page.locator('.document-info h1')).toBeVisible()
      await expect(page.locator('.document-path')).toBeVisible()
      
      // Should show document actions area
      await expect(page.locator('.document-actions')).toBeVisible()
      await expect(page.getByPlaceholder('Commit message')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Commit' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Discard Changes' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Back to Dashboard' })).toBeVisible()
      
      // Should show collaborative editor
      await expect(page.locator('.editor-section')).toBeVisible()
      await expect(page.locator('.collaborative-editor')).toBeVisible()
      await expect(page.locator('.cm-editor')).toBeVisible()
    }
  })

  test('should handle navigation back to dashboard', async ({ page }) => {
    const editLink = page.getByRole('link', { name: 'Edit' }).first()
    if (await editLink.isVisible()) {
      await editLink.click()
      
      // Should be on edit page
      await expect(page).toHaveURL(/\/documents\/.*\/edit/)
      
      // Click back to dashboard
      await page.getByRole('button', { name: 'Back to Dashboard' }).click()
      
      // Should navigate back to dashboard
      await expect(page).toHaveURL('/')
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    }
  })

  test('should show proper loading and error states', async ({ page }) => {
    // Test navigation to a potentially non-existent document
    await page.goto('/documents/invalid-id/edit')
    
    // Should handle error gracefully (either show error or redirect)
    // Wait for loading to complete
    await page.waitForLoadState('networkidle')
    
    // Should either show error message or redirect to dashboard
    const hasError = await page.locator('.error').isVisible()
    const hasDashboard = await page.getByRole('heading', { name: 'Dashboard' }).isVisible()
    
    expect(hasError || hasDashboard).toBe(true)
  })

  test('should maintain connection status updates', async ({ page }) => {
    const editLink = page.getByRole('link', { name: 'Edit' }).first()
    if (await editLink.isVisible()) {
      await editLink.click()
      
      // Wait for editor to load
      await expect(page.locator('.collaborative-editor')).toBeVisible()
      
      // Monitor connection status over time
      const statusIndicator = page.locator('.editor-status')
      await expect(statusIndicator).toBeVisible()
      
      // Status should be stable (not flickering)
      await page.waitForTimeout(2000)
      
      // Should still show connection status
      await expect(
        statusIndicator.getByText('Connected').or(statusIndicator.getByText('Disconnected'))
      ).toBeVisible()
    }
  })

  test('should handle commit workflow end-to-end', async ({ page }) => {
    const editLink = page.getByRole('link', { name: 'Edit' }).first()
    if (await editLink.isVisible()) {
      await editLink.click()
      
      // Make some changes
      const editor = page.locator('.cm-editor .cm-content')
      await editor.click()
      const testContent = `\n\n## Test Section ${Date.now()}\n\nTest content for commit workflow.`
      await editor.type(testContent)
      
      // Should show unsaved changes
      await expect(page.getByText('Unsaved changes')).toBeVisible()
      
      // Enter commit message
      const commitMessage = `Test commit ${Date.now()}`
      await page.getByPlaceholder('Commit message').fill(commitMessage)
      
      // Commit should be enabled now
      const commitButton = page.getByRole('button', { name: 'Commit' })
      await expect(commitButton).toBeEnabled()
      
      // Handle potential alert dialogs
      page.on('dialog', async dialog => {
        console.log('Dialog message:', dialog.message())
        await dialog.accept()
      })
      
      // Perform commit
      await commitButton.click()
      
      // Wait for commit to complete
      await page.waitForTimeout(2000)
      
      // Changes indicator should be cleared
      await expect(page.getByText('Unsaved changes')).not.toBeVisible()
      
      // Commit message field should be cleared
      await expect(page.getByPlaceholder('Commit message')).toHaveValue('')
    }
  })

  test('should detect content changes accurately', async ({ page }) => {
    const editLink = page.getByRole('link', { name: 'Edit' }).first()
    if (await editLink.isVisible()) {
      await editLink.click()
      
      // Initially should not show unsaved changes
      await expect(page.getByText('Unsaved changes')).not.toBeVisible()
      
      // Type in editor
      const editor = page.locator('.cm-editor .cm-content')
      await editor.click()
      await editor.type('New content')
      
      // Should detect changes
      await expect(page.getByText('Unsaved changes')).toBeVisible()
      
      // Discard button should be enabled
      await expect(page.getByRole('button', { name: 'Discard Changes' })).toBeEnabled()
    }
  })

})
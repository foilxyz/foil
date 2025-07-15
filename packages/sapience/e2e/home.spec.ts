/**
 * @note
 * Tests for the Sapience home page
 */

import { test, expect } from '@playwright/test';

// Helper function to authenticate each test
async function authenticateUser(page: any) {
  // Set authentication directly in localStorage
  await page.addInitScript(() => {
    localStorage.setItem('isAuthenticated', 'true');
  });
}

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Skip authentication for the unauthenticated test
    if (!testInfo.title.includes('unauthenticated')) {
      await authenticateUser(page);
    }
  });

  test('should load the home page successfully', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the page to load completely
    await page.waitForLoadState('domcontentloaded');
    
    // Check that the page loaded without errors
    await expect(page).toHaveTitle(/Sapience/i);
    
    // Verify that the password scrim is not present (authentication worked)
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).not.toBeVisible();
  });

  test('should display the Hero section', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the main content to load
    await page.waitForLoadState('domcontentloaded');
    
    // The Hero section should be visible
    const heroSection = page.locator('div').first();
    await expect(heroSection).toBeVisible();
    
    // Check for the Spline iframe (3D background) - there might be multiple
    const splineIframes = page.locator('iframe[src*="spline.design"]');
    await expect(splineIframes.first()).toBeVisible();
  });

  test('should display Focus Areas section', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    
    // Look for focus area elements - these should contain the areas like "Economy & Finance"
    // The focus areas are displayed in a scrolling carousel
    await page.waitForTimeout(2000); // Give time for dynamic content to load
    
    // Check if focus areas are present (they might be in a carousel or list)
    const focusAreasContainer = page.locator('text=Economy').first();
    await expect(focusAreasContainer).toBeVisible({ timeout: 10000 });
  });

  test('should have proper responsive layout on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    
    // The page should still be functional on mobile
    await expect(page.locator('body')).toBeVisible();
    
    // The iframe should still be present and responsive
    const splineIframes = page.locator('iframe[src*="spline.design"]');
    await expect(splineIframes.first()).toBeVisible();
  });

  test('should scroll through different sections', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    
    // Get initial viewport height for scrolling
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    
    // Use JavaScript scrolling which works on all browsers (mobile and desktop)
    await page.evaluate((height) => {
      window.scrollBy(0, height);
    }, viewportHeight);
    await page.waitForTimeout(500);
    
    // Scroll down more to see additional sections
    await page.evaluate((height) => {
      window.scrollBy(0, height);
    }, viewportHeight);
    await page.waitForTimeout(500);
    
    // The page should still be functional after scrolling
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle authentication correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    
    // Verify that we're authenticated by checking localStorage
    const isAuthenticated = await page.evaluate(() => {
      return localStorage.getItem('isAuthenticated') === 'true';
    });
    
    expect(isAuthenticated).toBe(true);
    
    // Verify that the password scrim is not visible
    const passwordForm = page.locator('form').filter({ has: page.locator('input[type="password"]') });
    await expect(passwordForm).not.toBeVisible();
  });

  test('should test unauthenticated state', async ({ page }) => {
    // Clear localStorage to simulate unauthenticated state
    await page.addInitScript(() => {
      localStorage.removeItem('isAuthenticated');
    });
    
    // This test intentionally skips authentication to test the password form
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    
    // Should see the password form
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();
    
    // Test authentication through the form
    await passwordInput.fill('nostradamus');
    
    // Look for submit button or press Enter
    const submitButton = page.locator('button[type="submit"]');
    if (await submitButton.isVisible()) {
      await submitButton.click();
    } else {
      await passwordInput.press('Enter');
    }
    
    // Wait a moment for authentication to complete
    await page.waitForTimeout(1000);
    
    // Password form should be gone
    await expect(passwordInput).not.toBeVisible();
    
    // Main content should be visible
    await expect(page.locator('body')).toBeVisible();
  });
});

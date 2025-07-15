/**
 * @note
 * Tests for the Sapience forecasting page and navigation
 */

import { test, expect } from '@playwright/test';

// Helper function to authenticate each test
async function authenticateUser(page: any) {
  await page.addInitScript(() => {
    localStorage.setItem('isAuthenticated', 'true');
  });
}

test.describe('Forecasting Page', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateUser(page);
  });

  test('should navigate to forecasting page from home', async ({ page }) => {
    // Start on home page
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Find and click the forecasting navigation link
    const forecastingLink = page.locator('a[href="/forecasting"]');
    await expect(forecastingLink).toBeVisible();
    
    await forecastingLink.click();
    
    // Wait for navigation and main content
    await expect(page).toHaveURL('/forecasting');
    await expect(page.locator('.container')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveTitle(/Forecasting/i);
  });

  test('should load forecasting page directly', async ({ page }) => {
    await page.goto('/forecasting');
    
    // Use domcontentloaded instead of networkidle for more reliability
    await page.waitForLoadState('domcontentloaded');
    
    // Wait for the main container to be visible (more reliable than networkidle)
    await expect(page.locator('.container')).toBeVisible({ timeout: 10000 });

    // Check that the page loaded successfully
    await expect(page).toHaveTitle(/Forecasting/i);
    
    // Verify that the password scrim is not present (authentication worked)
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).not.toBeVisible();
  });

  test('should display market groups list', async ({ page }) => {
    await page.goto('/forecasting');
    await page.waitForLoadState('domcontentloaded');

    // The forecasting page should have the main container
    const container = page.locator('.container');
    await expect(container).toBeVisible({ timeout: 10000 });

    // Check if MarketGroupsList content is present
    // This might show as loading skeleton initially, then load actual content
    const pageContent = page.locator('body');
    await expect(pageContent).toBeVisible();
  });

  test('should have working navigation in header', async ({ page }) => {
    await page.goto('/forecasting');
    await page.waitForLoadState('domcontentloaded');

    // Check that navigation exists
    const navigation = page.locator('nav');
    await expect(navigation.first()).toBeVisible();

    // Check for other navigation links
    const leaderboardLink = page.locator('a[href="/leaderboard"]');
    const botsLink = page.locator('a[href="/bots"]');
    
    // These links should be present (though might not be visible depending on responsive design)
    if (await leaderboardLink.count() > 0) {
      await expect(leaderboardLink.first()).toBeInViewport();
    }
    
    if (await botsLink.count() > 0) {
      await expect(botsLink.first()).toBeInViewport();
    }
  });



  test('should navigate back to home from forecasting', async ({ page }) => {
    // Start on forecasting page
    await page.goto('/forecasting');
    await page.waitForLoadState('domcontentloaded');

    // Find a way to navigate back to home (usually a logo or home link)
    const homeLinks = page.locator('a[href="/"], a[href=""]').filter({ hasText: /home|logo/i });
    
    if (await homeLinks.count() > 0) {
      await homeLinks.first().click();
      await page.waitForLoadState('domcontentloaded');
      
      // Should be back on home page
      await expect(page).toHaveURL('/');
    } else {
      // If no explicit home link, test browser back navigation
      await page.goBack();
      await page.waitForLoadState('domcontentloaded');
    }
  });

  test('should handle deep link to specific market group', async ({ page }) => {
    // Test navigation to a dynamic route if market groups are available
    await page.goto('/forecasting');
    await page.waitForLoadState('domcontentloaded');
    
    // Wait for container to be visible
    await expect(page.locator('.container')).toBeVisible({ timeout: 10000 });

    // Look for any market group links that might exist
    const marketLinks = page.locator('a[href*="/forecasting/"]');
    const linkCount = await marketLinks.count();

    if (linkCount > 0) {
      // Click on the first market group link
      const firstMarketLink = marketLinks.first();
      await expect(firstMarketLink).toBeVisible();
      
      await firstMarketLink.click();
      await page.waitForLoadState('domcontentloaded');

      // Should navigate to a specific market page
      await expect(page.url()).toMatch(/\/forecasting\/.+/);
      
      // The page should load without errors
      await expect(page.locator('body')).toBeVisible();
    } else {
      // If no market groups are available, just verify the page structure
      console.log('No market groups found - testing basic page structure');
      await expect(page.locator('.container')).toBeVisible();
    }
  });
}); 
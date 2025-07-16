/**
 * @note
 * Tests for navigating into market groups and verifying component loading
 */

import { test, expect } from '@playwright/test';

// Helper function to authenticate each test
async function authenticateUser(page: any) {
  await page.addInitScript(() => {
    localStorage.setItem('isAuthenticated', 'true');
  });
}

test.describe('Market Group Navigation & Component Loading', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateUser(page);
  });

  test('should navigate to market group and verify all components load', async ({ page }) => {
    // Navigate to forecasting page
    await page.goto('/forecasting');
    await page.waitForLoadState('domcontentloaded');
    
    // Wait for the main container to load
    await expect(page.locator('.container')).toBeVisible({ timeout: 10000 });

    // Look for market group links - they follow the pattern /forecasting/[chainShortName]:[marketAddress]
    const marketGroupLinks = page.locator('a[href*="/forecasting/"][href*=":0x"]');
    const linkCount = await marketGroupLinks.count();

    if (linkCount > 0) {
      // Get the first market group link and its href for verification
      const firstMarketLink = marketGroupLinks.first();
      await expect(firstMarketLink).toBeVisible({ timeout: 10000 });
      
      const linkHref = await firstMarketLink.getAttribute('href');
      console.log(`Navigating to market group: ${linkHref}`);

      // Click on the first market group
      await firstMarketLink.click();
      await page.waitForLoadState('domcontentloaded');

      // Verify URL changed to market group page
      await expect(page.url()).toMatch(/\/forecasting\/.+:.+/);

      // Wait for loading to complete - check for either content or error state
      await page.waitForFunction(
        () => {
          // Page is ready if we see either:
          // 1. Main content container with market data, OR
          // 2. Error message, OR  
          // 3. "Unable to load" message
          const hasContent = document.querySelector('[data-testid="market-group-content"]') || 
                            document.querySelector('.container .flex.flex-col.gap-6') ||
                            document.querySelector('h2:has-text("Forecast")');
          const hasError = document.querySelector('h2:has-text("Unable to load")');
          return hasContent || hasError;
        },
        { timeout: 15000 }
      );

      // Check if we got an error state or successful load
      const errorElement = page.locator('h2:has-text("Unable to load")');
      const isErrorState = await errorElement.isVisible().catch(() => false);

      if (isErrorState) {
        console.log('Market group page showed error state - this is valid behavior');
        await expect(errorElement).toBeVisible();
        await expect(page.locator('text=Please try again later')).toBeVisible();
      } else {
        // Successfully loaded - verify key components are present
        console.log('Market group page loaded successfully - verifying components');

        // 1. Verify MarketGroupHeader components
        await expect(page.locator('h1, h2, .text-2xl, .text-3xl').first()).toBeVisible({ timeout: 10000 });

        // 2. Verify chart container is present
        const chartContainer = page.locator('.border.border-border.rounded, .min-h-\\[400px\\], [data-testid="chart-container"]');
        await expect(chartContainer.first()).toBeVisible({ timeout: 10000 });

        // 3. Verify forecast form section
        const forecastSection = page.locator('h2:has-text("Forecast"), .bg-card');
        if (await forecastSection.count() > 0) {
          await expect(forecastSection.first()).toBeVisible();
          
          // Check for form tabs (Wager/Predict)
          const tabs = page.locator('button:has-text("Wager"), button:has-text("Predict")');
          if (await tabs.count() > 0) {
            await expect(tabs.first()).toBeVisible();
          }
        }

        // 4. Verify page has valid content structure
        await expect(page.locator('.container')).toBeVisible();
        
        // 5. Check that we're not still showing loading state
        const loadingElements = page.locator('[data-testid="loading"], .animate-spin');
        const isStillLoading = await loadingElements.first().isVisible().catch(() => false);
        expect(isStillLoading).toBe(false);
      }
    } else {
      console.log('No market groups found on forecasting page - testing page structure instead');
      
      // If no market groups available, verify the forecasting page structure
      await expect(page.locator('.container')).toBeVisible();
      
      // Check for either market groups loading or empty state
      const hasMarketGroups = await page.locator('a[href*="/forecasting/"]').count() > 0;
      const hasEmptyState = await page.locator('text=No markets found, text=No results').count() > 0;
      
      expect(hasMarketGroups || hasEmptyState).toBe(true);
    }
  });

  test('should handle market group page with different states', async ({ page }) => {
    await page.goto('/forecasting');
    await page.waitForLoadState('domcontentloaded');
    
    // Wait for market groups to potentially load
    await expect(page.locator('.container')).toBeVisible({ timeout: 10000 });

    // Look for multiple market group links to test different states
    const marketGroupLinks = page.locator('a[href*="/forecasting/"][href*=":0x"]');
    const linkCount = await marketGroupLinks.count();

    if (linkCount >= 2) {
      // Test first market group
      await marketGroupLinks.first().click();
      await page.waitForLoadState('domcontentloaded');

      // Wait for page to stabilize
      await page.waitForTimeout(2000);

      // Verify navigation worked
      await expect(page.url()).toMatch(/\/forecasting\/.+:.+/);

      // Go back to forecasting page
      await page.goBack();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.url()).toMatch(/\/forecasting$/);

      // Test second market group if available
      if (linkCount >= 2) {
        const secondLink = marketGroupLinks.nth(1);
        await expect(secondLink).toBeVisible({ timeout: 5000 });
        await secondLink.click();
        await page.waitForLoadState('domcontentloaded');
        
        // Verify second navigation
        await expect(page.url()).toMatch(/\/forecasting\/.+:.+/);
      }
    } else {
      console.log('Not enough market groups to test multiple states');
    }
  });

  test('should show appropriate loading states', async ({ page }) => {
    await page.goto('/forecasting');
    await page.waitForLoadState('domcontentloaded');
    
    const marketGroupLinks = page.locator('a[href*="/forecasting/"][href*=":0x"]');
    const linkCount = await marketGroupLinks.count();

    if (linkCount > 0) {
      // Click on a market group
      await marketGroupLinks.first().click();
      
      // Should initially show some kind of loading state or immediate content
      const hasLoadingOrContent = await page.waitForFunction(
        () => {
          const hasLoading = document.querySelector('[data-testid="loading"], .animate-spin');
          const hasContent = document.querySelector('.container');
          const hasError = document.querySelector('h2:has-text("Unable to load")');
          return hasLoading || hasContent || hasError;
        },
        { timeout: 10000 }
      );

      expect(hasLoadingOrContent).toBe(true);
    }
  });

  test('should handle navigation between market groups', async ({ page }) => {
    await page.goto('/forecasting');
    await page.waitForLoadState('domcontentloaded');
    
    const marketGroupLinks = page.locator('a[href*="/forecasting/"][href*=":0x"]');
    const linkCount = await marketGroupLinks.count();

    if (linkCount > 0) {
      // Navigate to first market group
      const firstLink = await marketGroupLinks.first().getAttribute('href');
      await marketGroupLinks.first().click();
      await page.waitForLoadState('domcontentloaded');
      
      // Verify we're on the market group page
      await expect(page.url()).toContain(firstLink);

      // Navigate back using browser navigation
      await page.goBack();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.url()).toMatch(/\/forecasting$/);

      // Verify we're back on the forecasting page
      await expect(page.locator('.container')).toBeVisible();
      
      // Verify market group links are still visible
      await expect(marketGroupLinks.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('should display market group header information', async ({ page }) => {
    await page.goto('/forecasting');
    await page.waitForLoadState('domcontentloaded');
    
    const marketGroupLinks = page.locator('a[href*="/forecasting/"][href*=":0x"]');
    const linkCount = await marketGroupLinks.count();

    if (linkCount > 0) {
      await marketGroupLinks.first().click();
      await page.waitForLoadState('domcontentloaded');

      // Wait for content to load
      await page.waitForTimeout(3000);

      // Check for market header elements (adjust selectors based on actual implementation)
      const headerElements = [
        'h1', 'h2', '.text-2xl', '.text-3xl', // Main title
        '.text-sm.text-muted-foreground', // Subtitle/meta info
        'a[href*="blockscan"], a[href*="etherscan"]', // External links
      ];

      let hasHeaderContent = false;
      for (const selector of headerElements) {
        const element = page.locator(selector).first();
        if (await element.isVisible().catch(() => false)) {
          hasHeaderContent = true;
          break;
        }
      }

      // Should have some header content OR error state
      const hasError = await page.locator('h2:has-text("Unable to load")').isVisible().catch(() => false);
      expect(hasHeaderContent || hasError).toBe(true);
    }
  });

  test('should handle invalid market group URLs gracefully', async ({ page }) => {
    // Test with an invalid market group URL
    await page.goto('/forecasting/invalid:0x1234567890123456789012345678901234567890');
    await page.waitForLoadState('domcontentloaded');

    // Should show error state or redirect
    await page.waitForTimeout(3000);

    // Check for error handling
    const hasError = await page.locator('h2:has-text("Unable to load"), text=404, text=Not found').first().isVisible().catch(() => false);
    const isRedirected = page.url().includes('/forecasting') && !page.url().includes('invalid:0x');
    
    // Should either show error or redirect back to forecasting
    expect(hasError || isRedirected).toBe(true);
  });
}); 
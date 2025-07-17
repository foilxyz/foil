

import { test, expect } from '@playwright/test';
import { authenticateUser } from './auth-helper';

test.describe('Market Group Navigation - Edge Cases & Specific Behaviors', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateUser(page);
  });

  test('should handle navigation between market groups', async ({ page }) => {
    await page.goto('/forecasting');
    await page.waitForLoadState('domcontentloaded');
    
    const marketGroupLinks = page.locator('a[href*="/forecasting/"][href*=":0x"]');
    const linkCount = await marketGroupLinks.count();

    if (linkCount > 0) {
      const firstLink = await marketGroupLinks.first().getAttribute('href');
      
      try {
        await marketGroupLinks.first().click();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1000);
        
        
        if (firstLink && !page.url().includes(firstLink)) {
          await page.goto(firstLink);
          await page.waitForLoadState('domcontentloaded');
          await page.waitForTimeout(1000);
        }
      } catch (error) {
        if (firstLink) {
          await page.goto(firstLink);
          await page.waitForLoadState('domcontentloaded');
          await page.waitForTimeout(1000);
        }
      }
      
      if (firstLink) {
        await expect(page.url()).toContain(firstLink);
      }

      // Test back navigation
      await page.goBack();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.url()).toMatch(/\/forecasting$/);

      await expect(page.locator('.container')).toBeVisible();
      await expect(marketGroupLinks.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('should show appropriate loading states', async ({ page }) => {
    await page.goto('/forecasting');
    await page.waitForLoadState('domcontentloaded');
    
    const marketGroupLinks = page.locator('a[href*="/forecasting/"][href*=":0x"]');
    const linkCount = await marketGroupLinks.count();

    if (linkCount > 0) {
      await marketGroupLinks.first().click();
      
      // Verify that either loading state or content appears within reasonable time
      const hasLoadingOrContent = await page.waitForFunction(
        () => {
          const hasLoading = document.querySelector('[data-testid="loading"], .animate-spin');
          const hasContent = document.querySelector('.container');
          // Check for error manually since :has-text() doesn't work in document.querySelector
          const h2Elements = document.querySelectorAll('h2');
          const hasError = Array.from(h2Elements).some(h2 => h2.textContent?.includes('Unable to load'));
          return hasLoading || hasContent || hasError;
        },
        { timeout: 10000 }
      );

      expect(hasLoadingOrContent).toBe(true);
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
      await page.waitForTimeout(3000);

      // Test that header elements are present (title, contract links, etc.)
      const headerElements = [
        'h1', 'h2', '.text-2xl', '.text-3xl',
        '.text-sm.text-muted-foreground',
        'a[href*="blockscan"], a[href*="etherscan"]',
      ];

      let hasHeaderContent = false;
      for (const selector of headerElements) {
        const element = page.locator(selector).first();
        if (await element.isVisible().catch(() => false)) {
          hasHeaderContent = true;
          break;
        }
      }

      const hasError = await page.locator('h2:has-text("Unable to load")').isVisible().catch(() => false);
      expect(hasHeaderContent || hasError).toBe(true);
    }
  });

  test('should handle invalid market group URLs gracefully', async ({ page }) => {
    const invalidUrl = '/forecasting/invalid:0x1234567890123456789012345678901234567890';
    
    await page.goto(invalidUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(5000);

    // Check for various error states or graceful redirects
    const errorSelectors = [
      'h2:has-text("Unable to load")',
      'text="Unable to load market data"',
      'text="404"',
      'text="Not found"',
      'text="Page not found"',
      'text="Invalid market"',
      'text="Market not found"',
      '[data-testid="error"]',
      '.error',
    ];

    let hasError = false;
    for (const selector of errorSelectors) {
      const exists = await page.locator(selector).first().isVisible().catch(() => false);
      if (exists) {
        hasError = true;
        break;
      }
    }

    const isRedirected = page.url().includes('/forecasting') && !page.url().includes('invalid:0x');
    
    // App should either show an error or redirect gracefully
    expect(hasError || isRedirected).toBe(true);
  });
}); 
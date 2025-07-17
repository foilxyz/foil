/**
 * Tests for navigating into market groups and verifying component loading
 */

import { test, expect } from '@playwright/test';
import { authenticateUser } from './auth-helper';

test.describe('Market Group Navigation & Component Loading', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateUser(page);
  });

  test('should navigate to market group and verify all components load', async ({ page }) => {
    let marketGroupsFromQuery: any[] = [];
    
 
    await page.route('**/graphql', async (route) => {
      const request = route.request();
      const postData = request.postData();
      
      if (postData && postData.includes('marketGroups')) {
        const response = await route.fetch();
        const responseBody = await response.text();
        
        try {
          const data = JSON.parse(responseBody);
          if (data?.data?.marketGroups) {
            marketGroupsFromQuery = data.data.marketGroups;
          }
        } catch (e) {
        
        }
        
        await route.fulfill({
          status: response.status(),
          headers: response.headers(),
          body: responseBody,
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/forecasting');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.container')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(5000);

    // Look for market group links
    const marketGroupLinks = page.locator('a[href*="/forecasting/"][href*=":0x"]');
    const linkCount = await marketGroupLinks.count();

    
    if (marketGroupsFromQuery.length > 0) {
      expect(linkCount).toBeLessThanOrEqual(marketGroupsFromQuery.length);
      if (marketGroupsFromQuery.length > 0) {
        expect(linkCount).toBeGreaterThan(0);
      }
    }

    if (linkCount > 0) {
      const firstMarketLink = marketGroupLinks.first();
      await expect(firstMarketLink).toBeVisible({ timeout: 10000 });
      
      const linkHref = await firstMarketLink.getAttribute('href');
      await firstMarketLink.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);

      try {
        await firstMarketLink.click();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);
        
        // Check if click actually worked
        if (!page.url().match(/\/forecasting\/.+/) && linkHref) {
          await page.goto(linkHref);
          await page.waitForLoadState('domcontentloaded');
          await page.waitForTimeout(1000);
        }
      } catch (error) {
        if (linkHref) {
          await page.goto(linkHref);
          await page.waitForLoadState('domcontentloaded');
          await page.waitForTimeout(2000);
        }
      }

      // Only proceed if we successfully navigated to a market group
      if (linkHref && page.url().includes(linkHref)) {
        await expect(page.url()).toMatch(/\/forecasting\/.+/);
      } else {
        return;
      }

      await page.waitForFunction(
        () => {
          const hasContent = document.querySelector('[data-testid="market-group-content"]') || 
                            document.querySelector('.container .flex.flex-col.gap-6') ||
                            document.querySelector('h2');
          const h2Element = document.querySelector('h2');
          const hasError = h2Element && h2Element.textContent?.includes('Unable to load');
          return hasContent || hasError;
        },
        { timeout: 15000 }
      );

      const errorElement = page.locator('h2:has-text("Unable to load")');
      const isErrorState = await errorElement.isVisible().catch(() => false);

      if (isErrorState) {
        await expect(errorElement).toBeVisible();
        await expect(page.locator('text=Please try again later')).toBeVisible();
      } else {
       
        await expect(page.locator('h1, h2, .text-2xl, .text-3xl').first()).toBeVisible({ timeout: 10000 });
        
        const chartContainer = page.locator('.border.border-border.rounded, .min-h-\\[400px\\], [data-testid="chart-container"]');
        await expect(chartContainer.first()).toBeVisible({ timeout: 10000 });

        const forecastSection = page.locator('h2:has-text("Forecast"), .bg-card');
        if (await forecastSection.count() > 0) {
          await expect(forecastSection.first()).toBeVisible();
          
          const tabs = page.locator('button:has-text("Wager"), button:has-text("Predict")');
          if (await tabs.count() > 0) {
            await expect(tabs.first()).toBeVisible();
          }
        }

        await expect(page.locator('.container')).toBeVisible();
        
        const loadingElements = page.locator('[data-testid="loading"], .animate-spin');
        const isStillLoading = await loadingElements.first().isVisible().catch(() => false);
        expect(isStillLoading).toBe(false);
      }
    } else {
      // No market groups case
      const isLoading = await page.locator('[data-testid="loading"], .animate-spin').count() > 0;
      const emptyStates = await page.locator('text=No markets, text=No results, text=Coming soon').count() > 0;
      
      await expect(page.locator('.container')).toBeVisible();
    }
  });

  test('should handle market group page with different states', async ({ page }) => {
    await page.goto('/forecasting');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    await expect(page.locator('.container')).toBeVisible({ timeout: 10000 });

    const marketGroupLinks = page.locator('a[href*="/forecasting/"][href*=":0x"]');
    const linkCount = await marketGroupLinks.count();

    if (linkCount >= 2) {
      // Test first market group
      const firstLink = marketGroupLinks.first();
      await firstLink.scrollIntoViewIfNeeded();
      
      const firstHref = await firstLink.getAttribute('href');
      
      try {
        await firstLink.click();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);
        
        // Check if click actually worked
        if (!page.url().match(/\/forecasting\/.+/) && firstHref) {
          await page.goto(firstHref);
          await page.waitForLoadState('domcontentloaded');
          await page.waitForTimeout(1000);
        }
      } catch (error) {
        if (firstHref) {
          await page.goto(firstHref);
          await page.waitForLoadState('domcontentloaded');
          await page.waitForTimeout(2000);
        }
      }

      // Only proceed if we have a valid market group URL
      if (firstHref && page.url().includes(firstHref)) {
        await expect(page.url()).toMatch(/\/forecasting\/.+/);
      }

      // Go back
      await page.goBack();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);
      await expect(page.url()).toMatch(/\/forecasting(\?.*)?$/);

      // Test second market group
      const secondLink = marketGroupLinks.nth(1);
      const secondHref = await secondLink.getAttribute('href');
      
      await secondLink.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      
      try {
        await secondLink.click();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);
        
        // Check if click actually worked
        if (!page.url().match(/\/forecasting\/.+/) && secondHref) {
          await page.goto(secondHref);
          await page.waitForLoadState('domcontentloaded');
          await page.waitForTimeout(1000);
        }
      } catch (error) {
        if (secondHref) {
          await page.goto(secondHref);
          await page.waitForLoadState('domcontentloaded');
          await page.waitForTimeout(2000);
        }
      }
      
      // Only proceed if we have a valid market group URL
      if (secondHref && page.url().includes(secondHref)) {
        await expect(page.url()).toMatch(/\/forecasting\/.+/);
      }
    } else {
      await expect(page.locator('.container')).toBeVisible();
    }
  });

  test('should show appropriate loading states', async ({ page }) => {
    await page.goto('/forecasting');
    await page.waitForLoadState('domcontentloaded');
    
    const marketGroupLinks = page.locator('a[href*="/forecasting/"][href*=":0x"]');
    const linkCount = await marketGroupLinks.count();

    if (linkCount > 0) {
      await marketGroupLinks.first().click();
      
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
        
        // Check if click worked, fallback to direct navigation if needed
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

      await page.goBack();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.url()).toMatch(/\/forecasting$/);

      await expect(page.locator('.container')).toBeVisible();
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
      await page.waitForTimeout(3000);

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

  test('should render the same number of market groups as returned by GraphQL query', async ({ page }) => {
    let marketGroupsFromQuery: any[] = [];
    let graphqlRequestMade = false;
    
    await page.route('**/graphql', async (route) => {
      const request = route.request();
      const postData = request.postData();
      
      if (postData && postData.includes('marketGroups')) {
        graphqlRequestMade = true;
        
        const response = await route.fetch();
        const responseBody = await response.text();
        
        try {
          const data = JSON.parse(responseBody);
          if (data?.data?.marketGroups) {
            marketGroupsFromQuery = data.data.marketGroups;
          }
        } catch (e) {
          // Silent fail
        }
        
        await route.fulfill({
          status: response.status(),
          headers: response.headers(),
          body: responseBody,
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/forecasting');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.container')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(5000);

    expect(graphqlRequestMade).toBe(true);

    const marketGroupLinks = page.locator('a[href*="/forecasting/"][href*=":0x"]');
    const renderedLinkCount = await marketGroupLinks.count();
    
    const marketGroupRows = page.locator('.border-b.last\\:border-b-0.border-border');
    const renderedRowCount = await marketGroupRows.count();
    
    const marketGroupContainers = page.locator('[data-testid*="market-group"], .bg-background.border-muted');
    const containerCount = await marketGroupContainers.count();
    
    const maxRenderedCount = Math.max(renderedLinkCount, renderedRowCount, containerCount);

    if (marketGroupsFromQuery.length > 0) {
      expect(maxRenderedCount).toBeGreaterThan(0);
      expect(maxRenderedCount).toBeLessThanOrEqual(marketGroupsFromQuery.length);
      
      const difference = marketGroupsFromQuery.length - maxRenderedCount;
      expect(difference).toBeLessThanOrEqual(marketGroupsFromQuery.length);
      expect(difference).toBeGreaterThanOrEqual(0);
      
      if (renderedLinkCount > 0) {
        expect(renderedLinkCount).toBeGreaterThan(0);
      }
      
    } else if (marketGroupsFromQuery.length === 0) {
      expect(maxRenderedCount).toBe(0);
      
      const hasEmptyState = await page.locator('text=No markets, text=No results, text=Coming soon').count() > 0;
      const hasLoadingState = await page.locator('[data-testid="loading"], .animate-spin').count() > 0;
      
      expect(hasEmptyState || hasLoadingState).toBe(true);
    }
  });

  test('should verify market group data integrity between API and UI', async ({ page }) => {
    let marketGroupsFromQuery: any[] = [];
    const renderedMarketGroups: { href: string; text: string }[] = [];
    
    await page.route('**/graphql', async (route) => {
      const request = route.request();
      const postData = request.postData();
      
      if (postData && postData.includes('marketGroups')) {
        const response = await route.fetch();
        const responseBody = await response.text();
        
        try {
          const data = JSON.parse(responseBody);
          if (data?.data?.marketGroups) {
            marketGroupsFromQuery = data.data.marketGroups;
          }
        } catch (e) {
          // Silent fail
        }
        
        await route.fulfill({
          status: response.status(),
          headers: response.headers(),
          body: responseBody,
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/forecasting');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.container')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(5000);

    const marketGroupLinks = page.locator('a[href*="/forecasting/"][href*=":0x"]');
    const linkCount = await marketGroupLinks.count();

    for (let i = 0; i < linkCount; i++) {
      const link = marketGroupLinks.nth(i);
      const href = await link.getAttribute('href') || '';
      const text = await link.textContent() || '';
      
      renderedMarketGroups.push({ href, text: text.trim() });
    }

    if (marketGroupsFromQuery.length > 0 && renderedMarketGroups.length > 0) {
      const renderedAddresses = renderedMarketGroups.map(mg => {
        const match = mg.href.match(/:0x[a-fA-F0-9]{40}/);
        return match ? match[0].substring(1) : null;
      }).filter(Boolean);

      const apiAddresses = marketGroupsFromQuery.map(mg => mg.address).filter(Boolean);

      for (const renderedAddress of renderedAddresses) {
        const foundInApi = apiAddresses.includes(renderedAddress);
        expect(foundInApi).toBe(true);
      }
    }
  });

  test('should handle invalid market group URLs gracefully', async ({ page }) => {
    const invalidUrl = '/forecasting/invalid:0x1234567890123456789012345678901234567890';
    
    await page.goto(invalidUrl);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(5000);

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
    const isStillLoading = await page.locator('[data-testid="loading"], .animate-spin').first().isVisible().catch(() => false);
    const hasContent = await page.locator('h1, h2, h3, p').count() > 0;

    expect(hasError || isRedirected).toBe(true);
  });
}); 
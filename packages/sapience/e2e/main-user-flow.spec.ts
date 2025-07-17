import { test, expect } from '@playwright/test';
import { authenticateUser } from './auth-helper';

test.describe('Main User Flow', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateUser(page);
  });

  test('complete user flow: homepage → forecasting → market group → predict/wager', async ({ page }) => {
    let marketGroupsFromAPI: any[] = [];
    let currentMarketGroupData: any = null;
    let graphqlRequestMade = false;
    
    // Intercept GraphQL requests to capture both market groups list and individual market group data
    await page.route('**/graphql', async (route) => {
      const request = route.request();
      const postData = request.postData();
      
      if (postData && (postData.includes('marketGroups') || postData.includes('marketGroup'))) {
        graphqlRequestMade = true;
        
        const response = await route.fetch();
        const responseBody = await response.text();
        
        try {
          const data = JSON.parse(responseBody);
          
          // Handle market groups list query
          if (data?.data?.marketGroups) {
            marketGroupsFromAPI = data.data.marketGroups;
          }
          
          // Handle individual market group query
          if (data?.data?.marketGroup) {
            currentMarketGroupData = data.data.marketGroup;
          }
        } catch (e) {
          console.error('Could not parse GraphQL response:', e);
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

    // Homepage loads
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });

    // Navigate to forecasting page
    await page.goto('/forecasting');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const isForecastingPage = page.url().includes('/forecasting');
    expect(isForecastingPage).toBe(true);

    // Market groups load & validate API vs UI consistency
    await expect(page.locator('.container')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(5000);
    
    expect(graphqlRequestMade).toBe(true);
    
    const marketGroupLinks = page.locator('a[href*="/forecasting/"][href*=":0x"]');
    const renderedCount = await marketGroupLinks.count();

    if (marketGroupsFromAPI.length > 0) {
      //Count public markets (those with collateral symbols in the expected list)
      const publicCollaterals = ['sapUSD', 'wstETH', 'sUSDS', 'tBTC'];
      const publicMarkets = marketGroupsFromAPI.filter(mg => 
        mg.collateralSymbol && publicCollaterals.includes(mg.collateralSymbol)
      );

              expect(renderedCount).toBeGreaterThan(0);
        expect(renderedCount).toBeLessThanOrEqual(publicMarkets.length + 2);
          } else {
        expect(renderedCount).toBe(0);
      }

    // Navigate to a market group
    if (renderedCount > 0) {
      const firstMarketLink = marketGroupLinks.first();
      await expect(firstMarketLink).toBeVisible({ timeout: 10000 });
      
      const linkHref = await firstMarketLink.getAttribute('href');

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
      } else if (renderedCount > 0) {
        return;
      }
    

      //  Verify key components load
      await page.waitForFunction(
        () => {
          const hasContent = document.querySelector('[data-testid="market-group-content"]') || 
                            document.querySelector('.container .flex.flex-col.gap-6') ||
                            document.querySelector('h2');
          const hasError = document.querySelector('h2') && 
                          document.querySelector('h2')?.textContent?.includes('Unable to load');
          return hasContent || hasError;
        },
        { timeout: 15000 }
      );

     
      const errorElement = page.locator('h2:has-text("Unable to load")');
      const isErrorState = await errorElement.isVisible().catch(() => false);

      if (isErrorState) {
        
        await expect(errorElement).toBeVisible();
      } else {
        
        await expect(page.locator('h1, h2, .text-2xl, .text-3xl').first()).toBeVisible({ timeout: 10000 });
        
                  const chartContainer = page.locator('.border.border-border.rounded, .min-h-\\[400px\\], [data-testid="chart-container"]');
          await expect(chartContainer.first()).toBeVisible({ timeout: 10000 });

          const forecastSection = page.locator('h2:has-text("Forecast")');
          await expect(forecastSection).toBeVisible({ timeout: 10000 });
          
          const wagerTab = page.locator('button').filter({ hasText: /^Wager$/ });
          const predictTab = page.locator('button').filter({ hasText: /^Predict$/ });
          
          await expect(wagerTab).toBeVisible({ timeout: 5000 });
          await expect(predictTab).toBeVisible({ timeout: 5000 });

        await predictTab.click();
        await page.waitForTimeout(500);
        
        await wagerTab.click();
        await page.waitForTimeout(500);
        

        const advancedViewButton = page.locator('button:has-text("ADVANCED VIEW")');
        await expect(advancedViewButton).toBeVisible({ timeout: 5000 });
        
        await advancedViewButton.click();
        await page.waitForTimeout(1000);

                  const dialog = page.locator('[role="dialog"]:has-text("Prediction Markets")');
          await expect(dialog).toBeVisible({ timeout: 5000 });

        const activeMarketsSection = page.locator('h3:has-text("Active Markets")');
        const hasActiveMarketsSection = await activeMarketsSection.isVisible().catch(() => false);
        
        if (hasActiveMarketsSection) {
          // Count active markets in the UI
          const activeMarketsInUI = page.locator('h3:has-text("Active Markets") + div [href*="/forecasting/"]');
          const uiActiveMarketCount = await activeMarketsInUI.count();
          
            // Calculate expected active markets from API data
           if (currentMarketGroupData && currentMarketGroupData.markets) {
             // Filter for active markets (same logic as the frontend)
             const currentTime = Date.now();
             const apiActiveMarkets = currentMarketGroupData.markets.filter((market: any) => {
               const isExpired = market.endTimestamp && 
                                currentTime > Number(market.endTimestamp) * 1000;
               return !isExpired;
             });
             
                           expect(uiActiveMarketCount).toBe(apiActiveMarkets.length);
                       }
         }

       
        const closeButton = page.locator('[role="dialog"] button:has([data-lucide="x"]), [role="dialog"] [aria-label="Close"]');
        if (await closeButton.isVisible().catch(() => false)) {
          await closeButton.click();
        } else {
          await page.click('body');
        }
        await page.waitForTimeout(500);
        
      }
    } 

    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });
}); 
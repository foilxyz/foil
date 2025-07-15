import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  // Navigate to the homepage with the password query parameter
  await page.goto('/?password=nostradamus');
  
  // Wait for authentication to complete
  await page.waitForLoadState('networkidle');
  
  // Verify that we're authenticated by checking that the password scrim is gone
  // and the main content is visible
  await expect(page.locator('body')).toBeVisible();
  
  // Alternatively, we can check that localStorage has the auth flag
  const isAuthenticated = await page.evaluate(() => {
    return localStorage.getItem('isAuthenticated') === 'true';
  });
  
  expect(isAuthenticated).toBe(true);
  
  // Save signed-in state to 'authFile'
  await page.context().storageState({ path: authFile });
}); 
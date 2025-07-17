
// Simple, reliable authentication function
export async function authenticateUser(page: any) {
  // Set authentication in localStorage before any page load
  await page.addInitScript(() => {
    localStorage.setItem('isAuthenticated', 'true');
  });
}

// Clear authentication for tests that need unauthenticated state
export async function clearAuthentication(page: any) {
  await page.addInitScript(() => {
    localStorage.removeItem('isAuthenticated');
  });
} 
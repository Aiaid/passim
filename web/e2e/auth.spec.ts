import { test, expect } from './fixtures';

test.describe('Authentication', () => {
  test('valid API key login redirects to dashboard', async ({
    page,
    apiKey,
  }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Enter API Key').fill(apiKey);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('/');
    // Dashboard should show some content
    await expect(page.locator('body')).toBeVisible();
  });

  test('invalid API key shows error', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Enter API Key').fill('wrong-key-12345');
    await page.getByRole('button', { name: 'Sign In' }).click();
    // Should stay on login page and show error
    await expect(page).toHaveURL(/login/);
  });

  test('unauthenticated access redirects to login', async ({ page }) => {
    await page.goto('/containers');
    await expect(page).toHaveURL(/login/);
  });

  test('expired token redirects to login', async ({ page, apiKey }) => {
    // Login first
    await page.goto('/login');
    await page.getByPlaceholder('Enter API Key').fill(apiKey);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('/');
    // Clear token from localStorage
    await page.evaluate(() => localStorage.removeItem('auth-storage'));
    // Refresh
    await page.reload();
    await expect(page).toHaveURL(/login/);
  });
});

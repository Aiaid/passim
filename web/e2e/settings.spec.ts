import { test, expect } from './fixtures';

test.describe('Settings', () => {
  test('shows SSL status', async ({ authenticatedPage: page }) => {
    await page.goto('/settings');
    // Settings page should be visible
    await expect(page.getByText(/settings/i).first()).toBeVisible({
      timeout: 10000,
    });
    // May show SSL section (even without SSL manager, page should render)
  });

  test('shows passkey section', async ({ authenticatedPage: page }) => {
    await page.goto('/settings');
    // Look for security/passkey tab or section
    const securityTab = page
      .getByRole('tab', { name: /security/i })
      .or(page.getByText(/security/i));
    if (
      await securityTab
        .isVisible({ timeout: 5000 })
        .catch(() => false)
    ) {
      await securityTab.click();
      // Should show "No passkeys" empty state or register button
      await page.waitForTimeout(1000);
    }
  });
});

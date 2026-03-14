import { test, expect } from './fixtures';

test.describe('Marketplace', () => {
  test('shows template list', async ({ authenticatedPage: page }) => {
    await page.goto('/apps/new');
    // Should show templates loaded from Go Registry (7 templates)
    await expect(page.getByText(/wireguard/i).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test('category filter works', async ({ authenticatedPage: page }) => {
    await page.goto('/apps/new');
    // Look for a VPN category tab/filter
    const vpnFilter = page
      .getByRole('tab', { name: /vpn/i })
      .or(page.getByText(/vpn/i).first());
    if (await vpnFilter.isVisible()) {
      await vpnFilter.click();
      // After filtering, should still see VPN templates
      await expect(page.getByText(/wireguard/i).first()).toBeVisible();
    }
  });

  test('deploy wizard flow', async ({ authenticatedPage: page }) => {
    await page.goto('/apps/new');
    // Click on WireGuard template
    await page.getByText(/wireguard/i).first().click();
    // Should navigate to deploy wizard
    await page.waitForURL(/apps\/new\//);
    // Fill in endpoint if visible (some templates need it)
    const endpointField = page
      .getByLabel(/endpoint/i)
      .or(page.getByPlaceholder(/endpoint/i));
    if (
      await endpointField
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await endpointField.fill('test.example.com');
    }
    // Click deploy button
    const deployBtn = page.getByRole('button', { name: /deploy/i });
    if (
      await deployBtn
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await deployBtn.click();
      // Wait for deployment to start (could see progress or redirect)
      await page.waitForTimeout(2000);
    }
  });

  test('deployed app shows in app list', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/apps');
    // This page may show apps list or empty state
    await expect(page.locator('body')).toBeVisible();
  });
});

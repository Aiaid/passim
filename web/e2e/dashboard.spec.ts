import { test, expect } from './fixtures';

test.describe('Dashboard', () => {
  test('shows system metrics with real values', async ({ authenticatedPage: page }) => {
    // Wait for SSE metrics stream to deliver real data
    // CPU should show a percentage > 0 (e.g. "0.5", "12.3")
    await expect(page.locator('text=/\\d+\\.\\d+.*%/')).toBeVisible({
      timeout: 15000,
    });
    // Memory should show a non-zero value with unit (e.g. "1.5 GB")
    await expect(page.locator('text=/\\d+(\\.\\d+)?\\s*(B|KB|MB|GB)/')).toBeVisible();
  });

  test('shows container summary', async ({ authenticatedPage: page }) => {
    // MockDocker has 3 containers (2 running, 1 stopped)
    // Dashboard should show container count
    await expect(page.getByText(/container/i).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test('sidebar navigation works', async ({ authenticatedPage: page }) => {
    // Click Containers in sidebar
    await page.getByRole('link', { name: /container/i }).click();
    await expect(page).toHaveURL(/containers/);
  });
});

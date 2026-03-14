import { test, expect } from './fixtures';

test.describe('Dashboard', () => {
  test('shows system metrics', async ({ authenticatedPage: page }) => {
    // Dashboard should display CPU, Memory, Disk metrics
    // These come from real gopsutil via /api/status
    await expect(page.getByText(/cpu/i).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/memory/i).first()).toBeVisible();
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

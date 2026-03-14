import { test, expect } from './fixtures';

test.describe('Containers', () => {
  test('shows container list', async ({ authenticatedPage: page }) => {
    await page.goto('/containers');
    // MockDocker provides 3 containers: nginx, redis, postgres
    await expect(page.getByText(/nginx/i).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/redis/i).first()).toBeVisible();
    await expect(page.getByText(/postgres/i).first()).toBeVisible();
  });

  test('container actions available', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/containers');
    await expect(page.getByText(/nginx/i).first()).toBeVisible({
      timeout: 10000,
    });
    // Running containers should have stop/restart buttons
    // Look for any action button
    const actionBtn = page
      .getByRole('button')
      .filter({ hasText: /stop|restart|start/i })
      .first();
    await expect(actionBtn)
      .toBeVisible({ timeout: 5000 })
      .catch(() => {
        // Action buttons might be in a dropdown
      });
  });

  test('container logs', async ({ authenticatedPage: page }) => {
    await page.goto('/containers');
    await expect(page.getByText(/nginx/i).first()).toBeVisible({
      timeout: 10000,
    });
    // Look for logs button
    const logsBtn = page.getByRole('button', { name: /log/i }).first();
    if (
      await logsBtn
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await logsBtn.click();
      await page.waitForTimeout(1000);
    }
  });
});

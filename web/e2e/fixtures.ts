import { test as base, expect, Page } from '@playwright/test';
import fs from 'fs';

type E2EFixtures = {
  apiKey: string;
  authenticatedPage: Page;
};

export const test = base.extend<E2EFixtures>({
  apiKey: async ({}, use) => {
    const info = JSON.parse(
      fs.readFileSync('/tmp/passim-e2e-info.json', 'utf8')
    );
    await use(info.api_key);
  },
  authenticatedPage: async ({ page, apiKey }, use) => {
    await page.goto('/login');
    await page.getByPlaceholder('Enter API Key').fill(apiKey);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('/');
    await use(page);
  },
});

export { expect };

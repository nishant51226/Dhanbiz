import { test, expect } from "@playwright/test";

test.describe("Customer workspace", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/customers");
    await page.waitForLoadState("networkidle");
  });

  test("opens workspace tabs when customers exist", async ({ page }) => {
    const firstRow = page.locator("table tbody tr").first();
    test.skip(
      !(await firstRow.isVisible({ timeout: 5_000 }).catch(() => false)),
      "No customers in environment — seed data to run workspace tests"
    );

    await firstRow.click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/customers\/[^/]+\/dashboard/);

    const tabs = [
      { name: /drive/i, url: /\/drive/ },
      { name: /jobs/i, url: /\/jobs/ },
      { name: /details/i, url: /\/details/ },
    ];

    for (const tab of tabs) {
      const link = page.getByRole("link", { name: tab.name }).first();
      if (await link.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await link.click();
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveURL(tab.url);
      }
    }
  });
});

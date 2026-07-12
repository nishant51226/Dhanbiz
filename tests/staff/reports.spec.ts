import { test, expect } from "@playwright/test";

test.describe("Reports", () => {
  test("redirects /reports to /reports/job-cost", async ({ page }) => {
    await page.goto("/reports");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/reports\/job-cost/);
  });

  test("job cost report page loads", async ({ page }) => {
    await page.goto("/reports/job-cost");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/reports\/job-cost/);
    await expect(
      page.getByRole("heading").or(page.locator("table, [data-testid]")).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("customer documents report loads for admin", async ({ page }) => {
    await page.goto("/reports/customer-documents");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/reports\/customer-documents/);
  });

  test("file activity report loads for admin", async ({ page }) => {
    await page.goto("/reports/file-activity");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/reports\/file-activity/);
  });
});

import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test("loads admin dashboard for superadmin", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(
      page.getByRole("heading").or(page.locator("main")).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

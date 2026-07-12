import { test, expect } from "@playwright/test";

test.describe("Settings — admin tabs", () => {
  test("subscription plans page loads", async ({ page }) => {
    await page.goto("/settings/subscription");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/settings\/subscription/);
    await expect(page.locator("main").first()).toBeVisible({ timeout: 10_000 });
  });

  test("notifications page loads", async ({ page }) => {
    await page.goto("/settings/notifications");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/settings\/notifications/);
    await expect(page.locator("main").first()).toBeVisible({ timeout: 10_000 });
  });

  test("organisation information page loads", async ({ page }) => {
    await page.goto("/settings/information");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/settings\/information/);
  });
});

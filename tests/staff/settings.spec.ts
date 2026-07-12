import { test, expect } from "@playwright/test";

test.describe("Settings", () => {
  test("loads settings page for admin", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/settings/);
    await expect(
      page.getByRole("heading").or(page.locator("nav")).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("settings navigation shows expected tabs", async ({ page }) => {
    await page.goto("/settings/information");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("navigation").locator("a").first()).toBeVisible({ timeout: 8_000 });
  });

  test("admin can access users settings", async ({ page }) => {
    await page.goto("/settings/users");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/settings\/users/);
  });

  test("admin can access roles settings", async ({ page }) => {
    await page.goto("/settings/roles");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/settings\/roles/);
  });
});

import { test, expect } from "@playwright/test";

test.describe("Jobs", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/jobs");
    await page.waitForLoadState("networkidle");
  });

  test("loads the jobs list page", async ({ page }) => {
    await expect(page).toHaveURL(/\/jobs/);
    await expect(
      page.getByRole("heading").or(page.getByRole("table")).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("new job button is visible for admin", async ({ page }) => {
    await expect(
      page.getByRole("link", { name: /new job/i }).or(page.getByRole("button", { name: /new job/i }))
    ).toBeVisible({ timeout: 8_000 });
  });

  test("navigates to new job form", async ({ page }) => {
    const newBtn = page
      .getByRole("link", { name: /new job/i })
      .or(page.getByRole("button", { name: /new job/i }));
    await newBtn.click();
    await expect(page).toHaveURL(/\/jobs\/new/);
  });
});

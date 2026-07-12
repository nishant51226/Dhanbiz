import { test, expect } from "@playwright/test";

test.describe("Customers", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/customers");
    await page.waitForLoadState("networkidle");
  });

  test("loads the customers list page", async ({ page }) => {
    await expect(page).toHaveURL(/\/customers/);
    await expect(
      page.getByRole("heading").or(page.getByRole("table")).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("new customer button is visible for admin", async ({ page }) => {
    await expect(
      page.getByRole("link", { name: /add customer|new customer/i }).or(page.getByRole("button", { name: /add customer|new customer/i }))
    ).toBeVisible({ timeout: 8_000 });
  });

  test("navigates to new customer form after selecting business type", async ({ page }) => {
    const newBtn = page
      .getByRole("link", { name: /add customer|new customer/i })
      .or(page.getByRole("button", { name: /add customer|new customer/i }));
    await newBtn.click();
    // Modal asks for business type before navigating
    await expect(page.getByText("Select Business Type")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /limited company/i }).click();
    await expect(page).toHaveURL(/\/customers\/new/, { timeout: 10_000 });
  });
});

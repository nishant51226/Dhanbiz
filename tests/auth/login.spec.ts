import { test, expect } from "@playwright/test";

// These tests run without saved auth state
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("renders sign-in form", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.locator('input[autocomplete="username"]')).toBeVisible();
    await expect(page.locator('input[autocomplete="current-password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("shows error for invalid credentials", async ({ page }) => {
    await page.getByLabel("Email").fill("wrong@example.com");
    await page.locator('input[autocomplete="current-password"]').fill("wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("p.text-red-700, p.text-red-400")).toBeVisible({ timeout: 8_000 });
  });

  test("password visibility toggle works", async ({ page }) => {
    const passwordInput = page.locator('input[autocomplete="current-password"]');
    await expect(passwordInput).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(passwordInput).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(passwordInput).toHaveAttribute("type", "password");
  });

  test("unauthenticated users are redirected to /login from protected routes", async ({ page }) => {
    await page.goto("/customers");
    await expect(page).toHaveURL(/\/login/);
  });
});

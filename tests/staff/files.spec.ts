import { test, expect } from "@playwright/test";

test.describe("Files", () => {
  test("loads the global document library", async ({ page }) => {
    await page.goto("/files");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/files/);
    await expect(
      page.getByRole("heading").or(page.getByRole("table")).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

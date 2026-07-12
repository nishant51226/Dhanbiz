import { test, expect } from "@playwright/test";

test.describe("Roles & permissions — browser QA", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings/roles");
    await expect(page.getByRole("heading", { name: "Roles", exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("roles page loads without failed API calls (ROLES-UI-R1)", async ({ page }) => {
    const failed: string[] = [];
    page.on("response", (res) => {
      const url = res.url();
      if (url.includes("/api/admin/roles") && res.status() >= 400) {
        failed.push(`${res.status()} ${url}`);
      }
    });

    await page.reload();
    await expect(page.getByRole("heading", { name: "Roles", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("New role")).toBeVisible();
    await expect(page.getByText("Permissions")).toBeVisible();

    expect(failed, `Roles API failures: ${failed.join(", ")}`).toEqual([]);
  });

  test("role list shows staff and portal filter (ROLES-UI-R2)", async ({ page }) => {
    await expect(page.locator("select").filter({ hasText: /all|staff|portal/i }).first()).toBeVisible();
    const roleButtons = page.locator("ul li button");
    await expect(roleButtons.first()).toBeVisible({ timeout: 10_000 });
    expect(await roleButtons.count()).toBeGreaterThan(0);
  });

  test("selecting a role shows permission matrix (ROLES-UI-R3)", async ({ page }) => {
    const firstRole = page.locator("ul li button").first();
    await firstRole.click();

    await expect(page.getByText("Permissions").first()).toBeVisible();
    await expect(page.locator("table").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Create").first()).toBeVisible();
    await expect(page.getByText("Read").first()).toBeVisible();
  });

  test("settings nav includes Roles tab for admin (ROLES-UI-R4)", async ({ page }) => {
    await expect(
      page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: "Roles" }),
    ).toBeVisible();
  });

  test("help link opens user guide in new tab (ROLES-UI-R5)", async ({ page, context }) => {
    const helpLink = page.getByRole("link", { name: /help/i });
    await expect(helpLink).toBeVisible();

    const [popup] = await Promise.all([
      context.waitForEvent("page"),
      helpLink.click(),
    ]);

    await popup.waitForLoadState("domcontentloaded");
    expect(popup.url()).toMatch(/\/document\/docs\//);
    await popup.close();
  });
});

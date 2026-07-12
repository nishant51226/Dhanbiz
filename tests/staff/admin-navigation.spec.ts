import { test, expect } from "@playwright/test";

const ADMIN_ROUTES = [
  { path: "/dashboard", pattern: /\/dashboard/ },
  { path: "/customers", pattern: /\/customers/ },
  { path: "/jobs", pattern: /\/jobs/ },
  { path: "/files", pattern: /\/files/ },
  { path: "/reports/job-cost", pattern: /\/reports\/job-cost/ },
  { path: "/settings/information", pattern: /\/settings\/information/ },
  { path: "/settings/users", pattern: /\/settings\/users/ },
  { path: "/settings/roles", pattern: /\/settings\/roles/ },
  { path: "/settings/subscription", pattern: /\/settings\/subscription/ },
  { path: "/settings/notifications", pattern: /\/settings\/notifications/ },
  { path: "/reports/customer-documents", pattern: /\/reports\/customer-documents/ },
  { path: "/reports/file-activity", pattern: /\/reports\/file-activity/ },
] as const;

test.describe("Admin navigation smoke", () => {
  for (const route of ADMIN_ROUTES) {
    test(`loads ${route.path}`, async ({ page }) => {
      const response = await page.goto(route.path);
      expect(response?.status()).toBeLessThan(400);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(route.pattern);
      await expect(page.locator("main, [role=main]").first()).toBeVisible({
        timeout: 10_000,
      });
    });
  }
});

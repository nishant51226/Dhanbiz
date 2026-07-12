import type { Page } from "@playwright/test";

export class CustomersPage {
  constructor(readonly page: Page) {}

  async goto() {
    await this.page.goto("/customers");
    await this.page.waitForLoadState("networkidle");
  }

  get newCustomerButton() {
    return this.page
      .getByRole("link", { name: /new customer/i })
      .or(this.page.getByRole("button", { name: /new customer/i }));
  }

  get customerRows() {
    return this.page.locator("table tbody tr, [data-testid='customer-row']");
  }

  get searchInput() {
    return this.page.locator('input[type="search"], input[placeholder*="search" i]');
  }

  async clickFirstCustomer() {
    await this.page.locator("table tbody tr").first().click();
    await this.page.waitForLoadState("networkidle");
  }
}

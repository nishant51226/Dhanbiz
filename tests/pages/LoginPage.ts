import type { Page } from "@playwright/test";

export class LoginPage {
  constructor(readonly page: Page) {}

  async goto() {
    await this.page.goto("/login");
  }

  get emailInput() {
    return this.page.locator('input[autocomplete="username"]');
  }

  get passwordInput() {
    return this.page.locator('input[autocomplete="current-password"]');
  }

  get submitButton() {
    return this.page.getByRole("button", { name: /sign in/i });
  }

  get errorMessage() {
    return this.page.locator("p.text-red-700, p.text-red-400");
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
    await this.page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15_000 });
  }
}

import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Browser } from "playwright";
import { chromium } from "playwright";
import type { CustomerOnboardingData } from "./onboarding-templates/customerOnboarding";
import { getDirectDebitLogoDataUrl, getHmrcLogoDataUrl } from "./onboarding-templates/onboarding-template-image-src";
import { renderChangeAccountantHtml } from "./onboarding-templates/changeAccountantHtmlTemplate";
import { renderDirectDebitHtml } from "./onboarding-templates/directDebitHtmlTemplate";
import { renderHmrc648Html } from "./onboarding-templates/hmrc648HtmlTemplate";
import { renderRegistrationHtml } from "./onboarding-templates/onboardingHtmlTemplate";
import type { OnboardingFormPdfKey } from "./onboarding-form-keys";

/**
 * Renders the same HTML templates as the staff onboarding preview / download, then prints to PDF via Playwright.
 * Requires `npx playwright install chromium` (or full `playwright install`) once per machine/CI image.
 */
@Injectable()
export class OnboardingHtmlPdfService implements OnModuleDestroy {
  private readonly log = new Logger(OnboardingHtmlPdfService.name);
  private browser: Browser | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleDestroy(): Promise<void> {
    await this.closeBrowser();
  }

  private async closeBrowser(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        /* ignore */
      }
      this.browser = null;
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
    }
    return this.browser;
  }

  private assetOrigin(): string {
    const raw =
      this.config.get<string>("APP_PUBLIC_ORIGIN")?.trim() ||
      this.config.get<string>("PUBLIC_APP_ORIGIN")?.trim() ||
      "http://127.0.0.1:5173";
    return raw.replace(/\/$/, "");
  }

  private buildHtml(formKey: OnboardingFormPdfKey, data: CustomerOnboardingData): string {
    const origin = this.assetOrigin();
    switch (formKey) {
      case "form_1":
        return renderRegistrationHtml(data, { assetOrigin: origin });
      case "form_2":
        return renderHmrc648Html(data, { hmrcLogoSrc: getHmrcLogoDataUrl(), assetOrigin: origin });
      case "form_3":
        return renderChangeAccountantHtml(data);
      case "form_4":
        return renderDirectDebitHtml(data, {
          directDebitLogoSrc: getDirectDebitLogoDataUrl(),
          assetOrigin: origin,
        });
      default:
        return renderRegistrationHtml(data, { assetOrigin: origin });
    }
  }

  async renderStepToPdfBuffer(formKey: OnboardingFormPdfKey, data: CustomerOnboardingData): Promise<Buffer> {
    const html = this.buildHtml(formKey, data);
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: "networkidle", timeout: 90_000 });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
      return Buffer.from(pdf);
    } catch (e) {
      await this.closeBrowser();
      const msg = e instanceof Error ? e.message : String(e);
      this.log.error(`Playwright PDF failed for ${formKey}: ${msg}`);
      throw e;
    } finally {
      await page.close();
    }
  }
}

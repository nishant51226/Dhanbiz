import type { CustomerOnboardingData } from "./customerOnboarding";

/** Base filename without extension: onboarding-{company}-{YYYY-MM-DD}. */
export function onboardingExportBaseName(data: CustomerOnboardingData): string {
  const raw = data.company.name.trim() || "onboarding";
  const sanitized = raw
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
  const slug = sanitized.length > 0 ? sanitized : "onboarding";
  const date = new Date().toISOString().slice(0, 10);
  return `onboarding-${slug}-${date}`;
}

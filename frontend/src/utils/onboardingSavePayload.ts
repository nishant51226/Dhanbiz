import type { CustomerOnboardingData } from "../types/customerOnboarding";
import { reviveCustomerOnboarding } from "../types/customerOnboarding";

/**
 * Build the onboarding JSON sent on PATCH /customers/:id.
 * `reviveCustomerOnboarding` normalises known schema fields but drops legacy root keys
 * (`accounts_fd`, `cs`, `filing_month`, …) and must not reshape `companies_house` edits.
 */
export function buildOnboardingSavePayload(draft: Record<string, unknown>): CustomerOnboardingData {
  const revived = reviveCustomerOnboarding(draft) as Record<string, unknown>;
  const revivedKeys = new Set(Object.keys(revived));

  for (const [key, value] of Object.entries(draft)) {
    if (revivedKeys.has(key) || value === undefined) continue;
    revived[key] = value;
  }

  const draftCh = draft.companies_house;
  if (draftCh && typeof draftCh === "object" && !Array.isArray(draftCh)) {
    revived.companies_house = structuredClone(draftCh);
  }

  return revived as CustomerOnboardingData;
}

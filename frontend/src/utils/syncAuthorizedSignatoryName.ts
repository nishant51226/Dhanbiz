import type { CustomerOnboardingData } from "../types/customerOnboarding";

/**
 * Sets the same authorized signatory name on all four onboarding signature slots so
 * DocuSeal prefill and each step stay consistent when the user types on any form.
 */
export function withAuthorizedSignatoryNameAcrossForms(
  d: CustomerOnboardingData,
  name: string,
): CustomerOnboardingData {
  const s = d.signatures;
  return {
    ...d,
    signatures: {
      ...s,
      client_registration: { ...s.client_registration, name },
      hmrc_64_8: { ...s.hmrc_64_8, name },
      change_accountant: { ...s.change_accountant, name },
      direct_debit: { ...s.direct_debit, name },
    },
  };
}

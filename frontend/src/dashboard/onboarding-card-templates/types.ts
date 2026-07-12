/**
 * Staff dashboard cards: each template maps onboarding_data (incl. companies_house) to a sort key + display rows.
 * Sort field ids must exist on GET /customers/onboarding-dashboard-sort-fields (backend allowlist).
 */
export type OnboardingDashboardCardTemplate = {
  id: string;
  title: string;
  description: string;
  /** `onboardingSort` field id — drives SQL ordering for the customer list. */
  sortFieldId: string;
  /** Default: soonest deadlines first for date fields; adjust per template. */
  defaultOrder: "ASC" | "DESC";
  /** Dot paths under onboarding JSON root (e.g. companies_house.accounts.next_accounts_due_on). */
  rows: readonly { label: string; path: string }[];
};

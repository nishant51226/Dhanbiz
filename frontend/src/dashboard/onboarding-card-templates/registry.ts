import type { OnboardingDashboardCardTemplate } from "./types";

export const ONBOARDING_DASHBOARD_CARD_TEMPLATES: readonly OnboardingDashboardCardTemplate[] = [
  {
    id: "incorporation",
    title: "Incorporation",
    description: "Company / CH incorporation date and jurisdiction.",
    sortFieldId: "companies_house.date_of_creation",
    defaultOrder: "DESC",
    rows: [
      { label: "Date of creation (company)", path: "company.date_of_creation" },
      { label: "Date of creation (CH)", path: "companies_house.date_of_creation" },
      { label: "Jurisdiction", path: "companies_house.jurisdiction" },
      { label: "Company status", path: "companies_house.company_status" },
    ],
  },
  {
    id: "accounts_timeline",
    title: "Accounts periods & due",
    description: "Last and next account periods and filing due date.",
    sortFieldId: "companies_house.accounts.next_accounts_due_on",
    defaultOrder: "ASC",
    rows: [
      { label: "Last accounts period start", path: "companies_house.accounts.last_accounts_period_start_on" },
      { label: "Last accounts period end / made up to", path: "companies_house.accounts.last_accounts_period_end_on" },
      { label: "Next accounts period start", path: "companies_house.accounts.next_accounts_period_start_on" },
      { label: "Financial Year End", path: "companies_house.accounts.next_accounts_period_end_on" },
      { label: "Accounts Due Date", path: "companies_house.accounts.next_accounts_due_on" },
      { label: "Next accounts overdue", path: "companies_house.accounts.next_accounts_overdue" },
      { label: "Last accounts type", path: "companies_house.accounts.last_accounts_type" },
    ],
  },
  {
    id: "confirmation_statement",
    title: "Confirmation statement",
    description: "Confirmation statement made-up dates and next due.",
    sortFieldId: "companies_house.confirmation_statement.next_due",
    defaultOrder: "ASC",
    rows: [
      { label: "Last made up to", path: "companies_house.confirmation_statement.last_made_up_to" },
      { label: "CS Due Date", path: "companies_house.confirmation_statement.next_made_up_to" },
      { label: "Next due", path: "companies_house.confirmation_statement.next_due" },
      { label: "Overdue", path: "companies_house.confirmation_statement.overdue" },
    ],
  },
  {
    id: "latest_filing",
    title: "Latest filing (Companies House)",
    description: "Most recent filing in the CH history list (first item). Requires linked filing history in snapshot.",
    sortFieldId: "companies_house.latest_filing_date",
    defaultOrder: "DESC",
    rows: [
      { label: "Filing date", path: "companies_house.latest_filing_date" },
      { label: "Filing type", path: "companies_house.latest_filing_type" },
      { label: "Description", path: "companies_house.latest_filing_description" },
    ],
  },
  {
    id: "identity_verification",
    title: "Identity verification (PSC & officer)",
    description: "Appointment verification dates from first PSC and first officer (denormalised on companies_house).",
    sortFieldId: "companies_house.psc_appointment_verification_statement_due_on",
    defaultOrder: "ASC",
    rows: [
      { label: "PSC — verification due", path: "companies_house.psc_appointment_verification_statement_due_on" },
      { label: "PSC — verification statement date", path: "companies_house.psc_appointment_verification_statement_date" },
      { label: "Officer — verification due", path: "companies_house.officer_appointment_verification_statement_due_on" },
    ],
  },
];

const BY_ID = new Map(ONBOARDING_DASHBOARD_CARD_TEMPLATES.map((t) => [t.id, t]));

export function getOnboardingCardTemplate(id: string): OnboardingDashboardCardTemplate | undefined {
  return BY_ID.get(id);
}

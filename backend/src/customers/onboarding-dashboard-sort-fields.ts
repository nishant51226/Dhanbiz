import { BadRequestException } from "@nestjs/common";

/** Allowlisted JSON paths under `customers.onboarding_data` for staff dashboard sorting (SQL-safe segments). */
export type OnboardingDashboardSortField = {
  /** Stable id sent as `onboardingSort=id,ASC|DESC`. */
  id: string;
  label: string;
  /** Path under onboarding_data root (e.g. company.number). */
  path: readonly string[];
};

const SEG = /^[a-z][a-z0-9_]*$/i;

function pathOf(...segments: string[]): readonly string[] {
  for (const s of segments) {
    if (!SEG.test(s)) throw new Error(`Invalid onboarding sort segment: ${s}`);
  }
  return segments;
}

export const ONBOARDING_DASHBOARD_SORT_FIELDS: readonly OnboardingDashboardSortField[] = [
  { id: "company.number", label: "Company — number", path: pathOf("company", "number") },
  { id: "company.name", label: "Company — name", path: pathOf("company", "name") },
  { id: "company.type", label: "Company — type", path: pathOf("company", "type") },
  { id: "company.nature_of_business", label: "Company — nature of business", path: pathOf("company", "nature_of_business") },
  { id: "company.year_end", label: "Company — year end", path: pathOf("company", "year_end") },
  { id: "company.company_status", label: "Company — status", path: pathOf("company", "company_status") },
  { id: "company.date_of_creation", label: "Company — incorporation date", path: pathOf("company", "date_of_creation") },
  { id: "company.jurisdiction", label: "Company — jurisdiction", path: pathOf("company", "jurisdiction") },
  { id: "company.address.line1", label: "Company — address line 1", path: pathOf("company", "address", "line1") },
  { id: "company.address.city", label: "Company — city", path: pathOf("company", "address", "city") },
  { id: "company.address.postcode", label: "Company — postcode", path: pathOf("company", "address", "postcode") },
  { id: "companies_house.company_status", label: "Companies House — status", path: pathOf("companies_house", "company_status") },
  { id: "companies_house.date_of_creation", label: "Companies House — incorporation", path: pathOf("companies_house", "date_of_creation") },
  { id: "companies_house.date_of_cessation", label: "Companies House — cessation date", path: pathOf("companies_house", "date_of_cessation") },
  { id: "companies_house.jurisdiction", label: "Companies House — jurisdiction", path: pathOf("companies_house", "jurisdiction") },
  { id: "companies_house.type", label: "Companies House — type", path: pathOf("companies_house", "type") },
  { id: "companies_house.fetched_at", label: "Companies House — fetched at", path: pathOf("companies_house", "fetched_at") },
  { id: "companies_house.etag", label: "Companies House — etag", path: pathOf("companies_house", "etag") },
  {
    id: "companies_house.accounts.next_accounts_due_on",
    label: "CH — Accounts Due Date",
    path: pathOf("companies_house", "accounts", "next_accounts_due_on"),
  },
  {
    id: "companies_house.accounts.last_accounts_period_start_on",
    label: "CH — last accounts period start",
    path: pathOf("companies_house", "accounts", "last_accounts_period_start_on"),
  },
  {
    id: "companies_house.accounts.last_accounts_period_end_on",
    label: "CH — last accounts period end / made up to",
    path: pathOf("companies_house", "accounts", "last_accounts_period_end_on"),
  },
  {
    id: "companies_house.accounts.next_accounts_period_start_on",
    label: "CH — next accounts period start",
    path: pathOf("companies_house", "accounts", "next_accounts_period_start_on"),
  },
  {
    id: "companies_house.accounts.next_accounts_period_end_on",
    label: "CH — Financial Year End",
    path: pathOf("companies_house", "accounts", "next_accounts_period_end_on"),
  },
  {
    id: "companies_house.accounts.next_accounts_overdue",
    label: "CH — accounts overdue",
    path: pathOf("companies_house", "accounts", "next_accounts_overdue"),
  },
  {
    id: "companies_house.confirmation_statement.last_made_up_to",
    label: "CH — confirmation statement last made up to",
    path: pathOf("companies_house", "confirmation_statement", "last_made_up_to"),
  },
  {
    id: "companies_house.confirmation_statement.next_made_up_to",
    label: "CH — CS Due Date",
    path: pathOf("companies_house", "confirmation_statement", "next_made_up_to"),
  },
  {
    id: "companies_house.confirmation_statement.next_due",
    label: "CH — confirmation statement next due",
    path: pathOf("companies_house", "confirmation_statement", "next_due"),
  },
  {
    id: "companies_house.confirmation_statement.overdue",
    label: "CH — confirmation overdue",
    path: pathOf("companies_house", "confirmation_statement", "overdue"),
  },
  {
    id: "tax.vat_return_due_date",
    label: "VAT return due",
    path: pathOf("tax", "vat_return_due_date"),
  },
  {
    id: "companies_house.latest_filing_date",
    label: "CH — latest filing (date)",
    path: pathOf("companies_house", "latest_filing_date"),
  },
  {
    id: "companies_house.latest_filing_type",
    label: "CH — latest filing (type)",
    path: pathOf("companies_house", "latest_filing_type"),
  },
  {
    id: "companies_house.psc_appointment_verification_statement_due_on",
    label: "CH — PSC identity verification due",
    path: pathOf("companies_house", "psc_appointment_verification_statement_due_on"),
  },
  {
    id: "companies_house.psc_appointment_verification_statement_date",
    label: "CH — PSC identity verification statement date",
    path: pathOf("companies_house", "psc_appointment_verification_statement_date"),
  },
  {
    id: "companies_house.officer_appointment_verification_statement_due_on",
    label: "CH — officer identity verification due",
    path: pathOf("companies_house", "officer_appointment_verification_statement_due_on"),
  },
] as const;

const BY_ID = new Map(ONBOARDING_DASHBOARD_SORT_FIELDS.map((f) => [f.id, f]));

/**
 * Text extraction SQL for `onboarding_data` at allowlisted path (uses `->` / `->>` only).
 * @param tableAlias e.g. `c`
 */
export function onboardingDataTextSqlExpr(tableAlias: string, path: readonly string[]): string {
  if (path.length < 2) {
    throw new BadRequestException("Onboarding sort path must have at least two segments.");
  }
  for (const p of path) {
    if (!SEG.test(p)) {
      throw new BadRequestException("Invalid onboarding sort path.");
    }
  }
  const mid = path
    .slice(0, -1)
    .map((p) => `->'${p}'`)
    .join("");
  const last = path[path.length - 1];
  return `${tableAlias}.onboarding_data${mid}->>'${last}'`;
}

export function parseOnboardingDashboardSort(raw: string | undefined): {
  path: readonly string[];
  order: "ASC" | "DESC";
} | null {
  const t = raw?.trim();
  if (!t) return null;
  const [idRaw, orderRaw] = t.split(",").map((s) => s.trim());
  if (!idRaw) {
    throw new BadRequestException("onboardingSort must start with a field id, e.g. company.number,DESC");
  }
  const meta = BY_ID.get(idRaw);
  if (!meta) {
    throw new BadRequestException(
      `Unknown onboarding sort field "${idRaw}". Use GET /customers/onboarding-dashboard-sort-fields for the catalog.`,
    );
  }
  const order = orderRaw?.toUpperCase() === "DESC" ? "DESC" : "ASC";
  return { path: meta.path, order };
}

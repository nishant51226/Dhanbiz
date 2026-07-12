import type { Customer, CustomerAccountStatus, CustomerFormSubmission, CustomerPageRowWithSubmission } from "../types/api";

/**
 * Customer lifecycle label for UI: honour staff-set `active` / `inactive` / `proposed`, then treat
 * a completed onboarding submission as **active** when the row is still `draft` (legacy or pending DB sync).
 */
export function accountStatusForCustomerDisplay(
  customer: Pick<Customer, "accountStatus"> | null | undefined,
  latestFormSubmission?: Pick<CustomerFormSubmission, "status"> | null,
): CustomerAccountStatus {
  const db = customer?.accountStatus;
  if (db === "active" || db === "inactive" || db === "proposed") return db;
  if (latestFormSubmission?.status === "completed") return "active";
  return db ?? "draft";
}

/** Same rules as {@link accountStatusForCustomerDisplay} for the customer directory table. */
export function accountStatusFromPageRow(row: CustomerPageRowWithSubmission): CustomerAccountStatus {
  return accountStatusForCustomerDisplay(row, row.latestFormSubmission ?? undefined);
}

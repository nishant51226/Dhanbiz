import type {
  Customer,
  CustomerAccountStatus,
  CustomerFormSubmission,
  CustomerPageRowWithSubmission,
} from "../types/api";

function asRecord(x: unknown): Record<string, unknown> | undefined {
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : undefined;
}

function parseTs(iso: string | undefined): number | null {
  if (!iso?.trim()) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** After onboarding completes, `customers.onboarding_data` is canonical (incl. superadmin edits). */
function usesCanonicalCustomerOnboarding(status: CustomerAccountStatus | undefined): boolean {
  return status === "active" || status === "inactive" || status === "proposed";
}

/**
 * Merges `customers.onboarding_data` with the latest form submission payload so CH fields
 * reflect either the synced snapshot on the customer row or the wizard copy when present.
 */
export function customerOnboardingDisplayRoot(row: CustomerPageRowWithSubmission): Record<string, unknown> | null {
  const od = asRecord(row.onboardingData) ?? {};
  const frm = asRecord(row.latestFormSubmission?.data) ?? {};
  const odCh = asRecord(od.companies_house);
  const frmCh = asRecord(frm.companies_house);
  /** Active/inactive/proposed: saved `onboarding_data` wins over stale wizard CH snapshot. */
  const mergedCh =
    usesCanonicalCustomerOnboarding(row.accountStatus) && odCh && Object.keys(odCh).length > 0
      ? { ...frmCh, ...odCh }
      : { ...odCh, ...frmCh };

  const customerUpdated = parseTs(row.updatedAt);
  const submissionUpdated = parseTs(row.latestFormSubmission?.updatedAt);

  let out: Record<string, unknown>;
  if (usesCanonicalCustomerOnboarding(row.accountStatus) && Object.keys(od).length > 0) {
    out = { ...od };
  } else if (
    customerUpdated !== null &&
    submissionUpdated !== null &&
    customerUpdated >= submissionUpdated
  ) {
    out = { ...od };
  } else if (Object.keys(frm).length > 0) {
    out = { ...od, ...frm };
  } else {
    out = { ...od };
  }

  if (Object.keys(mergedCh).length > 0) {
    out.companies_house = mergedCh;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Customer detail views: merge canonical row JSON with the latest wizard submission copy. */
export function mergedOnboardingDataForCustomer(
  customer: Pick<Customer, "onboardingData" | "updatedAt" | "accountStatus">,
  submission: Pick<CustomerFormSubmission, "data" | "updatedAt"> | null | undefined,
): Record<string, unknown> | null {
  return customerOnboardingDisplayRoot({
    id: "",
    name: "",
    accountStatus: customer.accountStatus,
    createdAt: "",
    updatedAt: customer.updatedAt ?? "",
    onboardingData: customer.onboardingData ?? null,
    latestFormSubmission: submission?.data
      ? {
          id: "",
          status: "completed",
          data: submission.data,
          updatedAt: "",
        }
      : null,
  });
}

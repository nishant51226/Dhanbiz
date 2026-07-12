import type { CustomerOnboardingData } from "../types/customerOnboarding";

/** Flat fields used by `CustomersPage` table (subset of onboarding JSON). */
export type CustomerTableMappedFields = {
  businessType?: string;
  numberOfStores?: number;
  addressLine1?: string;
  city?: string;
  postCode?: string;
  email?: string;
  vatNumber?: string;
  vatRegDate?: string;
  nextVatQuarterEnd?: string;
  payeEnabled?: boolean;
  payeFrequency?: string;
  payeReference?: string;
  companyRegNo?: string;
  regDate?: string;
  utr?: string;
  yearEnd?: string;
  director1Name?: string;
  director1Address?: string;
  director2Name?: string;
  director2Address?: string;
  servicesInPack?: string[];
  kycStatus?: "pending" | "completed" | "failed";
};

function joinAddress(parts: string[]): string {
  return parts.filter((p) => p.trim().length > 0).join(", ");
}

/** Assigned matrix / subscription plan label for list columns (DB plan name wins over onboarding JSON). */
export function subscriptionPlanDisplayName(
  d: CustomerOnboardingData,
  planNameFromCustomer?: string | null,
): string | undefined {
  const fromDb = planNameFromCustomer?.trim();
  if (fromDb) return fromDb;
  const matrix = d.subscription_matrix_plan_name?.trim();
  if (matrix) return matrix;
  const legacy = d.subscription_plan_name?.trim();
  if (legacy) return legacy;
  return undefined;
}

export function mapOnboardingToCustomerTableFields(d: CustomerOnboardingData): CustomerTableMappedFields {
  const reg = d.company?.registeredAddress;
  const d1 = d.directors?.[0];
  const d2 = d.directors?.[1];
  const servicesInPack: string[] = [];
  const sv = d.services;
  if (sv?.bookkeeping) servicesInPack.push("Bookkeeping");
  if (sv?.vat) servicesInPack.push("VAT");
  if (sv?.quarterly_reports) servicesInPack.push("Quarterly reports");
  if (sv?.year_end_accounts) servicesInPack.push("Year-end accounts");
  if (sv?.personal_tax_return) servicesInPack.push("Personal tax return");
  if (sv?.payroll?.enabled) servicesInPack.push("Payroll");

  const approval = (d.office_use?.approval_status ?? "").trim().toLowerCase();
  let kycStatus: CustomerTableMappedFields["kycStatus"] = "pending";
  if (approval === "approved") kycStatus = "completed";
  else if (approval === "rejected") kycStatus = "failed";

  return {
    businessType: d.company?.type || undefined,
    numberOfStores:
      typeof sv?.payroll?.employee_count === "number" && Number.isFinite(sv.payroll.employee_count)
        ? sv.payroll.employee_count
        : undefined,
    addressLine1: reg?.line1 || undefined,
    city: reg?.city || undefined,
    postCode: reg?.postcode || undefined,
    email: d.contact?.email || undefined,
    vatNumber: d.tax?.vat_number || undefined,
    vatRegDate: undefined,
    nextVatQuarterEnd: d.tax?.vat_quarter || undefined,
    payeEnabled: sv?.payroll?.enabled,
    payeFrequency: sv?.payroll?.frequency || undefined,
    payeReference: d.tax?.paye_ref || undefined,
    companyRegNo: d.company?.number || undefined,
    regDate: d.company?.date_of_creation || undefined,
    utr: d.tax?.utr || undefined,
    yearEnd: d.company?.year_end || undefined,
    director1Name: d1?.name || undefined,
    director1Address: d1 ? joinAddress([d1.address, d1.city, d1.postcode]) : undefined,
    director2Name: d2?.name || undefined,
    director2Address: d2 ? joinAddress([d2.address, d2.city, d2.postcode]) : undefined,
    servicesInPack: servicesInPack.length > 0 ? servicesInPack : undefined,
    kycStatus,
  };
}

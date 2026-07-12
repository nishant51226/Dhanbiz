import { Customer, CustomerAccountStatus } from "../entities/customer.entity";
import type { CustomerListExportColumnKey } from "./customers-list-export.constants";
import { CUSTOMER_LIST_EXPORT_LABELS } from "./customers-list-export.constants";

export type LatestSubmissionExport = {
  status: "draft" | "completed";
  data: Record<string, unknown>;
} | null;

/** List / summary export: prefer `customers.account_status`, else legacy form submission wording. */
export function formatCustomerAccountStatusForExport(
  customer: Pick<Customer, "accountStatus">,
  latest: LatestSubmissionExport,
): string {
  const s = customer.accountStatus;
  if (s === CustomerAccountStatus.draft) return "Draft";
  if (s === CustomerAccountStatus.active) return "Active";
  if (s === CustomerAccountStatus.inactive) return "Inactive";
  if (s === CustomerAccountStatus.proposed) return "Proposed";
  return latest?.status === "completed" ? "Active" : "In progress";
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function pickStr(obj: unknown, path: string[]): string {
  let cur: unknown = obj;
  for (const k of path) {
    const r = asRecord(cur);
    if (!r) return "";
    cur = r[k];
  }
  if (cur === null || cur === undefined) return "";
  if (typeof cur === "string") return cur;
  if (typeof cur === "number" || typeof cur === "boolean") return String(cur);
  return "";
}

/** Treat common JSON truthy shapes like the list UI (`if (sv?.bookkeeping)`). */
function truthySvc(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === "string") {
    const x = v.trim().toLowerCase();
    return x === "1" || x === "true" || x === "yes" || x === "y";
  }
  return false;
}

function firstNonEmpty(...vals: string[]): string {
  for (const v of vals) {
    if (v.trim().length > 0) return v;
  }
  return "";
}

function servicesInPackFromBooleans(merged: Record<string, unknown>): string[] {
  const sv = asRecord(merged.services);
  const servicesInPack: string[] = [];
  if (truthySvc(sv?.bookkeeping)) servicesInPack.push("Bookkeeping");
  if (truthySvc(sv?.vat)) servicesInPack.push("VAT");
  if (truthySvc(sv?.quarterly_reports)) servicesInPack.push("Quarterly reports");
  if (truthySvc(sv?.year_end_accounts)) servicesInPack.push("Year-end accounts");
  if (truthySvc(sv?.personal_tax_return)) servicesInPack.push("Personal tax return");
  const payroll = sv ? asRecord(sv.payroll) : null;
  if (truthySvc(payroll?.enabled)) servicesInPack.push("Payroll");
  return servicesInPack;
}

function subscriptionPlanDisplayName(
  merged: Record<string, unknown>,
  planNameFromCustomer?: string | null,
): string {
  const fromDb = planNameFromCustomer?.trim();
  if (fromDb) return fromDb;
  return firstNonEmpty(
    pickStr(merged, ["subscription_matrix_plan_name"]),
    pickStr(merged, ["subscription_plan_name"]),
  );
}

/** Same field logic as the customers list over merged wizard + canonical JSON; tolerates alternate keys. */
export function mapMergedOnboarding(
  merged: Record<string, unknown>,
  planNameFromCustomer?: string | null,
): Record<string, string> {
  const company = asRecord(merged.company);
  const regRaw =
    (company?.["registeredAddress"] as unknown) ?? (company?.["registered_address"] as unknown) ?? null;
  const reg = asRecord(regRaw);
  const directors = Array.isArray(merged.directors) ? merged.directors : [];
  const d1 = asRecord(directors[0]);
  const tax = asRecord(merged.tax);
  const contact = asRecord(merged.contact);
  const agent = asRecord(merged.agent);
  const officeUse = asRecord(merged.office_use) ?? asRecord(merged.officeUse);

  const planName = subscriptionPlanDisplayName(merged, planNameFromCustomer);
  const serviceFlags = servicesInPackFromBooleans(merged);
  const servicesInPack = planName ? [planName] : serviceFlags;

  const approval = String(officeUse?.approval_status ?? "")
    .trim()
    .toLowerCase();
  let kycStatus = "pending";
  if (approval === "approved") kycStatus = "completed";
  else if (approval === "rejected") kycStatus = "failed";

  const threeK = firstNonEmpty(pickStr(agent, ["client_reference"]), pickStr(agent, ["clientReference"]));

  const vatNumber = firstNonEmpty(
    pickStr(tax, ["vat_number"]),
    pickStr(tax, ["vatNumber"]),
    pickStr(merged, ["vat_number"]),
    pickStr(merged, ["vatNumber"]),
  );

  const utr = firstNonEmpty(pickStr(tax, ["utr"]), pickStr(merged, ["utr"]));

  const email = firstNonEmpty(pickStr(contact, ["email"]), pickStr(merged, ["email"]));

  const businessType = firstNonEmpty(
    pickStr(company, ["type"]),
    pickStr(company, ["business_type"]),
    pickStr(merged, ["business_type"]),
  );

  const companyRegNo = firstNonEmpty(
    pickStr(company, ["number"]),
    pickStr(company, ["company_number"]),
    pickStr(company, ["companyNumber"]),
  );

  const yearEnd = firstNonEmpty(pickStr(company, ["year_end"]), pickStr(company, ["yearEnd"]));

  const director1Name = d1
    ? firstNonEmpty(pickStr(d1, ["name"]), pickStr(d1, ["full_name"]), pickStr(d1, ["fullName"]))
    : "";

  return {
    threeKRef: threeK.trim(),
    businessType,
    city: reg ? firstNonEmpty(pickStr(reg, ["city"]), pickStr(reg, ["town"])) : "",
    email,
    vatNumber,
    servicesInPack: servicesInPack.join(", "),
    companyRegNo,
    utr,
    yearEnd,
    addressLine1: reg ? firstNonEmpty(pickStr(reg, ["line1"]), pickStr(reg, ["line_1"]), pickStr(reg, ["address_line_1"])) : "",
    postCode: reg
      ? firstNonEmpty(pickStr(reg, ["postcode"]), pickStr(reg, ["post_code"]), pickStr(reg, ["postalCode"]))
      : "",
    director1Name,
    kycStatus,
  };
}

function formatTs(d: Date | string | undefined): string {
  if (!d) return "";
  if (d instanceof Date) return d.toISOString();
  return String(d);
}

function formatTurnover(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null && "toString" in v) {
    const s = (v as { toString(): string }).toString();
    if (s !== "[object Object]") return s;
  }
  return String(v);
}

export function buildCustomerListExportRow(
  customer: Customer,
  latest: LatestSubmissionExport,
  columnKeys: readonly CustomerListExportColumnKey[],
): { headers: string[]; values: string[] } {
  const merged: Record<string, unknown> = {
    ...(latest?.data ?? {}),
    ...(customer.onboardingData ?? {}),
  };
  const derived = mapMergedOnboarding(merged, customer.plan?.name ?? null);
  const statusLabel = formatCustomerAccountStatusForExport(customer, latest);

  const cell: Record<CustomerListExportColumnKey, string> = {
    id: customer.id,
    name: customer.name ?? "",
    threeKRef: derived.threeKRef,
    businessType: derived.businessType,
    city: derived.city,
    email: derived.email,
    vatNumber: derived.vatNumber,
    servicesInPack: derived.servicesInPack,
    status: statusLabel,
    createdAt: formatTs(customer.createdAt),
    updatedAt: formatTs(customer.updatedAt),
    planId: customer.planId ?? "",
    annualTurnoverGbp: formatTurnover(customer.annualTurnoverGbp),
    companyRegNo: derived.companyRegNo,
    utr: derived.utr,
    yearEnd: derived.yearEnd,
    addressLine1: derived.addressLine1,
    postCode: derived.postCode,
    director1Name: derived.director1Name,
    kycStatus: derived.kycStatus,
  };

  const headers = columnKeys.map((k) => CUSTOMER_LIST_EXPORT_LABELS[k]);
  const values = columnKeys.map((k) => cell[k] ?? "");
  return { headers, values };
}

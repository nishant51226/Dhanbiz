import type { Customer } from "../entities/customer.entity";
import { isSummaryExportColumnId, summaryExportLabel } from "./customer-summary-export.constants";
import {
  formatCustomerAccountStatusForExport,
  mapMergedOnboarding,
  type LatestSubmissionExport,
} from "./customers-list-export.mapper";
import { formatDisplayDate } from "../format-display-date.util.js";

/** Maps older list-export column ids to summary catalog ids. */
export const LEGACY_LIST_EXPORT_COLUMN_ALIASES: Record<string, string> = {
  id: "customerId",
  status: "formStatus",
  email: "contactEmail",
  city: "registeredCity",
  businessType: "entityType",
  addressLine1: "registeredLine1",
  postCode: "registeredPostcode",
  subscriptionPlanId: "planId",
};

/**
 * Normalizes list-export POST bodies: legacy keys → summary ids, dedupes, preserves order.
 */
export function normalizeListExportColumnIds(requested: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of requested) {
    const mapped = LEGACY_LIST_EXPORT_COLUMN_ALIASES[raw] ?? raw;
    if (!isSummaryExportColumnId(mapped) || seen.has(mapped)) continue;
    seen.add(mapped);
    out.push(mapped);
  }
  return out;
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

function firstNonEmpty(...vals: string[]): string {
  for (const v of vals) {
    if (v.trim().length > 0) return v;
  }
  return "";
}

function formatTs(d: Date | string | undefined): string {
  if (!d) return "";
  if (d instanceof Date) return d.toISOString();
  return String(d);
}

function formatDay(iso: string | Date | undefined): string {
  return formatDisplayDate(iso);
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

function yn(v: unknown): string {
  if (v === true || v === 1) return "Yes";
  if (v === false || v === 0) return "No";
  if (typeof v === "string") {
    const x = v.trim().toLowerCase();
    if (x === "1" || x === "true" || x === "yes" || x === "y") return "Yes";
    if (x === "0" || x === "false" || x === "no" || x === "n") return "No";
  }
  return "";
}

function truthySvc(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === "string") {
    const x = v.trim().toLowerCase();
    return x === "1" || x === "true" || x === "yes" || x === "y";
  }
  return false;
}

function kycDisplay(derivedKyc: string): string {
  const s = derivedKyc.trim().toLowerCase();
  if (s === "completed") return "Verified";
  if (s === "failed") return "Failed";
  if (s === "pending") return "Pending";
  return derivedKyc || "";
}

function servicesInPackList(merged: Record<string, unknown>): string {
  const sv = asRecord(merged.services);
  const parts: string[] = [];
  if (truthySvc(sv?.bookkeeping)) parts.push("Bookkeeping");
  if (truthySvc(sv?.vat)) parts.push("VAT");
  if (truthySvc(sv?.quarterly_reports)) parts.push("Quarterly reports");
  if (truthySvc(sv?.year_end_accounts)) parts.push("Year-end accounts");
  if (truthySvc(sv?.personal_tax_return)) parts.push("Personal tax return");
  const payroll = sv ? asRecord(sv.payroll) : null;
  if (truthySvc(payroll?.enabled)) parts.push("Payroll");
  return parts.join(", ");
}

export function normalizeSummaryExportColumnIds(requested: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of requested) {
    const id = raw === "subscriptionPlanId" ? "planId" : raw;
    if (!isSummaryExportColumnId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

type SummaryCustomer = Customer & {
  plan?: { name?: string | null } | null;
  customerUsers?: { user?: { email?: string | null } | null }[] | null;
};

function cellValue(
  id: string,
  customer: SummaryCustomer,
  latest: LatestSubmissionExport,
  merged: Record<string, unknown>,
  derived: Record<string, string>,
): string {
  const company = asRecord(merged.company);
  const reg = asRecord(company?.["registeredAddress"] ?? company?.["registered_address"]);
  const trader = asRecord(company?.["traderAddress"] ?? company?.["trader_address"]);
  const tax = asRecord(merged.tax);
  const contact = asRecord(merged.contact);
  const agent = asRecord(merged.agent);
  const bank = asRecord(merged.bank);
  const coa = asRecord(merged.change_of_accountant);
  const prevAddr = asRecord(coa?.["previous_accountant_address"] ?? coa?.["previousAccountantAddress"]);
  const auth = asRecord(merged.authorization);
  const ch = asRecord(merged.companies_house);
  const accounts = asRecord(ch?.["accounts"]);
  const cs = asRecord(ch?.["confirmation_statement"]) ?? asRecord(ch?.["annual_return"]);
  const sv = asRecord(merged.services);
  const payroll = sv ? asRecord(sv.payroll) : null;
  const directors = Array.isArray(merged.directors) ? merged.directors : [];
  const d1 = asRecord(directors[0]);

  const turnover =
    customer.annualTurnoverGbp != null && customer.annualTurnoverGbp !== ("" as unknown)
      ? formatTurnover(customer.annualTurnoverGbp)
      : formatTurnover(merged["annual_turnover_gbp"]);

  const joiningMonth = firstNonEmpty(
    pickStr(merged, ["joining_month"]),
    pickStr(merged, ["joiningMonth"]),
    customer.createdAt ? formatTs(customer.createdAt).slice(0, 7) : "",
  );

  const clearance = firstNonEmpty(pickStr(merged, ["clearance"]), pickStr(merged, ["clearance_status"]));

  const chEmail = firstNonEmpty(
    pickStr(merged, ["ch_email"]),
    pickStr(merged, ["chEmail"]),
    pickStr(merged, ["companies_house_email"]),
    pickStr(contact, ["email"]),
  );

  const authCode = firstNonEmpty(
    pickStr(merged, ["auth_code"]),
    pickStr(merged, ["authCode"]),
    pickStr(merged, ["companies_house_auth_code"]),
    pickStr(tax, ["auth_code"]),
  );

  const filingMonth = firstNonEmpty(pickStr(merged, ["filing_month"]), pickStr(merged, ["filingMonth"]));

  const accountsDue = firstNonEmpty(
    accounts?.["next_accounts_due_on"] != null ? formatDay(String(accounts["next_accounts_due_on"])) : "",
    pickStr(merged, ["accounts_fd"]),
    pickStr(merged, ["accountsFd"]),
  );

  const confirmationDue = firstNonEmpty(
    cs?.["next_due"] != null ? formatDay(String(cs["next_due"])) : "",
    pickStr(merged, ["cs"]),
    pickStr(merged, ["confirmation_stmt"]),
  );

  const vatRegDate = firstNonEmpty(
    pickStr(tax, ["vat_registration_date"]),
    pickStr(tax, ["vat_reg_date"]),
    pickStr(merged, ["vat_reg_date"]),
  );

  const portalEmails =
    customer.customerUsers
      ?.map((cu) => cu.user?.email?.trim())
      .filter((e): e is string => !!e && e.length > 0)
      .join(", ") ?? "";

  const planName =
    typeof customer.plan?.name === "string" && customer.plan.name.trim() ? customer.plan.name.trim() : "";

  const formStatus = formatCustomerAccountStatusForExport(customer, latest);

  const traderSame =
    company?.["trader_same_as_registered"] ?? company?.["traderSameAsRegistered"] ?? company?.["trader_same_as_reg"];

  switch (id) {
    case "name":
      return customer.name ?? "";
    case "customerId":
      return customer.id;
    case "createdAt":
      return formatTs(customer.createdAt);
    case "updatedAt":
      return formatTs(customer.updatedAt);
    case "annualTurnoverGbp":
      return turnover;
    case "subscriptionPlan":
      return planName;
    case "planId":
      return customer.planId ?? "";
    case "portalUsers":
      return portalEmails;
    case "threeKRef":
      return derived.threeKRef;
    case "entityType":
      return firstNonEmpty(pickStr(company, ["type"]), pickStr(company, ["business_type"]));
    case "industryGroup":
      return pickStr(company, ["nature_of_business"]);
    case "joiningMonth":
      return joiningMonth;
    case "numberOfStores":
      return payroll?.["employee_count"] != null && typeof payroll["employee_count"] === "number"
        ? String(payroll["employee_count"])
        : pickStr(payroll, ["employee_count"]);
    case "clearance":
      return clearance;
    case "formStatus":
      return formStatus;
    case "kycStatus":
      return kycDisplay(derived.kycStatus);
    case "contactEmail":
      return derived.email;
    case "contactPhone":
      return pickStr(contact, ["phone"]);
    case "registeredLine1":
      return derived.addressLine1;
    case "registeredCity":
      return derived.city;
    case "registeredPostcode":
      return derived.postCode;
    case "registeredCountry":
      return reg ? firstNonEmpty(pickStr(reg, ["country"])) : "";
    case "tradingSameAsRegistered":
      return yn(traderSame);
    case "tradingLine1":
      return trader ? firstNonEmpty(pickStr(trader, ["line1"]), pickStr(trader, ["line_1"])) : "";
    case "tradingCity":
      return trader ? pickStr(trader, ["city"]) : "";
    case "tradingPostcode":
      return trader
        ? firstNonEmpty(pickStr(trader, ["postcode"]), pickStr(trader, ["post_code"]), pickStr(trader, ["postalCode"]))
        : "";
    case "tradingCountry":
      return trader ? pickStr(trader, ["country"]) : "";
    case "companyStatus":
      return firstNonEmpty(pickStr(company, ["company_status"]), pickStr(company, ["companyStatus"]));
    case "jurisdiction":
      return pickStr(company, ["jurisdiction"]);
    case "vatNumber":
      return derived.vatNumber;
    case "vatRegDate":
      return vatRegDate;
    case "vatQuarterEnd":
      return firstNonEmpty(pickStr(tax, ["vat_quarter"]), pickStr(tax, ["vatQuarter"]));
    case "niNumber":
      return pickStr(tax, ["ni_number"]);
    case "cisReference":
      return pickStr(tax, ["cis_reference"]);
    case "paye":
      return truthySvc(payroll?.enabled) ? "Yes" : payroll && payroll.enabled === false ? "No" : "";
    case "payeFrequency":
      return pickStr(payroll, ["frequency"]);
    case "payeReference":
      return pickStr(tax, ["paye_ref"]);
    case "companyRegNo":
      return derived.companyRegNo;
    case "companyRegDate":
      return company?.["date_of_creation"] != null ? formatDay(String(company["date_of_creation"])) : "";
    case "chEmail":
      return chEmail;
    case "utr":
      return derived.utr;
    case "authCode":
      return authCode;
    case "yearEnd":
      return derived.yearEnd;
    case "filingMonth":
      return filingMonth;
    case "accountsFilingDue":
      return accountsDue;
    case "confirmationStatement":
      return confirmationDue;
    case "agentName":
      return pickStr(agent, ["name"]);
    case "agentAddress":
      return pickStr(agent, ["address"]);
    case "agentPostcode":
      return pickStr(agent, ["postcode"]);
    case "agentPhone":
      return pickStr(agent, ["phone"]);
    case "agentCodeSa":
      return pickStr(agent, ["agent_code_sa"]);
    case "agentCodeCt":
      return pickStr(agent, ["agent_code_ct"]);
    case "agentClientReference":
      return firstNonEmpty(pickStr(agent, ["client_reference"]), pickStr(agent, ["clientReference"]));
    case "bankAccountHolder":
      return pickStr(bank, ["account_holder_name"]);
    case "bankSortCode":
      return pickStr(bank, ["sort_code"]);
    case "bankAccountNumber":
      return pickStr(bank, ["account_number"]);
    case "bankAddress":
      return pickStr(bank, ["bank_address"]);
    case "previousAccountant":
      return pickStr(coa, ["previous_accountant_name"]);
    case "previousAccountantAddress": {
      if (!coa) return "";
      const parts = [
        pickStr(prevAddr, ["line1"]),
        pickStr(prevAddr, ["city"]),
        pickStr(prevAddr, ["postcode"]),
        pickStr(prevAddr, ["country"]),
      ].filter((p) => p.trim());
      return parts.join(", ");
    }
    case "taxAuthSelfAssessment":
      return yn(auth?.["self_assessment"] ?? auth?.["selfAssessment"]);
    case "taxAuthPartnership":
      return yn(auth?.["partnership"]);
    case "taxAuthTrust":
      return yn(auth?.["trust"]);
    case "taxAuthVat":
      return yn(auth?.["vat"]);
    case "taxAuthPaye":
      return yn(auth?.["paye"]);
    case "servicesInPack":
      return derived.servicesInPack || servicesInPackList(merged);
    case "director1Name":
      return derived.director1Name;
    default:
      return "";
  }
}

export function buildCustomerSummaryExportRow(
  customer: SummaryCustomer,
  latest: LatestSubmissionExport,
  columnIds: string[],
): { headers: string[]; values: string[] } {
  const merged: Record<string, unknown> = {
    ...(latest?.data ?? {}),
    ...(customer.onboardingData ?? {}),
  };
  const planName =
    typeof customer.plan?.name === "string" && customer.plan.name.trim() ? customer.plan.name.trim() : "";
  const derived = mapMergedOnboarding(merged, planName || null);
  const headers = columnIds.map((id) => summaryExportLabel(id));
  const values = columnIds.map((id) => cellValue(id, customer, latest, merged, derived));
  return { headers, values };
}

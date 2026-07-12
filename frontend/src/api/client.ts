import { getApiBase } from "../constants";
import { inferUploadMimeType } from "../utils/uploadableFiles";
import type {
  CompaniesHouseSearchResponse,
  CompanyLookupCompleteResponse,
  CompanyLookupPatch,
  CustomerOnboardingData,
} from "../types/customerOnboarding";
import type {
  CreateSubscriptionPlanPayload,
  UpdateSubscriptionPlanPayload,
  CrudListResponse,
  Customer,
  CustomerAccountStatus,
  CustomerFormSubmission,
  CustomerFormSubmissionStatusesResponse,
  CustomerPageWithSubmissionResponse,
  CustomerPageRowWithSubmission,
  CompaniesHouseDashboardAggregatesResponse,
  OnboardingDashboardSortFieldsResponse,
  OnboardingDocusealSignatureTarget,
  CustomerInvoiceDetail,
  CustomerInvoiceRow,
  CustomerStatementDetail,
  CustomerStatementRow,
  DriveFile,
  ExtractConfig,
  JobCostSummary,
  TokenBurnReport,
  AiPricingRow,
  JobRow,
  JobStatusCounts,
  PgBossDashboard,
  PortalLibraryDocumentRow,
  AdminLibraryDocumentRow,
  PortalLibraryFolderRow,
  PortalLibrarySection,
  LibraryFolderBrowseScope,
  LibraryDateBrowseLevel,
  PortalLibraryTreeResponse,
  PortalSupplierOption,
  BundlePlanDetail,
  BundlePlanListItem,
  PlanAssignedCustomerRow,
  CatalogServiceListItem,
  PlanBundleServiceRow,
  CustomerDocumentUploadDashboardResponse,
  CreateSubscriptionBundlePayload,
  CreateSubscriptionBundleResponse,
  SubscriptionPlan,
  SubscriptionPlanWithRecommendation,
  RecommendSubscriptionPlansResponse,
  SubscriptionPlanPricingBreakdown,
  PlanRecommendFeatureRow,
  AdminPermissionCatalogResponse,
  AdminPracticeUserCreatedResponse,
  AdminPracticeUserCustomerAssignmentRow,
  AdminDefaultFolderCandidate,
  AdminDefaultFolderAssignment,
  AdminRestrictedFolderCandidate,
  AdminRestrictedFolderAssignment,
  AdminPracticeUserRow,
  AdminRoleRow,
  RoleType,
  DocumentAssigneeCandidate,
  DocumentAssigneeRow,
  FileDocumentAccessSummary,
  GlobalFolderRow,
} from "../types/api";
import { docusealPrefillForSignatureTarget } from "../utils/docusealPrefillFromOnboarding";

export function crudListData<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === "object" && "data" in body && Array.isArray((body as { data: unknown }).data)) {
    return (body as { data: T[] }).data;
  }
  return [];
}

/** Uses Nest-style JSON `{ message: string | string[] }` when present so validation/conflicts read cleanly in the UI. */
async function readApiErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { message?: unknown };
    if (typeof j.message === "string" && j.message.trim()) return j.message.trim();
    if (Array.isArray(j.message) && j.message.length > 0) {
      const parts = j.message.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
      if (parts.length > 0) return parts.join(". ");
    }
  } catch {
    /* plain text body */
  }
  return text.trim() || `Request failed (${res.status})`;
}

type CrudQuery = {
  page?: number;
  limit?: number;
  sort?: string;
  search?: Record<string, unknown>;
  filters?: string[];
  joins?: string[];
};

function buildCrudQuery(q: CrudQuery): string {
  const params = new URLSearchParams();
  if (q.page) params.set("page", String(q.page));
  if (q.limit) params.set("limit", String(q.limit));
  if (q.sort) params.set("sort", q.sort);
  if (q.search) params.set("s", JSON.stringify(q.search));
  for (const f of q.filters ?? []) params.append("filter", f);
  for (const j of q.joins ?? []) params.append("join", j);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function crudListResponse<T>(body: unknown, fallbackPage = 1, fallbackLimit = 10): CrudListResponse<T> {
  const data = crudListData<T>(body);
  if (body && typeof body === "object" && "total" in body) {
    const shaped = body as { data: T[]; total: number; page: number; pageCount: number };
    return {
      data: Array.isArray(shaped.data) ? shaped.data : data,
      total: typeof shaped.total === "number" ? shaped.total : data.length,
      page: typeof shaped.page === "number" ? shaped.page : fallbackPage,
      pageCount:
        typeof shaped.pageCount === "number"
          ? shaped.pageCount
          : Math.max(1, Math.ceil((typeof shaped.total === "number" ? shaped.total : data.length) / fallbackLimit)),
    };
  }
  return { data, total: data.length, page: fallbackPage, pageCount: 1 };
}

export type FetchCustomersOptions = {
  /** Only `accountStatus === "active"` (excludes draft/inactive/proposed and archived rows). */
  activeOnly?: boolean;
};

/**
 * Customer picker for staff toolbars (Jobs, Files, etc.).
 * Accountants/managers without `customer:read` still see assigned customers via library filter API.
 */
export async function fetchStaffScopedActiveCustomers(
  apiBase: string,
  headers: HeadersInit,
  scope: { canReadCustomers: boolean; canReadFiles: boolean },
): Promise<Customer[]> {
  if (scope.canReadCustomers) {
    return fetchCustomers(apiBase, headers, { activeOnly: true });
  }
  if (scope.canReadFiles) {
    const rows = await fetchLibraryCustomerFilterOptions(apiBase, headers);
    return rows.map(
      (row): Customer => ({
        id: row.id,
        name: row.name,
        accountStatus: "active",
      }),
    );
  }
  return [];
}

/** All customer statuses for report filters when staff has `customer:read`. */
export async function fetchReportScopeCustomers(
  apiBase: string,
  headers: HeadersInit,
  scope: { canReadCustomers: boolean; canReadFiles: boolean },
): Promise<Customer[]> {
  if (scope.canReadCustomers) {
    return fetchAllCustomersForStaffAssignment(apiBase, headers);
  }
  return fetchStaffScopedActiveCustomers(apiBase, headers, scope);
}

export async function fetchCustomers(
  apiBase: string,
  headers: HeadersInit,
  options?: FetchCustomersOptions,
): Promise<Customer[]> {
  const params = new URLSearchParams();
  if (options?.activeOnly) {
    params.set("filter", "accountStatus||$eq||active");
    params.set("limit", "500");
    params.set("sort", "name,ASC");
  }
  const qs = params.toString();
  const url = qs ? `${apiBase}/api/customers?${qs}` : `${apiBase}/api/customers`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return crudListData<Customer>(json);
}

export async function fetchCustomersList(
  apiBase: string,
  headers: HeadersInit,
  query: { page: number; limit: number; sort: string; searchText?: string; activeOnly?: boolean },
): Promise<CrudListResponse<Customer>> {
  const where = query.searchText?.trim()
    ? { name: { $contL: query.searchText.trim() } }
    : undefined;
  const filters = query.activeOnly ? ["accountStatus||$eq||active"] : undefined;
  const qs = buildCrudQuery({
    page: query.page,
    limit: query.limit,
    sort: query.sort,
    search: where,
    filters,
  });
  const res = await fetch(`${apiBase}/api/customers${qs}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return crudListResponse<Customer>(await res.json(), query.page, query.limit);
}

export async function fetchCustomersPageWithSubmissionData(
  apiBase: string,
  headers: HeadersInit,
  query: {
    page: number;
    limit: number;
    sort?: string;
    /** `fieldId,ASC|DESC` from onboarding dashboard sort catalog */
    onboardingSort?: string;
    searchText?: string;
    filters?: CustomersPageListFilters;
  },
): Promise<CustomerPageWithSubmissionResponse> {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("limit", String(query.limit));
  const s = query.sort?.trim();
  if (s) params.set("sort", s);
  const os = query.onboardingSort?.trim();
  if (os) params.set("onboardingSort", os);
  const f = query.filters ?? {};
  const search = (query.searchText ?? f.search)?.trim();
  if (search) params.set("search", search);
  if (f.createdFrom?.trim()) params.set("createdFrom", f.createdFrom.trim());
  if (f.createdTo?.trim()) params.set("createdTo", f.createdTo.trim());
  if (f.updatedFrom?.trim()) params.set("updatedFrom", f.updatedFrom.trim());
  if (f.updatedTo?.trim()) params.set("updatedTo", f.updatedTo.trim());
  if (f.formStatus && f.formStatus !== "all") params.set("formStatus", f.formStatus);
  if (f.accountStatusIn?.length) params.set("accountStatusIn", f.accountStatusIn.join(","));
  else if (f.accountStatus && f.accountStatus !== "all") params.set("accountStatus", f.accountStatus);
  const res = await fetch(`${apiBase}/api/customers/page-with-submission-data?${params}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CustomerPageWithSubmissionResponse>;
}

const ONBOARDING_DASHBOARD_PAGE_MAX = 100;
const ONBOARDING_DASHBOARD_FETCH_MAX_PAGES = 500;

/**
 * Loads every customer row for the same filters as {@link fetchCustomersPageWithSubmissionData},
 * paging until the server reports no further pages (max {@link ONBOARDING_DASHBOARD_FETCH_MAX_PAGES} pages).
 */
export async function fetchAllCustomersPageWithSubmissionData(
  apiBase: string,
  headers: HeadersInit,
  query: {
    sort?: string;
    onboardingSort?: string;
    searchText?: string;
    filters?: CustomersPageListFilters;
  },
): Promise<CustomerPageRowWithSubmission[]> {
  const limit = ONBOARDING_DASHBOARD_PAGE_MAX;
  const out: CustomerPageRowWithSubmission[] = [];
  let page = 1;
  let pageCount = 1;
  while (page <= pageCount && page <= ONBOARDING_DASHBOARD_FETCH_MAX_PAGES) {
    const res = await fetchCustomersPageWithSubmissionData(apiBase, headers, {
      page,
      limit,
      sort: query.sort ?? "name,ASC",
      onboardingSort: query.onboardingSort,
      searchText: query.searchText,
      filters: query.filters,
    });
    out.push(...res.data);
    pageCount = res.pageCount;
    page += 1;
  }
  return out;
}

/** All non-archived customers (every account status) for Settings → Users assignment picker. */
export async function fetchAllCustomersForStaffAssignment(
  apiBase: string,
  headers: HeadersInit,
): Promise<Customer[]> {
  const rows = await fetchAllCustomersPageWithSubmissionData(apiBase, headers, {
    sort: "name,ASC",
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    accountStatus: row.accountStatus ?? "draft",
  }));
}

export async function fetchOnboardingDashboardSortFields(
  apiBase: string,
  headers: HeadersInit,
): Promise<OnboardingDashboardSortFieldsResponse> {
  const res = await fetch(`${apiBase}/api/customers/onboarding-dashboard-sort-fields`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<OnboardingDashboardSortFieldsResponse>;
}

export type CompanyRegistrationConflictResponse = {
  conflict: boolean;
  customerId?: string;
  customerName?: string;
};

/** `GET /api/customers/company-registration-conflict` — duplicate UK company / CH number across customers. */
export async function fetchCompanyRegistrationConflict(
  apiBase: string,
  headers: HeadersInit,
  number: string,
  excludeCustomerId?: string | null,
): Promise<CompanyRegistrationConflictResponse> {
  const params = new URLSearchParams();
  params.set("number", number.trim());
  const ex = excludeCustomerId?.trim();
  if (ex) params.set("excludeCustomerId", ex);
  const res = await fetch(`${apiBase}/api/customers/company-registration-conflict?${params}`, { headers });
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.json() as Promise<CompanyRegistrationConflictResponse>;
}

export async function fetchCompaniesHouseDashboardAggregates(
  apiBase: string,
  headers: HeadersInit,
): Promise<CompaniesHouseDashboardAggregatesResponse> {
  const res = await fetch(`${apiBase}/api/customers/companies-house-dashboard-aggregates`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CompaniesHouseDashboardAggregatesResponse>;
}

function parseSubscriptionPlansResponse(body: unknown): SubscriptionPlan[] {
  if (Array.isArray(body)) return body as SubscriptionPlan[];
  if (body && typeof body === "object" && "data" in body && Array.isArray((body as { data: unknown }).data)) {
    return (body as { data: SubscriptionPlan[] }).data;
  }
  return [];
}

function normalizePlanActiveFlags<T extends SubscriptionPlan>(r: T): T & { isActive: boolean; is_active: boolean } {
  let merged: unknown = true;
  if (r.isActive !== undefined && r.isActive !== null) {
    merged = r.isActive;
  } else if (r.is_active !== undefined && r.is_active !== null) {
    merged = r.is_active;
  }
  const isActive =
    merged === false ||
    merged === 0 ||
    merged === "0" ||
    merged === "false" ||
    merged === "f" ||
    merged === "F"
      ? false
      : true;
  return { ...r, isActive, is_active: isActive };
}

export async function fetchSubscriptionPlans(
  apiBase: string,
  headers: HeadersInit,
): Promise<SubscriptionPlan[]> {
  const res = await fetch(`${apiBase}/api/subscription-plans`, { headers });
  if (!res.ok) throw new Error(await res.text());
  const body: unknown = await res.json();
  const list = parseSubscriptionPlansResponse(body);
  return list.map((row) => normalizePlanActiveFlags(row as SubscriptionPlan));
}

/** Active plans for a turnover value; `recommended` is true when turnover falls in the plan band. */
export async function fetchSubscriptionPlansByTurnover(
  apiBase: string,
  headers: HeadersInit,
  annualTurnoverGbp: number,
): Promise<SubscriptionPlanWithRecommendation[]> {
  const res = await fetch(`${apiBase}/api/subscription-plans/by-turnover`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ annualTurnoverGbp }),
  });
  if (!res.ok) throw new Error(await res.text());
  const body: unknown = await res.json();
  const list = Array.isArray(body) ? body : [];
  return list.map((row) => {
    const r = row as SubscriptionPlanWithRecommendation;
    const recommended = r.recommended === true;
    return { ...normalizePlanActiveFlags(r), recommended };
  });
}

export type RecommendSubscriptionPlansBody = {
  customerType: string;
  billingCycle: string;
  turnover: number;
  payeeUsers: number;
  isDormant?: boolean;
  /** When set, only plans linked to every listed active catalogue service (`plan_service`). */
  serviceIds?: string[];
};

function parseNestedNum(obj: Record<string, unknown>, key: string): number {
  const v = obj[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseSubscriptionPlanPricingFromApi(pricing: Record<string, unknown>): SubscriptionPlanPricingBreakdown {
  const num = (k: string) => parseNestedNum(pricing, k);
  const out: SubscriptionPlanPricingBreakdown = {
    base: num("base"),
    turnoverExtra: num("turnoverExtra"),
    payrollExtra: num("payrollExtra"),
    dormant: num("dormant"),
    vat: num("vat"),
    final: num("final"),
  };
  if (pricing.vatPercent !== undefined) {
    const v = num("vatPercent");
    if (Number.isFinite(v)) out.vatPercent = v;
  }
  if (pricing.subtotalBeforeVat !== undefined) {
    const v = num("subtotalBeforeVat");
    if (Number.isFinite(v)) out.subtotalBeforeVat = v;
  }
  const ted = pricing.turnoverExtensionDetail;
  if (ted && typeof ted === "object" && !Array.isArray(ted)) {
    const o = ted as Record<string, unknown>;
    const blocks = Math.max(0, Math.floor(parseNestedNum(o, "blocks")));
    const step = parseNestedNum(o, "step");
    const costPerBlock = parseNestedNum(o, "costPerBlock");
    const bandCeiling = parseNestedNum(o, "bandCeiling");
    if (blocks > 0 && step > 0) {
      out.turnoverExtensionDetail = { blocks, step, costPerBlock, bandCeiling };
    }
  }
  const ped = pricing.payrollExtraDetail;
  if (ped && typeof ped === "object" && !Array.isArray(ped)) {
    const o = ped as Record<string, unknown>;
    const extraPayees = Math.max(0, Math.floor(parseNestedNum(o, "extraPayees")));
    const ratePerPayee = parseNestedNum(o, "ratePerPayee");
    if (extraPayees > 0 && ratePerPayee >= 0) {
      out.payrollExtraDetail = { extraPayees, ratePerPayee };
    }
  }
  const ded = pricing.dormantDetail;
  if (ded && typeof ded === "object" && !Array.isArray(ded)) {
    const o = ded as Record<string, unknown>;
    const flatFee = parseNestedNum(o, "flatFee");
    if (flatFee > 0) out.dormantDetail = { flatFee };
  }
  return out;
}

function parsePlanRecommendFeatureMatrix(raw: unknown): PlanRecommendFeatureRow[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const rows: PlanRecommendFeatureRow[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object" || Array.isArray(it)) continue;
    const o = it as Record<string, unknown>;
    const serviceId = String(o.serviceId ?? "").trim();
    if (!serviceId) continue;
    const name = String(o.name ?? "").trim() || serviceId;
    const st = o.status;
    const status: PlanRecommendFeatureRow["status"] =
      st === "included" || st === "addon" || st === "not_offered" ? st : "not_offered";
    rows.push({ serviceId, name, status });
  }
  return rows.length ? rows : undefined;
}

/** Matrix plans filtered and priced for onboarding (customer type, billing cycle, turnover, payees). */
export async function fetchRecommendSubscriptionPlans(
  apiBase: string,
  headers: HeadersInit,
  body: RecommendSubscriptionPlansBody,
): Promise<RecommendSubscriptionPlansResponse> {
  const res = await fetch(`${apiBase}/api/subscriptions/recommend`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      customerType: body.customerType,
      billingCycle: body.billingCycle,
      turnover: body.turnover,
      payeeUsers: body.payeeUsers,
      ...(body.isDormant !== undefined ? { isDormant: body.isDormant } : {}),
      ...(body.serviceIds?.length ? { serviceIds: body.serviceIds } : {}),
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const raw: unknown = await res.json();
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const plansRaw = o.plans;
  const plans = Array.isArray(plansRaw) ? plansRaw : [];
  const recommendedPlan = typeof o.recommendedPlan === "string" ? o.recommendedPlan : "";
  const billingCycleFallback = o.billingCycleFallback === true;
  return {
    recommendedPlan,
    billingCycleFallback,
    plans: plans.map((row) => {
      const r = row as Record<string, unknown>;
      const pricing =
        r.pricing && typeof r.pricing === "object" && !Array.isArray(r.pricing)
          ? (r.pricing as Record<string, unknown>)
          : {};
      const payrollLimitRaw = r.payrollLimit;
      const payrollLimit =
        typeof payrollLimitRaw === "number" && Number.isFinite(payrollLimitRaw)
          ? payrollLimitRaw
          : Number(payrollLimitRaw) || 0;
      return {
        planId: String(r.planId ?? ""),
        plan: String(r.plan ?? ""),
        payrollLimit,
        pricing: parseSubscriptionPlanPricingFromApi(pricing),
        featureMatrix: parsePlanRecommendFeatureMatrix(r.featureMatrix),
      };
    }),
  };
}

export async function createSubscriptionPlan(
  apiBase: string,
  headers: HeadersInit,
  body: CreateSubscriptionPlanPayload,
): Promise<SubscriptionPlan> {
  const res = await fetch(`${apiBase}/api/subscription-plans`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  return res.json() as Promise<SubscriptionPlan>;
}

/** Staff bundle: `plans` + pricing matrix + rules + limit + optional addons (`POST /api/subscriptions`). */
export async function createStaffSubscriptionBundle(
  apiBase: string,
  headers: HeadersInit,
  body: CreateSubscriptionBundlePayload,
): Promise<CreateSubscriptionBundleResponse> {
  const res = await fetch(`${apiBase}/api/subscriptions`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  return res.json() as Promise<CreateSubscriptionBundleResponse>;
}

export async function putStaffSubscriptionBundle(
  apiBase: string,
  headers: HeadersInit,
  planId: string,
  body: CreateSubscriptionBundlePayload,
): Promise<CreateSubscriptionBundleResponse> {
  const res = await fetch(`${apiBase}/api/subscriptions/${planId}`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  return res.json() as Promise<CreateSubscriptionBundleResponse>;
}

/** Matrix / bundle plans stored in `plans` (not legacy `subscription_plans`). */
function parsePlanBundleServiceRow(raw: unknown): PlanBundleServiceRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const planServiceId = String(r.planServiceId ?? "").trim();
  const serviceId = String(r.serviceId ?? "").trim();
  if (!planServiceId || !serviceId) return null;
  const price = typeof r.price === "number" ? r.price : Number(r.price);
  return {
    planServiceId,
    serviceId,
    name: String(r.name ?? ""),
    description: r.description === null || r.description === undefined ? null : String(r.description),
    price: Number.isFinite(price) ? price : 0,
    isActive: r.isActive !== false,
    isIncluded: Boolean(r.isIncluded),
  };
}

export async function fetchBundleSubscriptionPlanById(
  apiBase: string,
  headers: HeadersInit,
  planId: string,
): Promise<BundlePlanDetail> {
  const res = await fetch(`${apiBase}/api/subscriptions/${planId}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  const body: unknown = await res.json();
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const psRaw = b.planServices;
  const planServices = Array.isArray(psRaw)
    ? (psRaw.map(parsePlanBundleServiceRow).filter(Boolean) as PlanBundleServiceRow[])
    : [];
  return { ...(body as BundlePlanDetail), planServices };
}

/** All catalogue `services`, or only those linked to `planId` when set. Use `activeOnly` for onboarding pickers. */
export async function fetchSubscriptionCatalogServices(
  apiBase: string,
  headers: HeadersInit,
  planId?: string | null,
  options?: { activeOnly?: boolean },
): Promise<CatalogServiceListItem[]> {
  const params = new URLSearchParams();
  if (planId?.trim()) params.set("planId", planId.trim());
  if (options?.activeOnly) params.set("activeOnly", "true");
  const q = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${apiBase}/api/subscriptions/services${q}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  const body: unknown = await res.json();
  if (!Array.isArray(body)) return [];
  return body.map((row) => {
    const r = row as Record<string, unknown>;
    const planServiceIdRaw = r.planServiceId;
    const price = typeof r.price === "number" ? r.price : Number(r.price);
    return {
      planServiceId:
        planServiceIdRaw === null || planServiceIdRaw === undefined || String(planServiceIdRaw).trim() === ""
          ? null
          : String(planServiceIdRaw).trim(),
      serviceId: String(r.serviceId ?? ""),
      name: String(r.name ?? ""),
      description: r.description === null || r.description === undefined ? null : String(r.description),
      price: Number.isFinite(price) ? price : 0,
      isActive: r.isActive !== false,
      isIncluded: Boolean(r.isIncluded),
    };
  });
}

export async function attachServiceToPlanForBundle(
  apiBase: string,
  headers: HeadersInit,
  planId: string,
  body: { serviceId: string; isIncluded: boolean },
): Promise<{ planServiceId: string; serviceId: string; isIncluded: boolean }> {
  const res = await fetch(`${apiBase}/api/subscriptions/services/plans/${encodeURIComponent(planId)}/link`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ serviceId: body.serviceId, isIncluded: body.isIncluded }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ planServiceId: string; serviceId: string; isIncluded: boolean }>;
}

export async function createServiceForPlanOnBundle(
  apiBase: string,
  headers: HeadersInit,
  planId: string,
  body: {
    name: string;
    description?: string;
    price?: number;
    isActive?: boolean;
    isIncluded: boolean;
  },
): Promise<{
  serviceId: string;
  planServiceId: string;
  name: string;
  description: string | null;
  price: number;
  isActive: boolean;
  isIncluded: boolean;
}> {
  const res = await fetch(`${apiBase}/api/subscriptions/services/plans/${encodeURIComponent(planId)}/create`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    serviceId: string;
    planServiceId: string;
    name: string;
    description: string | null;
    price: number;
    isActive: boolean;
    isIncluded: boolean;
  }>;
}

export async function removePlanServiceLink(
  apiBase: string,
  headers: HeadersInit,
  planServiceId: string,
): Promise<void> {
  const res = await fetch(
    `${apiBase}/api/subscriptions/services/links/${encodeURIComponent(planServiceId)}`,
    { method: "DELETE", headers },
  );
  if (!res.ok) throw new Error(await res.text());
}

export async function createSubscriptionCatalogService(
  apiBase: string,
  headers: HeadersInit,
  body: { name: string; description?: string; price?: number; isActive?: boolean },
): Promise<CatalogServiceListItem> {
  const res = await fetch(`${apiBase}/api/subscriptions/services`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  const row = (await res.json()) as Record<string, unknown>;
  const price = typeof row.price === "number" ? row.price : Number(row.price);
  return {
    planServiceId: null,
    serviceId: String(row.serviceId ?? ""),
    name: String(row.name ?? ""),
    description: row.description === null || row.description === undefined ? null : String(row.description),
    price: Number.isFinite(price) ? price : 0,
    isActive: row.isActive !== false,
    isIncluded: Boolean(row.isIncluded),
  };
}

export async function updateSubscriptionCatalogService(
  apiBase: string,
  headers: HeadersInit,
  serviceId: string,
  body: { name?: string; description?: string | null; price?: number; isActive?: boolean },
): Promise<CatalogServiceListItem> {
  const res = await fetch(`${apiBase}/api/subscriptions/services/${encodeURIComponent(serviceId)}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  const row = (await res.json()) as Record<string, unknown>;
  const price = typeof row.price === "number" ? row.price : Number(row.price);
  return {
    planServiceId: null,
    serviceId: String(row.serviceId ?? serviceId),
    name: String(row.name ?? ""),
    description: row.description === null || row.description === undefined ? null : String(row.description),
    price: Number.isFinite(price) ? price : 0,
    isActive: row.isActive !== false,
    isIncluded: Boolean(row.isIncluded),
  };
}

export async function deleteSubscriptionCatalogService(
  apiBase: string,
  headers: HeadersInit,
  serviceId: string,
): Promise<void> {
  const res = await fetch(`${apiBase}/api/subscriptions/services/${encodeURIComponent(serviceId)}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function fetchBundleSubscriptionPlans(
  apiBase: string,
  headers: HeadersInit,
): Promise<BundlePlanListItem[]> {
  const res = await fetch(`${apiBase}/api/subscriptions`, { headers });
  if (!res.ok) throw new Error(await res.text());
  const body: unknown = await res.json();
  if (!Array.isArray(body)) return [];
  return (body as BundlePlanListItem[]).map((row) => {
    const legacy = row as BundlePlanListItem & { customerTypeName?: string };
    const customerTypeNames = Array.isArray(row.customerTypeNames)
      ? row.customerTypeNames
      : typeof legacy.customerTypeName === "string" && legacy.customerTypeName
        ? [legacy.customerTypeName]
        : [];
    return {
      ...row,
      isActive: row.isActive !== false,
      customerTypeNames,
      assignedCustomerCount:
        typeof row.assignedCustomerCount === "number" && Number.isFinite(row.assignedCustomerCount)
          ? row.assignedCustomerCount
          : 0,
    };
  });
}

export async function fetchBundlePlanAssignedCustomers(
  apiBase: string,
  headers: HeadersInit,
  planId: string,
): Promise<PlanAssignedCustomerRow[]> {
  const res = await fetch(
    `${apiBase}/api/subscriptions/${encodeURIComponent(planId)}/assigned-customers`,
    { headers },
  );
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  const body: unknown = await res.json();
  return Array.isArray(body) ? (body as PlanAssignedCustomerRow[]) : [];
}

export async function patchBundlePlanActive(
  apiBase: string,
  headers: HeadersInit,
  planId: string,
  isActive: boolean,
): Promise<{ id: string; isActive: boolean }> {
  const res = await fetch(`${apiBase}/api/subscriptions/${planId}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ isActive }),
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  return res.json() as Promise<{ id: string; isActive: boolean }>;
}

export async function deleteBundleSubscriptionPlan(
  apiBase: string,
  headers: HeadersInit,
  planId: string,
): Promise<void> {
  const res = await fetch(`${apiBase}/api/subscriptions/${encodeURIComponent(planId)}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
}

export async function updateSubscriptionPlan(
  apiBase: string,
  headers: HeadersInit,
  planId: string,
  body: UpdateSubscriptionPlanPayload,
): Promise<SubscriptionPlan> {
  const res = await fetch(`${apiBase}/api/subscription-plans/${planId}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  return res.json() as Promise<SubscriptionPlan>;
}

export async function deleteSubscriptionPlan(
  apiBase: string,
  headers: HeadersInit,
  planId: string,
): Promise<void> {
  const res = await fetch(`${apiBase}/api/subscription-plans/${planId}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function createFolder(
  apiBase: string,
  headers: HeadersInit,
  params: { customerId: string; parentId?: string | null; name: string }
): Promise<DriveFile> {
  const res = await fetch(`${apiBase}/api/files`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      customerId: params.customerId,
      parentId: params.parentId ?? null,
      fileType: "folder",
      name: params.name,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<DriveFile>;
}

export async function fetchCustomer(apiBase: string, headers: HeadersInit, id: string): Promise<Customer> {
  const res = await fetch(`${apiBase}/api/customers/${id}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  const row = (await res.json()) as Customer & { account_status?: CustomerAccountStatus };
  if (row.accountStatus == null && row.account_status != null) {
    return { ...row, accountStatus: row.account_status };
  }
  return row;
}

/** `DELETE /api/customers/:id` — soft-deletes the customer; only allowed when `accountStatus` is `draft`. */
export async function archiveDraftCustomer(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
): Promise<void> {
  const res = await fetch(`${apiBase}/api/customers/${encodeURIComponent(customerId)}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(await res.text());
}

export type CustomerExportFormat = "csv" | "xlsx";

export type CustomersListExportFormat = "csv" | "xlsx";

export type CustomersListExportFilters = {
  search?: string;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  formStatus?: "all" | "draft" | "completed";
  accountStatus?: "all" | "draft" | "active" | "inactive" | "proposed";
  accountStatusIn?: CustomerAccountStatus[];
};

export type CustomersPageListFilters = CustomersListExportFilters;

/** Tabular export from POST /customers/export-list (filters + column selection). */
export async function downloadCustomersListExport(
  apiBase: string,
  headers: HeadersInit,
  body: {
    format: CustomersListExportFormat;
    columns: string[];
    filters: CustomersListExportFilters;
  },
): Promise<void> {
  const res = await fetch(`${apiBase}/api/customers/export-list`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition");
  let filename = `customers_export.${body.format}`;
  const quoted = cd?.match(/filename="([^"]+)"/);
  if (quoted?.[1]) {
    filename = quoted[1];
  } else {
    const star = cd?.match(/filename\*=UTF-8''([^;\s]+)/i);
    if (star?.[1]) {
      try {
        filename = decodeURIComponent(star[1]);
      } catch {
        filename = star[1];
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type CustomersListExportPreviewResponse = {
  total: number;
  exportCap: number;
  exceedsExportCap: boolean;
  previewRowLimit: number;
  previewTruncated: boolean;
  matchingCustomers: { id: string; name: string }[];
  matchingCustomersTruncated: boolean;
  headers: string[];
  rows: string[][];
};

/** JSON preview for POST /customers/export-list (same filters + columns). */
export async function fetchCustomersListExportPreview(
  apiBase: string,
  headers: HeadersInit,
  body: {
    columns: string[];
    filters: CustomersListExportFilters;
    previewRowLimit?: number;
    matchingNameLimit?: number;
  },
): Promise<CustomersListExportPreviewResponse> {
  const res = await fetch(`${apiBase}/api/customers/export-list-preview`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CustomersListExportPreviewResponse>;
}

/** Downloads a wide export (header row = keys, one data row) from GET /customers/:id/export */
export async function downloadCustomerExport(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
  format: CustomerExportFormat,
): Promise<void> {
  const u = new URL(`${apiBase}/api/customers/${encodeURIComponent(customerId)}/export`);
  u.searchParams.set("format", format);
  const res = await fetch(u.toString(), { headers });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition");
  let filename = `customer_export.${format}`;
  const quoted = cd?.match(/filename="([^"]+)"/);
  if (quoted?.[1]) {
    filename = quoted[1];
  } else {
    const star = cd?.match(/filename\*=UTF-8''([^;\s]+)/i);
    if (star?.[1]) {
      try {
        filename = decodeURIComponent(star[1]);
      } catch {
        filename = star[1];
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type CustomerSummaryExportCatalogColumn = {
  id: string;
  label: string;
  defaultOn: boolean;
};

export type CustomerSummaryExportPreview = {
  headers: string[];
  values: string[];
};

/** GET /customers/summary-export-catalog */
export async function fetchCustomerSummaryExportCatalog(
  apiBase: string,
  headers: HeadersInit,
): Promise<{ columns: CustomerSummaryExportCatalogColumn[] }> {
  const res = await fetch(`${apiBase}/api/customers/summary-export-catalog`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ columns: CustomerSummaryExportCatalogColumn[] }>;
}

/** POST /customers/:id/summary-export-preview */
export async function postCustomerSummaryExportPreview(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
  columns: string[],
): Promise<CustomerSummaryExportPreview> {
  const res = await fetch(`${apiBase}/api/customers/${encodeURIComponent(customerId)}/summary-export-preview`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ columns }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CustomerSummaryExportPreview>;
}

/** POST /customers/:id/summary-export — one-row spreadsheet with selected human columns. */
export async function downloadCustomerSummaryExport(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
  format: CustomerExportFormat,
  columns: string[],
): Promise<void> {
  const res = await fetch(`${apiBase}/api/customers/${encodeURIComponent(customerId)}/summary-export`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ format, columns }),
  });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition");
  let filename = `customer_summary.${format}`;
  const quoted = cd?.match(/filename="([^"]+)"/);
  if (quoted?.[1]) {
    filename = quoted[1];
  } else {
    const star = cd?.match(/filename\*=UTF-8''([^;\s]+)/i);
    if (star?.[1]) {
      try {
        filename = decodeURIComponent(star[1]);
      } catch {
        filename = star[1];
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type CustomerDocumentsReportRequest = {
  customerId: string;
  from: string;
  to: string;
  layoutMode: "per_document" | "per_folder" | "per_date" | "invoice_register" | "statement_register";
  dateBasis?: "effective" | "uploaded";
  documentIds?: string[];
};

export type CustomerDocumentsExportCandidate = {
  id: string;
  name: string;
  folderPath: string;
  uploadedAt: string;
  documentType: string;
  invoiceEligible: boolean;
  statementEligible: boolean;
  extractionReady: boolean;
};

export type CustomerDocumentsExportJobRow = {
  id: string;
  customerId: string;
  status: "queued" | "processing" | "completed" | "failed";
  request: CustomerDocumentsReportRequest & { customerName?: string };
  xlsxFileName: string | null;
  documentCount: number;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

/** POST /admin/reports/customer-documents-export — queues background job (superadmin). */
export async function createCustomerDocumentsExport(
  apiBase: string,
  headers: HeadersInit,
  body: CustomerDocumentsReportRequest,
): Promise<CustomerDocumentsExportJobRow> {
  const res = await fetch(`${apiBase}/api/admin/reports/customer-documents-export`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CustomerDocumentsExportJobRow>;
}

/** GET /admin/reports/customer-documents-export/candidates */
export async function fetchCustomerDocumentsExportCandidates(
  apiBase: string,
  headers: HeadersInit,
  query: CustomerDocumentsReportRequest,
): Promise<CustomerDocumentsExportCandidate[]> {
  const params = new URLSearchParams();
  params.set("customerId", query.customerId);
  params.set("from", query.from);
  params.set("to", query.to);
  params.set("layoutMode", query.layoutMode);
  if (query.dateBasis) params.set("dateBasis", query.dateBasis);
  const res = await fetch(
    `${apiBase}/api/admin/reports/customer-documents-export/candidates?${params.toString()}`,
    { headers },
  );
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  return res.json() as Promise<CustomerDocumentsExportCandidate[]>;
}

export type FileActivityAction =
  | "uploaded"
  | "viewed"
  | "downloaded"
  | "deleted"
  | "assignees_updated"
  | "job_created"
  | "job_processing"
  | "job_completed"
  | "job_failed"
  | "job_cancelled";

export type FileActivityListItem = {
  id: string;
  createdAt: string;
  customerId: string;
  customerName: string | null;
  documentId: string | null;
  fileId: string | null;
  jobId: string | null;
  action: FileActivityAction;
  summary: string;
  metadata: Record<string, unknown>;
  actorUserId: string | null;
  actorDisplayName: string | null;
  actorKind: string;
  documentName: string | null;
};

export type FileActivityReportQuery = {
  page?: number;
  limit?: number;
  customerId?: string;
  documentId?: string;
  fileId?: string;
  action?: FileActivityAction;
  from?: string;
  to?: string;
  search?: string;
};

export type FileActivityReportResponse = {
  data: FileActivityListItem[];
  total: number;
  page: number;
  limit: number;
};

export type FileActivityDocumentSummary = {
  document: {
    id: string;
    name: string;
    customerId: string;
    fileId: string | null;
    createdAt: string;
  };
  customer: { id: string; name: string } | null;
  latestJob: {
    id: string;
    status: string;
    percentCompleted: number;
    updatedAt: string;
  } | null;
  eventCount: number;
};

function fileActivityQueryString(query: FileActivityReportQuery): string {
  const params = new URLSearchParams();
  if (query.page != null) params.set("page", String(query.page));
  if (query.limit != null) params.set("limit", String(query.limit));
  if (query.customerId?.trim()) params.set("customerId", query.customerId.trim());
  if (query.documentId?.trim()) params.set("documentId", query.documentId.trim());
  if (query.fileId?.trim()) params.set("fileId", query.fileId.trim());
  if (query.action) params.set("action", query.action);
  if (query.from?.trim()) params.set("from", query.from.trim());
  if (query.to?.trim()) params.set("to", query.to.trim());
  if (query.search?.trim()) params.set("search", query.search.trim());
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export type FileActivityExportQuery = Omit<FileActivityReportQuery, "page" | "limit">;

/** GET /admin/reports/file-activity/export — CSV download (superadmin). */
export async function downloadFileActivityReportCsv(
  apiBase: string,
  headers: HeadersInit,
  query: FileActivityExportQuery = {},
): Promise<void> {
  const params = new URLSearchParams();
  if (query.customerId?.trim()) params.set("customerId", query.customerId.trim());
  if (query.documentId?.trim()) params.set("documentId", query.documentId.trim());
  if (query.fileId?.trim()) params.set("fileId", query.fileId.trim());
  if (query.action) params.set("action", query.action);
  if (query.from?.trim()) params.set("from", query.from.trim());
  if (query.to?.trim()) params.set("to", query.to.trim());
  if (query.search?.trim()) params.set("search", query.search.trim());
  const qs = params.toString();
  const res = await fetch(
    `${apiBase}/api/admin/reports/file-activity/export${qs ? `?${qs}` : ""}`,
    { headers },
  );
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition");
  let filename = "file_activity.csv";
  const quoted = cd?.match(/filename="([^"]+)"/);
  if (quoted?.[1]) {
    filename = quoted[1];
  } else {
    const star = cd?.match(/filename\*=UTF-8''([^;\s]+)/i);
    if (star?.[1]) {
      try {
        filename = decodeURIComponent(star[1]);
      } catch {
        filename = star[1];
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** GET /admin/reports/file-activity/documents/:documentId/export — single-file timeline CSV (superadmin). */
export async function downloadFileActivityDocumentCsv(
  apiBase: string,
  headers: HeadersInit,
  documentId: string,
  query?: Pick<FileActivityExportQuery, "action" | "from" | "to">,
): Promise<void> {
  const params = new URLSearchParams();
  if (query?.action) params.set("action", query.action);
  if (query?.from?.trim()) params.set("from", query.from.trim());
  if (query?.to?.trim()) params.set("to", query.to.trim());
  const qs = params.toString();
  const res = await fetch(
    `${apiBase}/api/admin/reports/file-activity/documents/${encodeURIComponent(documentId)}/export${qs ? `?${qs}` : ""}`,
    { headers },
  );
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition");
  let filename = "file_activity.csv";
  const quoted = cd?.match(/filename="([^"]+)"/);
  if (quoted?.[1]) {
    filename = quoted[1];
  } else {
    const star = cd?.match(/filename\*=UTF-8''([^;\s]+)/i);
    if (star?.[1]) {
      try {
        filename = decodeURIComponent(star[1]);
      } catch {
        filename = star[1];
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** GET /admin/reports/file-activity — paginated audit log (superadmin). */
export async function fetchFileActivityReport(
  apiBase: string,
  headers: HeadersInit,
  query: FileActivityReportQuery = {},
): Promise<FileActivityReportResponse> {
  const res = await fetch(
    `${apiBase}/api/admin/reports/file-activity${fileActivityQueryString(query)}`,
    { headers },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<FileActivityReportResponse>;
}

/** GET /admin/reports/file-activity/documents/:documentId — chronological timeline (superadmin). */
export async function fetchFileActivityDocumentTimeline(
  apiBase: string,
  headers: HeadersInit,
  documentId: string,
): Promise<FileActivityListItem[]> {
  const res = await fetch(
    `${apiBase}/api/admin/reports/file-activity/documents/${encodeURIComponent(documentId)}`,
    { headers },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<FileActivityListItem[]>;
}

/** GET /admin/reports/file-activity/documents/:documentId/summary — report header (superadmin). */
export async function fetchFileActivityDocumentSummary(
  apiBase: string,
  headers: HeadersInit,
  documentId: string,
): Promise<FileActivityDocumentSummary> {
  const res = await fetch(
    `${apiBase}/api/admin/reports/file-activity/documents/${encodeURIComponent(documentId)}/summary`,
    { headers },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<FileActivityDocumentSummary>;
}

export async function downloadCustomerDocumentsExport(
  apiBase: string,
  headers: HeadersInit,
  exportId: string,
): Promise<void> {
  const res = await fetch(
    `${apiBase}/api/admin/reports/customer-documents-exports/${encodeURIComponent(exportId)}/download`,
    { headers },
  );
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition");
  let filename = "customer_documents.xlsx";
  const quoted = cd?.match(/filename="([^"]+)"/);
  if (quoted?.[1]) {
    filename = quoted[1];
  } else {
    const star = cd?.match(/filename\*=UTF-8''([^;\s]+)/i);
    if (star?.[1]) {
      try {
        filename = decodeURIComponent(star[1]);
      } catch {
        filename = star[1];
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** POST /customers/:id/export — optional `columns` limits which flattened keys appear (same order as in `columns`). */
export async function downloadCustomerExportPost(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
  body: { format: CustomerExportFormat; columns?: string[] },
): Promise<void> {
  const res = await fetch(`${apiBase}/api/customers/${encodeURIComponent(customerId)}/export`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition");
  let filename = `customer_export.${body.format}`;
  const quoted = cd?.match(/filename="([^"]+)"/);
  if (quoted?.[1]) {
    filename = quoted[1];
  } else {
    const star = cd?.match(/filename\*=UTF-8''([^;\s]+)/i);
    if (star?.[1]) {
      try {
        filename = decodeURIComponent(star[1]);
      } catch {
        filename = star[1];
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function createCustomer(
  apiBase: string,
  headers: HeadersInit,
  payload: {
    name: string;
    onboardingData?: CustomerOnboardingData;
    annualTurnoverGbp?: number;
    /** Matrix `plans.id` (omit when no plan chosen yet). */
    planId?: string;
  },
): Promise<Customer> {
  const res = await fetch(`${apiBase}/api/customers`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<Customer>;
}

export async function patchCustomer(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
  body: {
    name?: string;
    onboardingData?: CustomerOnboardingData;
    annualTurnoverGbp?: number;
    /** Omit to leave unchanged; `null` clears the customer’s matrix plan. */
    planId?: string | null;
    accountStatus?: CustomerAccountStatus;
  },
): Promise<Customer> {
  const res = await fetch(`${apiBase}/api/customers/${customerId}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<Customer>;
}

export type PortalAssignableRoleRow = {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
};

/** Roles that can be selected when creating a customer portal login (`GET …/portal-user/roles`). */
export async function fetchCustomerPortalAssignableRoles(
  apiBase: string,
  headers: HeadersInit,
): Promise<PortalAssignableRoleRow[]> {
  const res = await fetch(`${apiBase}/api/customers/portal-user/roles`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<PortalAssignableRoleRow[]>;
}

/** Customer portal login (non-admin). `roleId` required; omit `password` for server-generated password (returned once). */
export async function createCustomerPortalUser(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
  opts: { email?: string; roleId: string; password?: string },
): Promise<{ email: string; password: string }> {
  const res = await fetch(`${apiBase}/api/customers/${customerId}/portal-user`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(opts.email ? { email: opts.email } : {}),
      roleId: opts.roleId,
      ...(opts.password?.trim() ? { password: opts.password.trim() } : {}),
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ email: string; password: string }>;
}

/** Change portal role for an existing customer login. */
export async function patchCustomerPortalUserRole(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
  userId: string,
  roleId: string,
): Promise<{ ok: true; roleId: string; roleName: string }> {
  const res = await fetch(
    `${apiBase}/api/customers/${encodeURIComponent(customerId)}/portal-user/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ roleId }),
    },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: true; roleId: string; roleName: string }>;
}

/** Set password for an existing portal login; omit `password` (or empty) to auto-generate (returned once). */
export async function postCustomerPortalUserPassword(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
  userId: string,
  opts: { password?: string },
): Promise<{ email: string; password: string }> {
  const res = await fetch(
    `${apiBase}/api/customers/${encodeURIComponent(customerId)}/portal-user/${encodeURIComponent(userId)}/password`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(opts.password?.trim() ? { password: opts.password.trim() } : {}),
    },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ email: string; password: string }>;
}

export async function createCustomerFormSubmission(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
  data: CustomerOnboardingData,
  opts?: { wizardStep?: number },
): Promise<CustomerFormSubmission> {
  const res = await fetch(`${apiBase}/api/customers/${customerId}/form-submissions`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ data, wizardStep: opts?.wizardStep }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CustomerFormSubmission>;
}

export async function patchCustomerFormSubmission(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
  submissionId: string,
  body: { data?: CustomerOnboardingData; status?: "draft" | "completed"; wizardStep?: number },
): Promise<CustomerFormSubmission> {
  const res = await fetch(`${apiBase}/api/customers/${customerId}/form-submissions/${submissionId}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CustomerFormSubmission>;
}

export async function sendClientRegistrationSignatureEmailRequest(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
  submissionId: string,
  body: {
    recipientEmail: string;
    recipientName?: string;
    role?: string;
    fieldValues?: Record<string, string | boolean | number>;
    /** Backend uses this to pick the DocuSeal template (env) and webhook merge slot. */
    signatureTarget?: OnboardingDocusealSignatureTarget;
  },
): Promise<{ docusealSubmissionId: string }> {
  const res = await fetch(
    `${apiBase}/api/customers/${customerId}/form-submissions/${submissionId}/signature-email-request`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ docusealSubmissionId: string }>;
}

/** Sends four DocuSeal signing emails (one per onboarding form) to the same recipient. */
export async function sendAllOnboardingSignatureEmailRequests(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
  submissionId: string,
  opts: { recipientEmail: string; recipientName?: string },
  data: CustomerOnboardingData,
): Promise<void> {
  const slots: OnboardingDocusealSignatureTarget[] = [
    "client_registration",
    "hmrc_64_8",
    "change_accountant",
    "direct_debit",
  ];
  for (const signatureTarget of slots) {
    await sendClientRegistrationSignatureEmailRequest(apiBase, headers, customerId, submissionId, {
      recipientEmail: opts.recipientEmail,
      recipientName: opts.recipientName,
      signatureTarget,
      fieldValues: docusealPrefillForSignatureTarget(data, signatureTarget),
    });
  }
}

export async function fetchCustomerFormSubmissionStatuses(
  apiBase: string,
  headers: HeadersInit,
  customerIds: string[],
): Promise<CustomerFormSubmissionStatusesResponse> {
  const res = await fetch(`${apiBase}/api/customers/form-submission-statuses`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ customerIds }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CustomerFormSubmissionStatusesResponse>;
}

export async function fetchLatestCustomerFormSubmission(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
): Promise<CustomerFormSubmission | null> {
  const res = await fetch(`${apiBase}/api/customers/${customerId}/form-submissions/latest`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CustomerFormSubmission>;
}

export async function fetchCompaniesHouseSearch(
  apiBase: string,
  headers: HeadersInit,
  query: string,
  opts?: { startIndex?: number; itemsPerPage?: number },
): Promise<CompaniesHouseSearchResponse> {
  const q = query.trim();
  if (q.length < 2) {
    throw new Error("Enter at least 2 characters to search.");
  }
  const params = new URLSearchParams({ q });
  if (opts?.startIndex !== undefined) {
    params.set("start_index", String(opts.startIndex));
  }
  if (opts?.itemsPerPage !== undefined) {
    params.set("items_per_page", String(opts.itemsPerPage));
  }
  const res = await fetch(`${apiBase}/api/company-lookup/search?${params}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CompaniesHouseSearchResponse>;
}

/** Full Companies House: company profile + every `links.*` resource in `companies_house.ch_linked_resources`. */
export async function fetchCompanyLookupComplete(
  apiBase: string,
  headers: HeadersInit,
  companyNumber: string,
): Promise<CompanyLookupCompleteResponse> {
  const n = companyNumber.trim();
  if (!n) throw new Error("Company number is required.");
  const params = new URLSearchParams({ company_number: n });
  const res = await fetch(`${apiBase}/api/company-lookup/complete?${params}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CompanyLookupCompleteResponse>;
}

/** Same payload shape as before; always uses the complete CH bundle (profile + link GETs). */
export async function fetchCompanyLookupByNumber(
  apiBase: string,
  headers: HeadersInit,
  companyNumber: string,
): Promise<CompanyLookupPatch> {
  const c = await fetchCompanyLookupComplete(apiBase, headers, companyNumber);
  return { company: c.company, companies_house: c.companies_house } as CompanyLookupPatch;
}

export async function fetchFilesForCustomer(
  apiBase: string,
  headers: HeadersInit,
  customerId: string
): Promise<DriveFile[]> {
  const filter = encodeURIComponent(`customerId||$eq||${customerId}`);
  const res = await fetch(`${apiBase}/api/files?filter=${filter}&limit=500`, { headers });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return crudListData<DriveFile>(json);
}

/** Soft-delete a drive file or folder (`DELETE /api/files/:id`). Child files and linked jobs are soft-deleted too. */
export async function deleteDriveFile(
  apiBase: string,
  headers: HeadersInit,
  fileId: string,
): Promise<void> {
  const res = await fetch(`${apiBase}/api/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
}

function headersWithoutContentType(headers: HeadersInit): HeadersInit {
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    const h = new Headers(headers);
    h.delete("Content-Type");
    return h;
  }
  if (Array.isArray(headers)) {
    return headers.filter(([k]) => k.toLowerCase() !== "content-type");
  }
  const o = { ...(headers as Record<string, string>) };
  delete o["Content-Type"];
  delete o["content-type"];
  return o;
}

/** Multipart upload to `POST /api/files/upload` with extraction disabled (e.g. signature PNG). */
export async function uploadCustomerBlobFile(
  apiBase: string,
  headers: HeadersInit,
  params: { customerId: string; blob: Blob; filename: string },
): Promise<{ id: string }> {
  const form = new FormData();
  form.append("file", params.blob, params.filename);
  form.append("customerId", params.customerId);
  form.append("runExtraction", "false");
  const res = await fetch(`${apiBase}/api/files/upload`, {
    method: "POST",
    headers: headersWithoutContentType(headers),
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as { file: DriveFile };
  return { id: json.file.id };
}

export async function fetchCustomerInvoices(
  apiBase: string,
  headers: HeadersInit,
  customerId: string
): Promise<CustomerInvoiceRow[]> {
  const res = await fetch(`${apiBase}/api/customers/${encodeURIComponent(customerId)}/invoices`, { headers });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

export async function fetchCustomerInvoiceDetail(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
  financialDocumentId: string
): Promise<CustomerInvoiceDetail> {
  const res = await fetch(
    `${apiBase}/api/customers/${encodeURIComponent(customerId)}/invoices/${encodeURIComponent(financialDocumentId)}`,
    { headers }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CustomerInvoiceDetail>;
}

export async function fetchCustomerStatements(
  apiBase: string,
  headers: HeadersInit,
  customerId: string
): Promise<CustomerStatementRow[]> {
  const res = await fetch(`${apiBase}/api/customers/${encodeURIComponent(customerId)}/statements`, { headers });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

export async function fetchCustomerStatementDetail(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
  financialDocumentId: string
): Promise<CustomerStatementDetail> {
  const res = await fetch(
    `${apiBase}/api/customers/${encodeURIComponent(customerId)}/statements/${encodeURIComponent(financialDocumentId)}`,
    { headers }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CustomerStatementDetail>;
}

export async function fetchJobs(apiBase: string, headers: HeadersInit): Promise<JobRow[]> {
  const res = await fetch(`${apiBase}/api/jobs?limit=200&join=customer&join=file&join=document`, { headers });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return crudListData<JobRow>(json);
}

export async function fetchDocumentsList(
  apiBase: string,
  headers: HeadersInit,
  query: {
    page: number;
    limit: number;
    sort: string;
    customerId?: string;
    libraryKind?: PortalLibrarySection;
    searchText?: string;
    /** Staff only: limit to documents where the current user is a library assignee. */
    assignedOnly?: boolean;
    /** ISO timestamp — documents uploaded on or after this instant. */
    uploadedAfter?: string;
    /** `YYYY-MM-DD` upload calendar day (Europe/London), matching dashboard grouping. */
    uploadDateKey?: string;
  }
): Promise<CrudListResponse<AdminLibraryDocumentRow>> {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("limit", String(query.limit));
  params.set("sort", query.sort);
  if (query.customerId) params.set("customerId", query.customerId);
  if (query.libraryKind) params.set("libraryKind", query.libraryKind);
  const t = query.searchText?.trim();
  if (t) params.set("searchText", t);
  if (query.assignedOnly === true) params.set("assignedOnly", "true");
  if (query.uploadedAfter) params.set("uploadedAfter", query.uploadedAfter);
  if (query.uploadDateKey?.trim()) params.set("uploadDateKey", query.uploadDateKey.trim());
  const qs = params.toString();
  const res = await fetch(`${apiBase}/api/documents${qs ? `?${qs}` : ""}`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return crudListResponse<AdminLibraryDocumentRow>(await res.json(), query.page, query.limit);
}

/** Superadmin: latest view/download per document (merged into Files list rows). */
export async function fetchDocumentsFileAccessLatest(
  apiBase: string,
  headers: HeadersInit,
  documentIds: string[],
): Promise<Record<string, FileDocumentAccessSummary>> {
  const unique = [...new Set(documentIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return {};
  const params = new URLSearchParams();
  params.set("documentIds", unique.join(","));
  const res = await fetch(`${apiBase}/api/documents/file-access/latest?${params.toString()}`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  return res.json() as Promise<Record<string, FileDocumentAccessSummary>>;
}

/** Staff folder view: all library folders (metadata only). */
export async function fetchAdminLibraryAllFolders(
  apiBase: string,
  headers: HeadersInit,
  query?: { customerId?: string; libraryKind?: PortalLibrarySection },
): Promise<PortalLibraryFolderRow[]> {
  const params = new URLSearchParams();
  if (query?.customerId) params.set("customerId", query.customerId);
  if (query?.libraryKind) params.set("libraryKind", query.libraryKind);
  const qs = params.toString();
  const res = await fetch(`${apiBase}/api/documents/folders/all${qs ? `?${qs}` : ""}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<PortalLibraryFolderRow[]>;
}

export const LIBRARY_FOLDER_PAGE_SIZE = 20;

/** Staff folder view: paginated leaf folders (infinite scroll). */
export async function fetchAdminLibraryBrowseFolders(
  apiBase: string,
  headers: HeadersInit,
  query: {
    page: number;
    limit?: number;
    customerId?: string;
    libraryKind?: PortalLibrarySection;
    scope: LibraryFolderBrowseScope;
    searchText?: string;
  },
): Promise<CrudListResponse<PortalLibraryFolderRow>> {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("limit", String(query.limit ?? LIBRARY_FOLDER_PAGE_SIZE));
  params.set("scope", query.scope);
  if (query.customerId) params.set("customerId", query.customerId);
  if (query.libraryKind) params.set("libraryKind", query.libraryKind);
  if (query.searchText) params.set("searchText", query.searchText);
  const res = await fetch(`${apiBase}/api/documents/folders/browse?${params.toString()}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  const limit = query.limit ?? LIBRARY_FOLDER_PAGE_SIZE;
  return crudListResponse<PortalLibraryFolderRow>(await res.json(), query.page, limit);
}

export type LibraryDateBrowseQuery = {
  level: LibraryDateBrowseLevel;
  page: number;
  limit?: number;
  year?: number;
  /** Calendar month 1–12 (January = 1). Required context for `level=days` and below. */
  month?: number;
  day?: number;
  /** Folder view: exact calendar date (YYYY-MM-DD) matching `level=dates` rows. */
  dateKey?: string;
  customerId?: string;
  folderId?: string;
  libraryKind?: PortalLibrarySection;
  searchText?: string;
  assignedOnly?: boolean;
  /** Folder view: group/filter by upload date instead of document date. */
  dateBasis?: "effective" | "uploaded";
};

function libraryDateBrowseParams(query: LibraryDateBrowseQuery): URLSearchParams {
  const params = new URLSearchParams();
  params.set("level", query.level);
  params.set("page", String(query.page));
  params.set("limit", String(query.limit ?? LIBRARY_FOLDER_PAGE_SIZE));
  if (query.year != null) params.set("year", String(query.year));
  if (query.month != null) params.set("month", String(query.month));
  if (query.day != null) params.set("day", String(query.day));
  if (query.dateKey?.trim()) params.set("dateKey", query.dateKey.trim());
  if (query.customerId) params.set("customerId", query.customerId);
  if (query.folderId) params.set("folderId", query.folderId);
  if (query.libraryKind) params.set("libraryKind", query.libraryKind);
  if (query.searchText?.trim()) params.set("searchText", query.searchText.trim());
  if (query.assignedOnly === true) params.set("assignedOnly", "true");
  if (query.dateBasis === "uploaded") params.set("dateBasis", "uploaded");
  return params;
}

/** Staff date view: paginated drill-down by document date. */
export async function fetchAdminLibraryBrowseDates<T>(
  apiBase: string,
  headers: HeadersInit,
  query: LibraryDateBrowseQuery,
): Promise<CrudListResponse<T>> {
  const params = libraryDateBrowseParams(query);
  const res = await fetch(`${apiBase}/api/documents/dates/browse?${params.toString()}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  const limit = query.limit ?? LIBRARY_FOLDER_PAGE_SIZE;
  return crudListResponse<T>(await res.json(), query.page, limit);
}

/** Portal date view: paginated drill-down scoped to one customer. */
export async function fetchPortalLibraryBrowseDates<T>(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
  query: Omit<LibraryDateBrowseQuery, "customerId" | "assignedOnly">,
): Promise<CrudListResponse<T>> {
  const params = libraryDateBrowseParams({ ...query, level: query.level, page: query.page });
  const res = await fetch(
    `${apiBase}/api/customer-portal/${encodeURIComponent(customerId)}/dates/browse?${params.toString()}`,
    { headers },
  );
  if (!res.ok) throw new Error(await res.text());
  const limit = query.limit ?? LIBRARY_FOLDER_PAGE_SIZE;
  return crudListResponse<T>(await res.json(), query.page, limit);
}

/** Active customers for Files filters (scoped by library access; `file:read` only). */
export async function fetchLibraryCustomerFilterOptions(
  apiBase: string,
  headers: HeadersInit,
  options?: { searchText?: string },
): Promise<Array<{ id: string; name: string }>> {
  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("limit", "500");
  if (options?.searchText?.trim()) params.set("searchText", options.searchText.trim());
  const res = await fetch(`${apiBase}/api/documents/library-customer-filter-options?${params.toString()}`, {
    headers,
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  const body = (await res.json()) as { data?: Array<{ id: string; name: string }> };
  return Array.isArray(body.data) ? body.data : [];
}

/** Paginated library customer picker (Files column view without `customer:read`). */
export async function fetchLibraryCustomerFilterOptionsList(
  apiBase: string,
  headers: HeadersInit,
  query: { page: number; limit: number; searchText?: string },
): Promise<CrudListResponse<{ id: string; name: string }>> {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("limit", String(query.limit));
  if (query.searchText?.trim()) params.set("searchText", query.searchText.trim());
  const res = await fetch(`${apiBase}/api/documents/library-customer-filter-options?${params.toString()}`, {
    headers,
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  return crudListResponse<{ id: string; name: string }>(await res.json(), query.page, query.limit);
}

/** Library customer browse: document counts per customer id. */
export async function fetchCustomerDocumentUploadDashboard(
  apiBase: string,
  headers: HeadersInit,
  query?: {
    customerId?: string;
    libraryKind?: PortalLibrarySection;
    assignedOnly?: boolean;
    uploadedAfter?: string;
    uploadedBefore?: string;
    page?: number;
    limit?: number;
  },
): Promise<CustomerDocumentUploadDashboardResponse> {
  const params = new URLSearchParams();
  if (query?.customerId?.trim()) params.set("customerId", query.customerId.trim());
  if (query?.libraryKind) params.set("libraryKind", query.libraryKind);
  if (query?.assignedOnly === true) params.set("assignedOnly", "true");
  if (query?.uploadedAfter) params.set("uploadedAfter", query.uploadedAfter);
  if (query?.uploadedBefore) params.set("uploadedBefore", query.uploadedBefore);
  if (query?.page != null) params.set("page", String(query.page));
  if (query?.limit != null) params.set("limit", String(query.limit));
  const qs = params.toString();
  const res = await fetch(`${apiBase}/api/documents/dashboard/customer-uploads${qs ? `?${qs}` : ""}`, {
    headers,
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  return res.json() as Promise<CustomerDocumentUploadDashboardResponse>;
}

/** Library customer browse: document counts per customer id. */
export async function fetchCustomerLibraryDocumentCounts(
  apiBase: string,
  headers: HeadersInit,
  customerIds: string[],
  opts?: { libraryKind?: PortalLibrarySection | ""; assignedOnly?: boolean },
): Promise<Record<string, number>> {
  if (customerIds.length === 0) return {};
  const params = new URLSearchParams();
  params.set("customerIds", customerIds.join(","));
  if (opts?.libraryKind) params.set("libraryKind", opts.libraryKind);
  if (opts?.assignedOnly === true) params.set("assignedOnly", "true");
  const res = await fetch(`${apiBase}/api/documents/customer-document-counts?${params.toString()}`, { headers });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  return res.json() as Promise<Record<string, number>>;
}

/** Staff folder view: documents in a folder (loaded on folder click). */
export async function fetchAdminLibraryFolderDocuments(
  apiBase: string,
  headers: HeadersInit,
  folderId: string,
): Promise<PortalLibraryDocumentRow[]> {
  const res = await fetch(`${apiBase}/api/documents/folders/${encodeURIComponent(folderId)}/documents`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<PortalLibraryDocumentRow[]>;
}

/** Matches backend cap on `GET /api/documents` (`Math.min(200, limit)`). */
export const DOCUMENTS_ADMIN_LIST_MAX_LIMIT = 200;

export async function fetchLibraryDocument(
  apiBase: string,
  headers: HeadersInit,
  documentId: string
): Promise<AdminLibraryDocumentRow> {
  const res = await fetch(`${apiBase}/api/documents/${encodeURIComponent(documentId)}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AdminLibraryDocumentRow>;
}

/** Soft-delete a library document (`DELETE /api/documents/:id`). Manager or superadmin only. */
export async function deleteLibraryDocument(
  apiBase: string,
  headers: HeadersInit,
  documentId: string,
): Promise<void> {
  const res = await fetch(`${apiBase}/api/documents/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
}

export type LibraryExportJobRow = {
  id: string;
  customerId: string | null;
  customerName?: string | null;
  status: "queued" | "processing" | "completed" | "failed";
  filters: Record<string, unknown>;
  fileCount: number;
  zipFileName: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type CreateLibraryExportInput = {
  customerId?: string;
  viewMode?: "folderView" | "customerView" | "dateView";
  libraryKind?: PortalLibrarySection;
  folderId?: string;
  folderName?: string;
  year?: number;
  month?: number;
  day?: number;
  searchText?: string;
  assignedOnly?: boolean;
  uploadedAfter?: string;
  uploadedBefore?: string;
  documentIds?: string[];
};

/** Queue a background ZIP export for the current library view and filters. */
export async function createLibraryExport(
  apiBase: string,
  headers: HeadersInit,
  input: CreateLibraryExportInput,
): Promise<LibraryExportJobRow> {
  const res = await fetch(`${apiBase}/api/documents/library-exports`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  return res.json() as Promise<LibraryExportJobRow>;
}

export async function fetchLibraryExport(
  apiBase: string,
  headers: HeadersInit,
  exportId: string,
): Promise<LibraryExportJobRow> {
  const res = await fetch(`${apiBase}/api/documents/library-exports/${encodeURIComponent(exportId)}`, { headers });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  return res.json() as Promise<LibraryExportJobRow>;
}

function parseDownloadFilename(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) return fallback;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].trim());
    } catch {
      // fall through
    }
  }
  const plain = /filename="([^"]+)"/i.exec(contentDisposition) ?? /filename=([^;]+)/i.exec(contentDisposition);
  return plain?.[1]?.trim() || fallback;
}

export async function downloadLibraryExportZip(
  apiBase: string,
  headers: HeadersInit,
  exportId: string,
): Promise<void> {
  const res = await fetch(
    `${apiBase}/api/documents/library-exports/${encodeURIComponent(exportId)}/download`,
    { headers },
  );
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  const blob = await res.blob();
  if (!blob.size) throw new Error("Download file is empty");
  const fileName = parseDownloadFilename(res.headers.get("Content-Disposition"), "library-export.zip");
  const { triggerBrowserDownload } = await import("../utils/onboardingExportFilename");
  triggerBrowserDownload(blob, fileName);
}

export type BulkDeleteLibraryDocumentsResult = {
  deleted: number;
  failed: { id: string; error: string }[];
};

/** Soft-delete multiple library documents (`POST /api/documents/bulk-delete`). */
export async function deleteLibraryDocuments(
  apiBase: string,
  headers: HeadersInit,
  documentIds: string[],
): Promise<BulkDeleteLibraryDocumentsResult> {
  const res = await fetch(`${apiBase}/api/documents/bulk-delete`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ ids: documentIds }),
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  return res.json() as Promise<BulkDeleteLibraryDocumentsResult>;
}

/** Soft-delete a library folder when empty (`DELETE /api/documents/folders/:folderId`). */
export async function deleteLibraryFolder(
  apiBase: string,
  headers: HeadersInit,
  folderId: string,
): Promise<void> {
  const res = await fetch(`${apiBase}/api/documents/folders/${encodeURIComponent(folderId)}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
}

export async function fetchDocumentAssigneeCandidates(
  apiBase: string,
  headers: HeadersInit,
  customerId?: string,
): Promise<DocumentAssigneeCandidate[]> {
  const qs = customerId?.trim() ? `?customerId=${encodeURIComponent(customerId.trim())}` : "";
  const res = await fetch(`${apiBase}/api/documents/assignee-candidates${qs}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<DocumentAssigneeCandidate[]>;
}

export async function fetchDocumentAssignees(
  apiBase: string,
  headers: HeadersInit,
  documentId: string,
): Promise<DocumentAssigneeRow[]> {
  const res = await fetch(`${apiBase}/api/documents/${encodeURIComponent(documentId)}/assignees`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<DocumentAssigneeRow[]>;
}

export async function replaceDocumentAssignees(
  apiBase: string,
  headers: HeadersInit,
  documentId: string,
  userIds: string[],
): Promise<DocumentAssigneeRow[]> {
  const res = await fetch(`${apiBase}/api/documents/${encodeURIComponent(documentId)}/assignees`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ userIds }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<DocumentAssigneeRow[]>;
}

export async function fetchJobsForLibraryDocument(
  apiBase: string,
  headers: HeadersInit,
  documentId: string
): Promise<JobRow[]> {
  const res = await fetch(
    `${apiBase}/api/documents/${encodeURIComponent(documentId)}/jobs`,
    { headers }
  );
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

export async function fetchJobsList(
  apiBase: string,
  headers: HeadersInit,
  query: {
    page: number;
    limit: number;
    sort: string;
    status?: string;
    customerId?: string;
    /** `folders_kind_enum`: invoices | statements | files */
    libraryKind?: PortalLibrarySection;
    searchText?: string;
    /** Staff only: limit to jobs whose document lists the current user as assignee. */
    assignedOnly?: boolean;
  }
): Promise<CrudListResponse<JobRow>> {
  const filters: string[] = [];
  if (query.status) filters.push(`status||$eq||${query.status}`);
  if (query.customerId) filters.push(`customerId||$eq||${query.customerId}`);
  const t = query.searchText?.trim();
  const search = t
    ? ({
        $or: [
          { "file.name": { $contL: t } },
          { "customer.name": { $contL: t } },
          { "document.name": { $contL: t } },
        ],
      } as Record<string, unknown>)
    : undefined;
  const qs = buildCrudQuery({
    page: query.page,
    limit: query.limit,
    sort: query.sort,
    filters,
    joins: ["customer", "file", "document", "document.folder"],
    search,
  });
  const params = new URLSearchParams(qs.startsWith("?") ? qs.slice(1) : qs);
  if (query.libraryKind) params.set("libraryKind", query.libraryKind);
  if (query.assignedOnly === true) params.set("assignedOnly", "true");
  const suffix = params.toString();
  const res = await fetch(`${apiBase}/api/jobs${suffix ? `?${suffix}` : ""}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return crudListResponse<JobRow>(await res.json(), query.page, query.limit);
}

/** Single aggregate over `jobs.status` for dashboards (matches DB, not CRUD filters). */
export async function fetchJobStatusCounts(apiBase: string, headers: HeadersInit): Promise<JobStatusCounts> {
  const res = await fetch(`${apiBase}/api/jobs/counts-by-status`, { headers });
  if (res.ok) {
    const body = (await res.json()) as Partial<JobStatusCounts>;
    return {
      queued: Number(body.queued) || 0,
      processing: Number(body.processing) || 0,
      completed: Number(body.completed) || 0,
      failed: Number(body.failed) || 0,
      cancelled: Number(body.cancelled) || 0,
      total: Number(body.total) || 0,
    };
  }

  // Fallback: some setups route `/jobs/counts-by-status` into CRUD `:id` (UUID guard).
  const primaryErr = await res.text();
  try {
    const [queued, processing, completed, failed, cancelled] = await Promise.all([
      fetchJobsList(apiBase, headers, { page: 1, limit: 1, sort: "createdAt,DESC", status: "queued" }),
      fetchJobsList(apiBase, headers, { page: 1, limit: 1, sort: "createdAt,DESC", status: "processing" }),
      fetchJobsList(apiBase, headers, { page: 1, limit: 1, sort: "createdAt,DESC", status: "completed" }),
      fetchJobsList(apiBase, headers, { page: 1, limit: 1, sort: "createdAt,DESC", status: "failed" }),
      fetchJobsList(apiBase, headers, { page: 1, limit: 1, sort: "createdAt,DESC", status: "cancelled" }),
    ]);
    const out: JobStatusCounts = {
      queued: queued.total,
      processing: processing.total,
      completed: completed.total,
      failed: failed.total,
      cancelled: cancelled.total,
      total: queued.total + processing.total + completed.total + failed.total + cancelled.total,
    };
    return out;
  } catch (fallbackErr) {
    const fb = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
    throw new Error(`${primaryErr}\nFallback counts failed: ${fb}`);
  }
}

export async function fetchJob(apiBase: string, headers: HeadersInit, id: string): Promise<JobRow> {
  const res = await fetch(`${apiBase}/api/jobs/${id}?join=customer&join=file&join=document`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<JobRow>;
}

export async function fetchJobCost(
  apiBase: string,
  headers: HeadersInit,
  jobId: string
): Promise<JobCostSummary> {
  const res = await fetch(`${apiBase}/api/jobs/${jobId}/cost`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<JobCostSummary>;
}

export type TokenBurnReportParams = {
  from?: string;
  to?: string;
  customerId?: string;
};

export async function fetchTokenBurnReport(
  apiBase: string,
  headers: HeadersInit,
  params: TokenBurnReportParams = {}
): Promise<TokenBurnReport> {
  const q = new URLSearchParams();
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.customerId) q.set("customerId", params.customerId);
  const qs = q.toString();
  const res = await fetch(`${apiBase}/api/reports/token-burn${qs ? `?${qs}` : ""}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<TokenBurnReport>;
}

export async function fetchAiPricingList(
  apiBase: string,
  headers: HeadersInit
): Promise<AiPricingRow[]> {
  const res = await fetch(`${apiBase}/api/ai-pricing`, { headers });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return Array.isArray(json) ? (json as AiPricingRow[]) : [];
}

export async function createAiPricing(
  apiBase: string,
  headers: HeadersInit,
  body: {
    provider: string;
    model: string;
    inputTokenPrice: string;
    outputTokenPrice: string;
    currency?: string;
  }
): Promise<AiPricingRow> {
  const res = await fetch(`${apiBase}/api/ai-pricing`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AiPricingRow>;
}

export async function updateAiPricing(
  apiBase: string,
  headers: HeadersInit,
  id: string,
  body: {
    inputTokenPrice?: string;
    outputTokenPrice?: string;
    currency?: string;
    effectiveUntil?: string | null;
  }
): Promise<AiPricingRow> {
  const res = await fetch(`${apiBase}/api/ai-pricing/${id}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AiPricingRow>;
}

export async function fetchJobsByFileId(
  apiBase: string,
  headers: HeadersInit,
  fileId: string
): Promise<JobRow[]> {
  const res = await fetch(`${apiBase}/api/jobs/by-file/${fileId}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

export async function fetchFileById(apiBase: string, headers: HeadersInit, id: string): Promise<DriveFile> {
  const res = await fetch(`${apiBase}/api/files/${id}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<DriveFile>;
}

export async function fetchFileContentBlob(
  apiBase: string,
  headers: HeadersInit,
  fileId: string
): Promise<Blob> {
  const res = await fetch(`${apiBase}/api/files/${fileId}/content`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.blob();
}

/** Binary for a portal library document (`documents` table). */
export async function fetchDocumentContentBlob(
  apiBase: string,
  headers: HeadersInit,
  _customerId: string,
  documentId: string,
  options?: { download?: boolean },
): Promise<Blob> {
  const qs = options?.download ? "?download=1" : "";
  const res = await fetch(
    `${apiBase}/api/documents/${encodeURIComponent(documentId)}/content${qs}`,
    { headers },
  );
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  const blob = await res.blob();
  if (blob.size <= 0) throw new Error("Download file is empty");
  return blob;
}

export async function fetchExtractConfig(apiBase: string, headers: HeadersInit): Promise<ExtractConfig> {
  const res = await fetch(`${apiBase}/api/config/extract`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ExtractConfig>;
}

export async function cancelJob(apiBase: string, headers: HeadersInit, id: string): Promise<JobRow> {
  const res = await fetch(`${apiBase}/api/jobs/${id}/cancel`, {
    method: "POST",
    headers,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<JobRow>;
}

export async function requeueJob(apiBase: string, headers: HeadersInit, id: string): Promise<JobRow> {
  const res = await fetch(`${apiBase}/api/jobs/${encodeURIComponent(id)}/requeue`, {
    method: "POST",
    headers,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<JobRow>;
}

export async function fetchPgBossDashboard(apiBase: string, headers: HeadersInit): Promise<PgBossDashboard> {
  const res = await fetch(`${apiBase}/api/jobs/pg-boss-dashboard`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<PgBossDashboard>;
}

/** Re-run extraction for a library document without re-uploading (reuses the same job row). */
export async function requeueLibraryDocumentExtraction(
  apiBase: string,
  headers: HeadersInit,
  documentId: string,
): Promise<JobRow> {
  const res = await fetch(`${apiBase}/api/documents/${encodeURIComponent(documentId)}/requeue-extraction`, {
    method: "POST",
    headers,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<JobRow>;
}

export async function patchJob(
  apiBase: string,
  headers: HeadersInit,
  id: string,
  body: Partial<{
    visionPrompt: string | null;
    structurePrompt: string | null;
    visionModel: string | null;
    structureModel: string | null;
    aiProvider: string | null;
  }>
): Promise<JobRow> {
  const res = await fetch(`${apiBase}/api/jobs/${id}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<JobRow>;
}

/** HITL: update merged segments / financial documents on a completed pipeline job. */
export async function patchJobExtractionResult(
  apiBase: string,
  headers: HeadersInit,
  id: string,
  body: {
    segments?: unknown[];
    financialDocuments?: unknown[];
    manualOverride?: { note?: string };
  }
): Promise<JobRow> {
  const res = await fetch(`${apiBase}/api/jobs/${id}/extraction-result`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<JobRow>;
}

export async function uploadFile(
  apiBase: string,
  headers: HeadersInit,
  params: {
    file: globalThis.File;
    customerId: string;
    parentId?: string | null;
    /** Places file under `Invoices|Statements|Files / year / date / supplier` (ignores `parentId`). */
    librarySection?: PortalLibrarySection | null;
    supplierName?: string | null;
    supplierFolderId?: string | null;
    runExtraction: boolean;
    visionPrompt?: string;
    structurePrompt?: string;
    visionModel?: string;
    structureModel?: string;
    aiProvider?: string;
  }
): Promise<{ file: DriveFile; job: JobRow | null }> {
  const fd = new FormData();
  fd.append("file", params.file);
  fd.append("customerId", params.customerId);
  if (params.parentId) fd.append("parentId", params.parentId);
  if (params.librarySection) fd.append("librarySection", params.librarySection);
  if (params.supplierName?.trim()) fd.append("supplierName", params.supplierName.trim());
  if (params.supplierFolderId?.trim()) fd.append("supplierFolderId", params.supplierFolderId.trim());
  fd.append("runExtraction", params.runExtraction ? "true" : "false");
  if (params.visionPrompt) fd.append("visionPrompt", params.visionPrompt);
  if (params.structurePrompt) fd.append("structurePrompt", params.structurePrompt);
  if (params.visionModel) fd.append("visionModel", params.visionModel);
  if (params.structureModel) fd.append("structureModel", params.structureModel);
  if (params.aiProvider) fd.append("aiProvider", params.aiProvider);
  const res = await fetch(`${apiBase}/api/files/upload`, {
    method: "POST",
    headers,
    body: fd,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ file: DriveFile; job: JobRow | null }>;
}

const LIB_UPLOAD_LOG = "[library upload]";

function libraryUploadMimeType(file: globalThis.File): string {
  if (file.type) return file.type;
  return inferUploadMimeType(file.name);
}

export type LibraryDocumentUploadResult = { document: { id: string; name: string }; job: JobRow | null };

export type LibraryUploadSharedParams = {
  customerId: string;
  libraryKind: PortalLibrarySection;
  supplierName?: string | null;
  supplierFolderId?: string | null;
  runExtraction: boolean;
  visionPrompt?: string;
  structurePrompt?: string;
  visionModel?: string;
  structureModel?: string;
  aiProvider?: string;
};

type LibraryUploadProgress = { completed: number; total: number; fileName: string };

function libraryUploadJsonHeaders(headers: HeadersInit): HeadersInit {
  return { ...headers, "Content-Type": "application/json" };
}

async function throwIfLibraryUploadUnavailable(res: Response): Promise<void> {
  if (res.status === 503) {
    const detail = await res.text();
    throw new Error(
      detail?.trim()
        ? `Direct S3 upload is not available: ${detail.trim()}`
        : "Direct S3 upload is not available. Set S3_AWS_BUCKET (and S3 credentials) on the API server, then retry.",
    );
  }
}

/**
 * Staff library: `POST …/upload-s3/batch-init` → parallel S3 PUTs → `POST …/upload-s3/batch-complete`
 * (same flow for one file or many).
 */
export async function uploadLibraryDocuments(
  apiBase: string,
  headers: HeadersInit,
  params: LibraryUploadSharedParams & {
    files: readonly globalThis.File[];
    onProgress?: (progress: LibraryUploadProgress) => void;
  },
): Promise<{
  results: LibraryDocumentUploadResult[];
  failures: Array<{ file: globalThis.File; index: number; error: Error }>;
}> {
  const { files, onProgress, ...shared } = params;
  if (files.length === 0) return { results: [], failures: [] };

  const jsonHeaders = libraryUploadJsonHeaders(headers);
  const initBody: Record<string, unknown> = {
    customerId: shared.customerId,
    libraryKind: shared.libraryKind,
    files: files.map((f) => ({
      fileName: f.name,
      mimeType: libraryUploadMimeType(f),
      sizeBytes: f.size,
    })),
  };
  if (shared.supplierName?.trim()) initBody.supplierName = shared.supplierName.trim();
  if (shared.supplierFolderId?.trim()) initBody.supplierFolderId = shared.supplierFolderId.trim();

  const initUrl = `${apiBase}/api/documents/upload-s3/batch-init`;
  console.info(LIB_UPLOAD_LOG, "step:batch-init", { initUrl, count: files.length });
  const initRes = await fetch(initUrl, { method: "POST", headers: jsonHeaders, body: JSON.stringify(initBody) });
  await throwIfLibraryUploadUnavailable(initRes);
  if (!initRes.ok) {
    throw new Error(await initRes.text());
  }

  const batchInit = (await initRes.json()) as {
    items: Array<{
      fileId: string;
      putUrl: string;
      headers: { "Content-Type": string };
    }>;
  };
  if (!batchInit.items?.length || batchInit.items.length !== files.length) {
    throw new Error("batch-init returned an unexpected number of upload slots.");
  }

  const putFailures: Array<{ file: globalThis.File; index: number; error: Error }> = [];
  const successfulFileIds: string[] = [];
  let completed = 0;

  const putOne = async (index: number) => {
    const file = files[index]!;
    const slot = batchInit.items[index]!;
    const putRes = await fetch(slot.putUrl, {
      method: "PUT",
      headers: slot.headers,
      body: file,
    });
    if (!putRes.ok) {
      const t = await putRes.text();
      throw new Error(t ? `S3 upload failed (${putRes.status}): ${t}` : `S3 upload failed (${putRes.status})`);
    }
    return slot.fileId;
  };

  const workers = Math.min(3, files.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        const index = cursor++;
        if (index >= files.length) return;
        try {
          const fileId = await putOne(index);
          successfulFileIds.push(fileId);
        } catch (e) {
          putFailures.push({
            file: files[index]!,
            index,
            error: e instanceof Error ? e : new Error(String(e)),
          });
        } finally {
          completed += 1;
          onProgress?.({ completed, total: files.length, fileName: files[index]!.name });
        }
      }
    }),
  );

  if (successfulFileIds.length === 0) {
    return { results: [], failures: putFailures };
  }

  onProgress?.({ completed: files.length, total: files.length, fileName: "Saving…" });

  const completePayload: Record<string, unknown> = {
    customerId: shared.customerId,
    libraryKind: shared.libraryKind,
    fileIds: successfulFileIds,
    runExtraction: shared.runExtraction ? "true" : "false",
  };
  if (shared.supplierName?.trim()) completePayload.supplierName = shared.supplierName.trim();
  if (shared.supplierFolderId?.trim()) completePayload.supplierFolderId = shared.supplierFolderId.trim();
  if (shared.visionPrompt) completePayload.visionPrompt = shared.visionPrompt;
  if (shared.structurePrompt) completePayload.structurePrompt = shared.structurePrompt;
  if (shared.visionModel) completePayload.visionModel = shared.visionModel;
  if (shared.structureModel) completePayload.structureModel = shared.structureModel;
  if (shared.aiProvider) completePayload.aiProvider = shared.aiProvider;

  const completeUrl = `${apiBase}/api/documents/upload-s3/batch-complete`;
  console.info(LIB_UPLOAD_LOG, "step:batch-complete", { completeUrl, count: successfulFileIds.length });
  const completeRes = await fetch(completeUrl, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(completePayload),
  });
  await throwIfLibraryUploadUnavailable(completeRes);
  if (!completeRes.ok) {
    throw new Error(await completeRes.text());
  }

  const batchDone = (await completeRes.json()) as {
    results: Array<{
      fileId: string;
      document: { id: string; name: string } | null;
      job: JobRow | null;
    }>;
    failures: Array<{ fileId: string; message: string }>;
  };

  const fileIdToIndex = new Map(batchInit.items.map((item, i) => [item.fileId, i]));
  const results: LibraryDocumentUploadResult[] = [];
  for (const row of batchDone.results ?? []) {
    const doc = row.document as { id?: string; name?: string } | null;
    if (!doc?.id) continue;
    results.push({
      document: { id: doc.id, name: doc.name ?? "" },
      job: row.job ?? null,
    });
  }
  const failures = [...putFailures];
  for (const f of batchDone.failures ?? []) {
    const index = fileIdToIndex.get(f.fileId);
    if (index === undefined) continue;
    failures.push({
      file: files[index]!,
      index,
      error: new Error(f.message),
    });
  }

  return { results, failures };
}

/**
 * Staff: single-file library upload via the same batch-init / batch-complete path as `uploadLibraryDocuments`.
 */
export async function uploadLibraryDocument(
  apiBase: string,
  headers: HeadersInit,
  params: {
    file: globalThis.File;
    customerId: string;
    libraryKind: PortalLibrarySection;
    supplierName?: string | null;
    supplierFolderId?: string | null;
    runExtraction: boolean;
    visionPrompt?: string;
    structurePrompt?: string;
    visionModel?: string;
    structureModel?: string;
    aiProvider?: string;
  },
): Promise<{ document: { id: string; name: string }; job: JobRow | null }> {
  const { file, ...shared } = params;
  const { results, failures } = await uploadLibraryDocuments(apiBase, headers, {
    ...shared,
    files: [file],
  });
  if (failures.length) {
    const err = failures[0]!.error;
    console.warn(LIB_UPLOAD_LOG, "single-file upload failed", { message: err.message });
    throw err;
  }
  const first = results[0];
  if (!first?.document?.id) {
    console.warn(LIB_UPLOAD_LOG, "complete JSON missing document", { count: results.length });
    throw new Error("Upload finished but no document was returned.");
  }
  console.info(LIB_UPLOAD_LOG, "done", { documentId: first.document.id, jobId: first.job?.id ?? null });
  return first;
}

export type SupplierLibraryUploadResult = {
  file?: DriveFile | null;
  document?: PortalLibraryDocumentRow | null;
  job: JobRow | null;
};

export type SupplierLibraryUploadSharedParams = {
  customerId: string;
  librarySection: PortalLibrarySection;
  supplierName?: string;
  supplierFolderId?: string | null;
  runExtraction: boolean;
  visionPrompt?: string;
  structurePrompt?: string;
  visionModel?: string;
  structureModel?: string;
  aiProvider?: string;
};

/** Portal / new job: batch-init + parallel PUTs + batch-complete (same for one file or many). */
export async function uploadFilesForSupplierMany(
  apiBase: string,
  headers: HeadersInit,
  params: SupplierLibraryUploadSharedParams & {
    files: readonly globalThis.File[];
    onProgress?: (progress: LibraryUploadProgress) => void;
  },
): Promise<{
  results: SupplierLibraryUploadResult[];
  failures: Array<{ file: globalThis.File; index: number; error: Error }>;
}> {
  const { files, onProgress, ...shared } = params;
  if (files.length === 0) return { results: [], failures: [] };

  const jsonHeaders = libraryUploadJsonHeaders(headers);
  const base = `${apiBase}/api/customer-portal/${encodeURIComponent(shared.customerId)}/library/${encodeURIComponent(shared.librarySection)}`;

  const initBody: Record<string, unknown> = {
    files: files.map((f) => ({
      fileName: f.name,
      mimeType: libraryUploadMimeType(f),
      sizeBytes: f.size,
    })),
  };
  if (shared.supplierFolderId?.trim()) initBody.supplierFolderId = shared.supplierFolderId.trim();
  if (shared.supplierName?.trim()) initBody.supplierName = shared.supplierName.trim();

  const initRes = await fetch(`${base}/upload-s3/batch-init`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(initBody),
  });
  await throwIfLibraryUploadUnavailable(initRes);
  if (!initRes.ok) throw new Error(await initRes.text());

  const batchInit = (await initRes.json()) as {
    items: Array<{ fileId: string; putUrl: string; headers: { "Content-Type": string } }>;
  };
  if (!batchInit.items?.length || batchInit.items.length !== files.length) {
    throw new Error("batch-init returned an unexpected number of upload slots.");
  }

  const putFailures: Array<{ file: globalThis.File; index: number; error: Error }> = [];
  const successfulFileIds: string[] = [];
  let completed = 0;
  const workers = Math.min(3, files.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        const index = cursor++;
        if (index >= files.length) return;
        const file = files[index]!;
        const slot = batchInit.items[index]!;
        try {
          const putRes = await fetch(slot.putUrl, {
            method: "PUT",
            headers: slot.headers,
            body: file,
          });
          if (!putRes.ok) {
            const t = await putRes.text();
            throw new Error(t ? `S3 upload failed (${putRes.status}): ${t}` : `S3 upload failed (${putRes.status})`);
          }
          successfulFileIds.push(slot.fileId);
        } catch (e) {
          putFailures.push({
            file,
            index,
            error: e instanceof Error ? e : new Error(String(e)),
          });
        } finally {
          completed += 1;
          onProgress?.({ completed, total: files.length, fileName: file.name });
        }
      }
    }),
  );

  if (successfulFileIds.length === 0) {
    return { results: [], failures: putFailures };
  }

  onProgress?.({ completed: files.length, total: files.length, fileName: "Saving…" });

  const completePayload: Record<string, unknown> = {
    fileIds: successfulFileIds,
    runExtraction: shared.runExtraction ? "true" : "false",
  };
  if (shared.supplierFolderId?.trim()) completePayload.supplierFolderId = shared.supplierFolderId.trim();
  if (shared.supplierName?.trim()) completePayload.supplierName = shared.supplierName.trim();
  if (shared.visionPrompt) completePayload.visionPrompt = shared.visionPrompt;
  if (shared.structurePrompt) completePayload.structurePrompt = shared.structurePrompt;
  if (shared.visionModel) completePayload.visionModel = shared.visionModel;
  if (shared.structureModel) completePayload.structureModel = shared.structureModel;
  if (shared.aiProvider) completePayload.aiProvider = shared.aiProvider;

  const completeRes = await fetch(`${base}/upload-s3/batch-complete`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(completePayload),
  });
  await throwIfLibraryUploadUnavailable(completeRes);
  if (!completeRes.ok) throw new Error(await completeRes.text());

  const batchDone = (await completeRes.json()) as {
    results: Array<{
      fileId: string;
      document: PortalLibraryDocumentRow | null;
      job: JobRow | null;
      file?: DriveFile | null;
    }>;
    failures: Array<{ fileId: string; message: string }>;
  };

  const fileIdToIndex = new Map(batchInit.items.map((item, i) => [item.fileId, i]));
  const results: SupplierLibraryUploadResult[] = (batchDone.results ?? []).map((row) => ({
    file: row.file ?? null,
    document: row.document,
    job: row.job ?? null,
  }));
  const failures = [...putFailures];
  for (const f of batchDone.failures ?? []) {
    const index = fileIdToIndex.get(f.fileId);
    if (index === undefined) continue;
    failures.push({ file: files[index]!, index, error: new Error(f.message) });
  }
  return { results, failures };
}

export async function fetchPortalSuppliers(
  apiBase: string,
  headers: HeadersInit,
  params: { customerId: string; librarySection: PortalLibrarySection },
): Promise<PortalSupplierOption[]> {
  const res = await fetch(
    `${apiBase}/api/customer-portal/${encodeURIComponent(params.customerId)}/${params.librarySection}/suppliers`,
    { headers },
  );
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as { suppliers: PortalSupplierOption[] };
  return json.suppliers ?? [];
}

/** All library supplier folders (invoices, statements, files) for one destination dropdown. */
export async function fetchPortalSuppliersAll(
  apiBase: string,
  headers: HeadersInit,
  params: { customerId: string },
): Promise<PortalSupplierOption[]> {
  const res = await fetch(
    `${apiBase}/api/customer-portal/${encodeURIComponent(params.customerId)}/folders/suppliers`,
    { headers },
  );
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as { suppliers: PortalSupplierOption[] };
  return json.suppliers ?? [];
}

/** Folders for a portal library slice (`folders` table), optionally under `parentId` (omit = roots). */
export async function fetchPortalLibraryFolders(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
  section: PortalLibrarySection,
  parentId?: string | null,
): Promise<PortalLibraryFolderRow[]> {
  const q =
    parentId !== undefined && parentId !== null && parentId !== ""
      ? `?parentId=${encodeURIComponent(parentId)}`
      : "";
  const res = await fetch(
    `${apiBase}/api/customer-portal/${encodeURIComponent(customerId)}/${section}/folders${q}`,
    { headers },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<PortalLibraryFolderRow[]>;
}

/** All folders for a library section (metadata only — no documents). */
export async function fetchPortalLibraryAllFolders(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
  section: PortalLibrarySection,
): Promise<PortalLibraryFolderRow[]> {
  const res = await fetch(
    `${apiBase}/api/customer-portal/${encodeURIComponent(customerId)}/${section}/folders/all`,
    { headers },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<PortalLibraryFolderRow[]>;
}

/** Portal folder view: paginated leaf folders (infinite scroll). */
export async function fetchPortalLibraryBrowseFolders(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
  query: {
    page: number;
    limit?: number;
    libraryKind?: PortalLibrarySection;
    scope: LibraryFolderBrowseScope;
    searchText?: string;
  },
): Promise<CrudListResponse<PortalLibraryFolderRow>> {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("limit", String(query.limit ?? LIBRARY_FOLDER_PAGE_SIZE));
  params.set("scope", query.scope);
  if (query.libraryKind) params.set("libraryKind", query.libraryKind);
  if (query.searchText) params.set("searchText", query.searchText);
  const res = await fetch(
    `${apiBase}/api/customer-portal/${encodeURIComponent(customerId)}/folders/browse?${params.toString()}`,
    { headers },
  );
  if (!res.ok) throw new Error(await res.text());
  const limit = query.limit ?? LIBRARY_FOLDER_PAGE_SIZE;
  return crudListResponse<PortalLibraryFolderRow>(await res.json(), query.page, limit);
}

/** Documents in a portal library folder (`documents` table). */
export async function fetchPortalLibraryDocuments(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
  section: PortalLibrarySection,
  folderId: string,
): Promise<PortalLibraryDocumentRow[]> {
  const res = await fetch(
    `${apiBase}/api/customer-portal/${encodeURIComponent(customerId)}/${section}/folders/${encodeURIComponent(folderId)}/documents`,
    { headers },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<PortalLibraryDocumentRow[]>;
}

/** Full `folders` + `documents` graph for one portal library (Miller columns). */
export async function fetchPortalLibraryTree(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
  section: PortalLibrarySection,
): Promise<PortalLibraryTreeResponse> {
  const res = await fetch(
    `${apiBase}/api/customer-portal/${encodeURIComponent(customerId)}/${section}/library`,
    { headers },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<PortalLibraryTreeResponse>;
}

/**
 * Portal / New Job: single-file upload via the same batch-init / batch-complete path as `uploadFilesForSupplierMany`.
 */
export async function uploadFileForSupplier(
  apiBase: string,
  headers: HeadersInit,
  params: {
    file: globalThis.File;
    customerId: string;
    librarySection: PortalLibrarySection;
    supplierName?: string;
    supplierFolderId?: string | null;
    runExtraction: boolean;
    visionPrompt?: string;
    structurePrompt?: string;
    visionModel?: string;
    structureModel?: string;
    aiProvider?: string;
  },
): Promise<{ file?: DriveFile | null; document?: PortalLibraryDocumentRow | null; job: JobRow | null }> {
  const { file, ...shared } = params;
  const { results, failures } = await uploadFilesForSupplierMany(apiBase, headers, {
    ...shared,
    files: [file],
  });
  if (failures.length) throw failures[0]!.error;
  const first = results[0];
  if (!first) throw new Error("Upload finished but no result was returned.");
  return first;
}

export async function fetchAdminPermissionCatalog(
  apiBase: string,
  headers: HeadersInit,
): Promise<AdminPermissionCatalogResponse> {
  const res = await fetch(`${apiBase}/api/admin/roles/permission-catalog`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AdminPermissionCatalogResponse>;
}

export async function fetchAdminRoles(
  apiBase: string,
  headers: HeadersInit,
  options?: { roleType?: RoleType },
): Promise<AdminRoleRow[]> {
  const params = new URLSearchParams();
  if (options?.roleType) params.set("role_type", options.roleType);
  const qs = params.toString();
  const res = await fetch(`${apiBase}/api/admin/roles${qs ? `?${qs}` : ""}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AdminRoleRow[]>;
}

export async function fetchAdminPracticeUsers(
  apiBase: string,
  headers: HeadersInit,
): Promise<AdminPracticeUserRow[]> {
  const res = await fetch(`${apiBase}/api/admin/users`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AdminPracticeUserRow[]>;
}

export async function createAdminPracticeUser(
  apiBase: string,
  headers: HeadersInit,
  body: { email: string; password?: string; isAdmin?: boolean; roleIds?: string[] },
): Promise<AdminPracticeUserCreatedResponse> {
  const res = await fetch(`${apiBase}/api/admin/users`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AdminPracticeUserCreatedResponse>;
}

export async function patchAdminPracticeUser(
  apiBase: string,
  headers: HeadersInit,
  id: string,
  body: { isAdmin?: boolean; roleIds?: string[] },
): Promise<AdminPracticeUserRow> {
  const res = await fetch(`${apiBase}/api/admin/users/${id}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AdminPracticeUserRow>;
}

/** Delete practice staff (superadmin) or customer portal user (superadmin or `portal:user:write`). */
export async function deleteAdminPracticeUser(
  apiBase: string,
  headers: HeadersInit,
  id: string,
  options?: { archive?: boolean },
): Promise<{ ok: true; kind?: "practice" | "portal"; archived?: boolean }> {
  const params = new URLSearchParams();
  if (options?.archive) params.set("archive", "true");
  const qs = params.toString();
  const res = await fetch(
    `${apiBase}/api/admin/users/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`,
    {
      method: "DELETE",
      headers,
    },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: true; kind?: "practice" | "portal"; archived?: boolean }>;
}

/** Reactivate a deactivated customer portal user (superadmin or `portal:user:write`). */
export async function activateAdminPortalUser(
  apiBase: string,
  headers: HeadersInit,
  id: string,
): Promise<{ ok: true; kind?: "portal"; activated?: boolean }> {
  const res = await fetch(`${apiBase}/api/admin/users/${encodeURIComponent(id)}/activate`, {
    method: "POST",
    headers,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: true; kind?: "portal"; activated?: boolean }>;
}

/** Superadmin: set staff login password, or omit password to generate one (see `initialPassword` in response). */
export async function postAdminPracticeUserPassword(
  apiBase: string,
  headers: HeadersInit,
  id: string,
  body: { password?: string },
): Promise<{ ok: boolean; initialPassword?: string }> {
  const res = await fetch(`${apiBase}/api/admin/users/${encodeURIComponent(id)}/password`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body.password?.trim() ? { password: body.password.trim() } : {}),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean; initialPassword?: string }>;
}

export async function fetchAdminPracticeUserCustomerAssignments(
  apiBase: string,
  headers: HeadersInit,
  userId: string,
): Promise<AdminPracticeUserCustomerAssignmentRow[]> {
  const res = await fetch(`${apiBase}/api/admin/users/${encodeURIComponent(userId)}/customer-assignments`, {
    headers,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AdminPracticeUserCustomerAssignmentRow[]>;
}

export async function replaceAdminPracticeUserCustomerAssignments(
  apiBase: string,
  headers: HeadersInit,
  userId: string,
  customerIds: string[],
): Promise<AdminPracticeUserCustomerAssignmentRow[]> {
  const res = await fetch(`${apiBase}/api/admin/users/${encodeURIComponent(userId)}/customer-assignments`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ customerIds }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AdminPracticeUserCustomerAssignmentRow[]>;
}

export async function createGlobalFolder(
  apiBase: string,
  headers: HeadersInit,
  body: { name: string; type: PortalLibrarySection; parentId?: string | null },
): Promise<GlobalFolderRow> {
  const payload: Record<string, unknown> = {
    name: body.name,
    type: body.type,
  };
  if (body.parentId !== undefined) {
    payload.parentId = body.parentId;
  }
  const res = await fetch(`${apiBase}/api/folders/global`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<GlobalFolderRow>;
}

export async function createAdminFolder(
  apiBase: string,
  headers: HeadersInit,
  body: {
    name: string;
    /** Optional; API defaults to `files` for unified folder model. */
    type?: PortalLibrarySection;
    scope: "global" | "customer";
    customerIds?: string[];
    isDefault?: boolean;
    isRestricted?: boolean;
  },
): Promise<GlobalFolderRow[]> {
  const payload: Record<string, unknown> = {
    name: body.name,
    scope: body.scope,
  };
  if (body.type) payload.type = body.type;
  if (body.customerIds !== undefined && body.customerIds.length > 0) {
    payload.customerIds = body.customerIds;
  }
  if (body.isDefault !== undefined) {
    payload.isDefault = body.isDefault;
  }
  if (body.isRestricted !== undefined) {
    payload.isRestricted = body.isRestricted;
  }
  const res = await fetch(`${apiBase}/api/folders/admin`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readApiErrorMessage(res));
  return res.json() as Promise<GlobalFolderRow[]>;
}

export async function fetchAdminDefaultFolderCandidates(
  apiBase: string,
  headers: HeadersInit,
  query: { scope: "global" | "customer"; customerId?: string },
): Promise<AdminDefaultFolderCandidate[]> {
  const qs = new URLSearchParams({ scope: query.scope });
  if (query.customerId) qs.set("customerId", query.customerId);
  const res = await fetch(`${apiBase}/api/folders/admin/default-candidates?${qs.toString()}`, {
    headers,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AdminDefaultFolderCandidate[]>;
}

export async function setAdminDefaultFolder(
  apiBase: string,
  headers: HeadersInit,
  body: { scope: "global" | "customer"; folderId: string; customerId?: string },
): Promise<{ scope: "global" | "customer"; folderId: string; customerId: string | null }> {
  const res = await fetch(`${apiBase}/api/folders/admin/defaults`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    scope: "global" | "customer";
    folderId: string;
    customerId: string | null;
  }>;
}

export async function fetchAdminDefaultAssignments(
  apiBase: string,
  headers: HeadersInit,
): Promise<AdminDefaultFolderAssignment[]> {
  const res = await fetch(`${apiBase}/api/folders/admin/defaults`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AdminDefaultFolderAssignment[]>;
}

export async function fetchAdminRestrictedFolderCandidates(
  apiBase: string,
  headers: HeadersInit,
  query: { scope: "global" | "customer"; customerId?: string },
): Promise<AdminRestrictedFolderCandidate[]> {
  const qs = new URLSearchParams({ scope: query.scope });
  if (query.customerId) qs.set("customerId", query.customerId);
  const res = await fetch(`${apiBase}/api/folders/admin/restricted-candidates?${qs.toString()}`, {
    headers,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AdminRestrictedFolderCandidate[]>;
}

export async function setAdminRestrictedFolder(
  apiBase: string,
  headers: HeadersInit,
  body: { scope: "global" | "customer"; folderId: string; customerId?: string },
): Promise<{ scope: "global" | "customer"; folderId: string; customerId: string | null }> {
  const res = await fetch(`${apiBase}/api/folders/admin/restricted`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    scope: "global" | "customer";
    folderId: string;
    customerId: string | null;
  }>;
}

export async function fetchAdminRestrictedAssignments(
  apiBase: string,
  headers: HeadersInit,
): Promise<AdminRestrictedFolderAssignment[]> {
  const res = await fetch(`${apiBase}/api/folders/admin/restricted`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AdminRestrictedFolderAssignment[]>;
}

export async function createAdminRole(
  apiBase: string,
  headers: HeadersInit,
  body: { name: string; roleType?: RoleType; description?: string; permissions?: string[] },
): Promise<AdminRoleRow> {
  const res = await fetch(`${apiBase}/api/admin/roles`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AdminRoleRow>;
}

export async function patchAdminRole(
  apiBase: string,
  headers: HeadersInit,
  id: string,
  body: { name?: string; description?: string; permissions?: string[] },
): Promise<AdminRoleRow> {
  const res = await fetch(`${apiBase}/api/admin/roles/${id}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AdminRoleRow>;
}

export async function deleteAdminRole(apiBase: string, headers: HeadersInit, id: string): Promise<void> {
  const res = await fetch(`${apiBase}/api/admin/roles/${id}`, {
    method: "DELETE",
    headers: { ...headers, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function fetchAdminBroadcastPresets(
  apiBase: string,
  headers: HeadersInit,
): Promise<{ presets: { id: string; label: string; description: string }[] }> {
  const res = await fetch(`${apiBase}/api/admin/notifications/broadcast/presets`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ presets: { id: string; label: string; description: string }[] }>;
}

export type AdminBroadcastRecipientUser = {
  id: string;
  email: string;
  label: string;
  kind: "practice" | "portal";
  roleLabel?: string;
  customerName?: string | null;
};

export type AdminBroadcastRecipientUserFilter = {
  id: string;
  label: string;
  hint?: string;
  group: "practice" | "portal";
};

export async function fetchAdminBroadcastRecipientUserFilters(
  apiBase: string,
  headers: HeadersInit,
): Promise<{ filters: AdminBroadcastRecipientUserFilter[] }> {
  const res = await fetch(`${apiBase}/api/admin/notifications/broadcast/recipient-user-filters`, {
    headers,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ filters: AdminBroadcastRecipientUserFilter[] }>;
}

export type AdminBroadcastRecipientCustomer = {
  id: string;
  name: string;
};

export async function fetchAdminBroadcastRecipientCustomers(
  apiBase: string,
  headers: HeadersInit,
  search?: string,
): Promise<AdminBroadcastRecipientCustomer[]> {
  const params = new URLSearchParams();
  if (search?.trim()) params.set("search", search.trim());
  const qs = params.toString();
  const res = await fetch(
    `${apiBase}/api/admin/notifications/broadcast/recipient-customers${qs ? `?${qs}` : ""}`,
    { headers },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AdminBroadcastRecipientCustomer[]>;
}

export async function fetchAdminBroadcastRecipientUsers(
  apiBase: string,
  headers: HeadersInit,
  search?: string,
  category?: string,
  customerId?: string,
): Promise<AdminBroadcastRecipientUser[]> {
  const params = new URLSearchParams();
  if (search?.trim()) params.set("search", search.trim());
  if (category?.trim()) params.set("category", category.trim());
  if (customerId?.trim()) params.set("customer_id", customerId.trim());
  const qs = params.toString();
  const res = await fetch(
    `${apiBase}/api/admin/notifications/broadcast/recipient-users${qs ? `?${qs}` : ""}`,
    { headers },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AdminBroadcastRecipientUser[]>;
}

export type AdminBroadcastPushOutcome = "sent" | "noTokens" | "fcmDisabled" | "failed" | "skipped";

export type AdminBroadcastDeliveryRecipient = {
  user_id: string;
  email: string;
  in_app: boolean;
  push: AdminBroadcastPushOutcome;
  device_token_count: number;
};

export type AdminBroadcastDeliveryResult = {
  recipient_count: number;
  push_summary: {
    sent: number;
    noTokens: number;
    fcmDisabled: number;
    failed: number;
    skipped: number;
  };
  recipients: AdminBroadcastDeliveryRecipient[];
};

export type AdminBroadcastPreviewRecipient = {
  user_id: string;
  email: string;
  device_token_count: number;
  push_eligible: boolean;
};

export type AdminBroadcastPreviewResult = {
  recipient_count: number;
  fcm_configured: boolean;
  push_summary: {
    with_tokens: number;
    without_tokens: number;
  };
  recipients: AdminBroadcastPreviewRecipient[];
};

export async function previewAdminBroadcast(
  apiBase: string,
  headers: HeadersInit,
  body: Record<string, unknown>,
): Promise<AdminBroadcastPreviewResult> {
  const res = await fetch(`${apiBase}/api/admin/notifications/broadcast/preview`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AdminBroadcastPreviewResult>;
}

export async function sendAdminBroadcast(
  apiBase: string,
  headers: HeadersInit,
  body: Record<string, unknown>,
): Promise<AdminBroadcastDeliveryResult> {
  const res = await fetch(`${apiBase}/api/admin/notifications/broadcast`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AdminBroadcastDeliveryResult>;
}

export type AdminNotificationGroupListRow = {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  rule_count: number;
  resolved_member_count: number;
  created_at: string;
  updated_at: string;
};

export type AdminNotificationGroupRuleRow = {
  id: string;
  filter: string;
  customer_id: string | null;
  customer_name: string | null;
};

export type AdminNotificationGroupMemberRow = {
  user_id: string;
  email: string;
  label: string;
};

export type AdminNotificationGroupDetail = AdminNotificationGroupListRow & {
  members: AdminNotificationGroupMemberRow[];
  rules: AdminNotificationGroupRuleRow[];
};

export type UpsertAdminNotificationGroupBody = {
  name: string;
  description?: string | null;
  user_ids?: string[];
  rules?: { filter: string; customer_id?: string | null }[];
};

export async function fetchAdminNotificationGroups(
  apiBase: string,
  headers: HeadersInit,
): Promise<AdminNotificationGroupListRow[]> {
  const res = await fetch(`${apiBase}/api/admin/notifications/groups`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AdminNotificationGroupListRow[]>;
}

export async function fetchAdminNotificationGroup(
  apiBase: string,
  headers: HeadersInit,
  id: string,
): Promise<AdminNotificationGroupDetail> {
  const res = await fetch(`${apiBase}/api/admin/notifications/groups/${encodeURIComponent(id)}`, {
    headers,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AdminNotificationGroupDetail>;
}

export async function createAdminNotificationGroup(
  apiBase: string,
  headers: HeadersInit,
  body: UpsertAdminNotificationGroupBody,
): Promise<AdminNotificationGroupDetail> {
  const res = await fetch(`${apiBase}/api/admin/notifications/groups`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AdminNotificationGroupDetail>;
}

export async function patchAdminNotificationGroup(
  apiBase: string,
  headers: HeadersInit,
  id: string,
  body: UpsertAdminNotificationGroupBody,
): Promise<AdminNotificationGroupDetail> {
  const res = await fetch(`${apiBase}/api/admin/notifications/groups/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<AdminNotificationGroupDetail>;
}

export async function deleteAdminNotificationGroup(
  apiBase: string,
  headers: HeadersInit,
  id: string,
): Promise<void> {
  const res = await fetch(`${apiBase}/api/admin/notifications/groups/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function previewAdminNotificationGroupDraft(
  apiBase: string,
  headers: HeadersInit,
  body: UpsertAdminNotificationGroupBody,
): Promise<{ recipient_count: number }> {
  const res = await fetch(`${apiBase}/api/admin/notifications/groups/preview-draft`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ recipient_count: number }>;
}

export async function previewAdminNotificationGroup(
  apiBase: string,
  headers: HeadersInit,
  id: string,
): Promise<{ recipient_count: number }> {
  const res = await fetch(
    `${apiBase}/api/admin/notifications/groups/${encodeURIComponent(id)}/preview`,
    {
      method: "POST",
      headers,
    },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ recipient_count: number }>;
}

export async function fetchAdminNotificationConfigs(
  apiBase: string,
  headers: HeadersInit,
): Promise<import("../types/api").NotificationEventConfigRow[]> {
  const res = await fetch(`${apiBase}/api/admin/notification-configs`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<import("../types/api").NotificationEventConfigRow[]>;
}

export async function createAdminNotificationConfig(
  apiBase: string,
  headers: HeadersInit,
  body: Record<string, unknown>,
): Promise<import("../types/api").NotificationEventConfigRow> {
  const res = await fetch(`${apiBase}/api/admin/notification-configs`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<import("../types/api").NotificationEventConfigRow>;
}

export async function patchAdminNotificationConfig(
  apiBase: string,
  headers: HeadersInit,
  id: string,
  body: Record<string, unknown>,
): Promise<import("../types/api").NotificationEventConfigRow> {
  const res = await fetch(`${apiBase}/api/admin/notification-configs/${id}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<import("../types/api").NotificationEventConfigRow>;
}

export async function deleteAdminNotificationConfig(
  apiBase: string,
  headers: HeadersInit,
  id: string,
): Promise<void> {
  const res = await fetch(`${apiBase}/api/admin/notification-configs/${id}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function sendTestAdminNotificationConfig(
  apiBase: string,
  headers: HeadersInit,
  id: string,
): Promise<{ recipient_count: number }> {
  const res = await fetch(`${apiBase}/api/admin/notification-configs/${id}/send-test`, {
    method: "POST",
    headers,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ recipient_count: number }>;
}

export async function fetchNotificationInbox(
  apiBase: string,
  headers: HeadersInit,
  params?: { limit?: number; offset?: number; unread_only?: boolean },
): Promise<{ items: import("../types/api").InboxNotificationRow[]; total: number; unread_count: number }> {
  const q = new URLSearchParams();
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.offset != null) q.set("offset", String(params.offset));
  if (params?.unread_only) q.set("unread_only", "true");
  const qs = q.toString();
  const res = await fetch(`${apiBase}/api/notifications/inbox${qs ? `?${qs}` : ""}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    items: import("../types/api").InboxNotificationRow[];
    total: number;
    unread_count: number;
  }>;
}

export async function fetchNotificationUnreadCount(
  apiBase: string,
  headers: HeadersInit,
): Promise<{ unread_count: number }> {
  const res = await fetch(`${apiBase}/api/notifications/inbox/unread-count`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ unread_count: number }>;
}

export async function markNotificationRead(
  apiBase: string,
  headers: HeadersInit,
  id: string,
): Promise<import("../types/api").InboxNotificationRow> {
  const res = await fetch(`${apiBase}/api/notifications/inbox/${id}/read`, {
    method: "PATCH",
    headers,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<import("../types/api").InboxNotificationRow>;
}

export async function markAllNotificationsRead(
  apiBase: string,
  headers: HeadersInit,
): Promise<{ updated: number }> {
  const res = await fetch(`${apiBase}/api/notifications/inbox/read-all`, {
    method: "PATCH",
    headers,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ updated: number }>;
}

export async function fetchDeadlineCampaignEvents(
  apiBase: string,
  headers: HeadersInit,
): Promise<import("../types/api").DeadlineEventRow[]> {
  const res = await fetch(`${apiBase}/api/admin/deadline-campaigns/events`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<import("../types/api").DeadlineEventRow[]>;
}

export async function upsertDeadlineCampaignByDateField(
  apiBase: string,
  headers: HeadersInit,
  dateFieldId: string,
  body: Record<string, unknown>,
): Promise<import("../types/api").DeadlineCampaignRow> {
  const res = await fetch(
    `${apiBase}/api/admin/deadline-campaigns/by-date-field/${encodeURIComponent(dateFieldId)}`,
    {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<import("../types/api").DeadlineCampaignRow>;
}

export async function fetchDeadlineCampaignDateFields(
  apiBase: string,
  headers: HeadersInit,
): Promise<import("../types/api").DeadlineCampaignDateFieldOption[]> {
  const res = await fetch(`${apiBase}/api/admin/deadline-campaigns/date-fields`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<import("../types/api").DeadlineCampaignDateFieldOption[]>;
}

export async function fetchDeadlineCampaigns(
  apiBase: string,
  headers: HeadersInit,
): Promise<import("../types/api").DeadlineCampaignRow[]> {
  const res = await fetch(`${apiBase}/api/admin/deadline-campaigns`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<import("../types/api").DeadlineCampaignRow[]>;
}

export async function createDeadlineCampaign(
  apiBase: string,
  headers: HeadersInit,
  body: Record<string, unknown>,
): Promise<import("../types/api").DeadlineCampaignRow> {
  const res = await fetch(`${apiBase}/api/admin/deadline-campaigns`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<import("../types/api").DeadlineCampaignRow>;
}

export async function patchDeadlineCampaign(
  apiBase: string,
  headers: HeadersInit,
  id: string,
  body: Record<string, unknown>,
): Promise<import("../types/api").DeadlineCampaignRow> {
  const res = await fetch(`${apiBase}/api/admin/deadline-campaigns/${id}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<import("../types/api").DeadlineCampaignRow>;
}

export async function deleteDeadlineCampaign(
  apiBase: string,
  headers: HeadersInit,
  id: string,
): Promise<void> {
  const res = await fetch(`${apiBase}/api/admin/deadline-campaigns/${id}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function previewDeadlineCampaign(
  apiBase: string,
  headers: HeadersInit,
  body: { campaign_id?: string; draft?: Record<string, unknown> },
): Promise<import("../types/api").DeadlineCampaignPreviewResult> {
  const res = await fetch(`${apiBase}/api/admin/deadline-campaigns/preview`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<import("../types/api").DeadlineCampaignPreviewResult>;
}

export { getApiBase };

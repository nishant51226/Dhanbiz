import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const CH_BASE = "https://api.company-information.service.gov.uk";

/** Unified search (companies + officers, etc.). */
type ChSearchItem = {
  kind?: string;
  company_number?: string;
  title?: string;
  company_status?: string;
  company_type?: string;
  date_of_creation?: string;
  address_snippet?: string;
  description?: string;
};

type ChSearchResponse = {
  items?: ChSearchItem[];
  total_results?: number;
  page_number?: number;
  items_per_page?: number;
  start_index?: number;
  kind?: string;
};

type ChRegisteredOffice = {
  premises?: string;
  address_line_1?: string;
  address_line_2?: string;
  locality?: string;
  postal_code?: string;
  region?: string;
  country?: string;
  care_of?: string;
  po_box?: string;
};

type ChNamedPeriod = { month?: number; day?: number };

type ChLastAccounts = {
  made_up_to?: string;
  period_end_on?: string;
  period_start_on?: string;
  type?: string | null;
};

type ChNextAccounts = {
  due_on?: string;
  overdue?: boolean;
  period_end_on?: string;
  period_start_on?: string;
};

/** GET /company/{companyNumber} profile (subset used for onboarding + snapshot). */
type ChCompanyProfile = {
  etag?: string;
  company_name?: string;
  company_number?: string;
  type?: string;
  company_status?: string;
  company_status_detail?: string;
  jurisdiction?: string;
  sic_codes?: string[];
  date_of_creation?: string;
  date_of_cessation?: string;
  can_file?: boolean;
  registered_office_is_in_dispute?: boolean;
  undeliverable_registered_office_address?: boolean;
  partial_data_available?: string;
  registered_office_address?: ChRegisteredOffice;
  service_address?: ChRegisteredOffice;
  accounts?: {
    accounting_reference_date?: ChNamedPeriod;
    last_accounts?: ChLastAccounts;
    next_accounts?: ChNextAccounts;
    next_due?: string;
    next_made_up_to?: string;
    overdue?: boolean;
  };
  confirmation_statement?: {
    last_made_up_to?: string;
    next_due?: string;
    next_made_up_to?: string;
    overdue?: boolean;
  };
  annual_return?: {
    last_made_up_to?: string;
    next_due?: string;
    next_made_up_to?: string;
    overdue?: boolean;
  };
  branch_company_details?: {
    business_activity?: string;
    parent_company_name?: string;
    parent_company_number?: string;
  };
  foreign_company_details?: {
    business_activity?: string;
    registration_number?: string;
    originating_registry?: { country?: string; name?: string };
    company_type?: string;
    governed_by?: string;
  };
  previous_company_names?: { name?: string; effective_from?: string; ceased_on?: string }[];
  links?: Record<string, string>;
  has_insolvency_history?: boolean;
};

const MONTHS = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const CH_TYPE_TO_BUSINESS_TYPE: Record<string, string> = {
  ltd: "Limited company",
  plc: "Limited company",
  llp: "Partnership",
  "private-limited-guarant-nsc": "Limited company",
  "private-limited-guarant-nsc-limited-exemption": "Limited company",
  "private-limited-shares-section-30-exemption": "Limited company",
  "private-unlimited": "Limited company",
  "private-unlimited-nsc": "Limited company",
  "public-limited-company": "Limited company",
  "old-public-company": "Limited company",
  "protected-cell-company": "Limited company",
  "investment-company-with-variable-capital": "Limited company",
  "european-public-limited-liability-company-se": "Limited company",
  "uk-establishment": "Limited company",
  "scottish-partnership": "Partnership",
  "charitable-incorporated-organisation": "Limited company",
  "scottish-charitable-incorporated-organisation": "Limited company",
  "northern-ireland": "Limited company",
  "oversea-company": "Limited company",
  "sole-trader": "Sole trader",
};

export type CompanySearchResultItem = {
  company_number: string;
  title: string;
  company_status: string;
  company_type: string;
  date_of_creation: string | null;
  address_snippet: string | null;
  description: string | null;
};

function mapSearchCompanyItem(row: ChSearchItem): CompanySearchResultItem {
  return {
    company_number: String(row.company_number ?? "").trim(),
    title: String(row.title ?? "").trim(),
    company_status: String(row.company_status ?? "").trim(),
    company_type: String(row.company_type ?? "").trim(),
    date_of_creation: row.date_of_creation ? String(row.date_of_creation) : null,
    address_snippet: row.address_snippet ? String(row.address_snippet) : null,
    description: row.description ? String(row.description) : null,
  };
}

function formatRegisteredOfficeLine1(ro: ChRegisteredOffice | undefined): string {
  if (!ro) return "";
  const parts = [ro.premises, ro.address_line_1, ro.address_line_2].filter(
    (p) => typeof p === "string" && p.trim().length > 0,
  ) as string[];
  return parts.join(", ").trim();
}

function formatSicCodes(codes: string[] | undefined): string {
  if (!codes?.length) return "";
  return codes.map((c) => c.trim()).filter(Boolean).join(", ");
}

function formatAccountingReferenceDate(ard: { month?: number; day?: number } | undefined): string {
  if (!ard || typeof ard.month !== "number" || typeof ard.day !== "number") return "";
  const monthName = MONTHS[ard.month] ?? "";
  if (!monthName) return "";
  return `${ard.day} ${monthName}`;
}

function mapChTypeToBusinessType(chType: string | undefined): string {
  if (!chType) return "";
  const key = chType.toLowerCase().trim();
  return CH_TYPE_TO_BUSINESS_TYPE[key] ?? "";
}

function chOptStr(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

function chOptBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function chOptNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * Full GET /company JSON body (JSON-serializable) stored under `companies_house.ch_company_profile`
 * alongside the normalized snapshot fields.
 */
function cloneJsonSafeRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * Copy a few values from linked CH list payloads onto `companies_house` root so staff dashboard
 * can `ORDER BY onboarding_data->'companies_house'->>'?'` without array subscripts in SQL.
 */
function appendLinkedChSummaryForSort(
  snapshot: Record<string, unknown>,
  linked: Record<string, unknown> | undefined,
): void {
  if (!linked || typeof linked !== "object" || Array.isArray(linked)) return;

  const fh = linked["filing_history"];
  if (fh && typeof fh === "object" && !Array.isArray(fh)) {
    const items = (fh as Record<string, unknown>)["items"];
    if (Array.isArray(items) && items.length > 0) {
      const first = items[0];
      if (first && typeof first === "object" && !Array.isArray(first)) {
        const row = first as Record<string, unknown>;
        const date = chOptStr(row["date"]);
        if (date) snapshot.latest_filing_date = date;
        const typ = chOptStr(row["type"]);
        if (typ) snapshot.latest_filing_type = typ;
        const desc = chOptStr(row["description"]);
        if (desc) snapshot.latest_filing_description = desc;
      }
    }
  }

  const psc = linked["persons_with_significant_control"];
  if (psc && typeof psc === "object" && !Array.isArray(psc)) {
    const items = (psc as Record<string, unknown>)["items"];
    if (Array.isArray(items) && items.length > 0) {
      const row = items[0];
      if (row && typeof row === "object" && !Array.isArray(row)) {
        const ivd = (row as Record<string, unknown>)["identity_verification_details"];
        if (ivd && typeof ivd === "object" && !Array.isArray(ivd)) {
          const iv = ivd as Record<string, unknown>;
          const due = chOptStr(iv["appointment_verification_statement_due_on"]);
          if (due) snapshot.psc_appointment_verification_statement_due_on = due;
          const stmt = chOptStr(iv["appointment_verification_statement_date"]);
          if (stmt) snapshot.psc_appointment_verification_statement_date = stmt;
        }
      }
    }
  }

  const off = linked["officers"];
  if (off && typeof off === "object" && !Array.isArray(off)) {
    const items = (off as Record<string, unknown>)["items"];
    if (Array.isArray(items) && items.length > 0) {
      const row = items[0];
      if (row && typeof row === "object" && !Array.isArray(row)) {
        const ivd = (row as Record<string, unknown>)["identity_verification_details"];
        if (ivd && typeof ivd === "object" && !Array.isArray(ivd)) {
          const iv = ivd as Record<string, unknown>;
          const due = chOptStr(iv["appointment_verification_statement_due_on"]);
          if (due) snapshot.officer_appointment_verification_statement_due_on = due;
        }
      }
    }
  }
}

/**
 * Structured Companies House profile for onboarding SSOT (JSON-serializable).
 * When `rawApiBody` is set, the entire parsed Companies House company resource is copied to `ch_company_profile`.
 * When `linkedResponses` is set, each `links.{name}` follow-up GET is stored under `ch_linked_resources.{name}`.
 */
function buildCompaniesHouseSnapshot(
  profile: ChCompanyProfile,
  rawApiBody?: unknown,
  linkedResponses?: Record<string, unknown>,
): Record<string, unknown> {
  const acc = profile.accounts;
  const la = acc?.last_accounts;
  const na = acc?.next_accounts;
  const ard = acc?.accounting_reference_date;
  const cs = profile.confirmation_statement;
  const ar = profile.annual_return;
  const branch = profile.branch_company_details;
  const foreign = profile.foreign_company_details;

  const links =
    profile.links && typeof profile.links === "object"
      ? Object.fromEntries(
          Object.entries(profile.links).filter(([, v]) => typeof v === "string" && v.trim().length > 0),
        )
      : undefined;

  const prevNames = Array.isArray(profile.previous_company_names)
    ? profile.previous_company_names
        .map((p) => ({
          name: chOptStr(p?.name),
          effective_from: chOptStr(p?.effective_from),
          ceased_on: chOptStr(p?.ceased_on),
        }))
        .filter((p) => p.name)
    : undefined;

  const accountsOut: Record<string, unknown> = {};
  const ardDay = chOptNum(ard?.day);
  const ardMonth = chOptNum(ard?.month);
  if (ardDay !== undefined) accountsOut.accounting_reference_day = ardDay;
  if (ardMonth !== undefined) accountsOut.accounting_reference_month = ardMonth;
  const lastEnd = chOptStr(la?.period_end_on ?? la?.made_up_to);
  if (lastEnd) accountsOut.last_accounts_period_end_on = lastEnd;
  const lastStart = chOptStr(la?.period_start_on);
  if (lastStart) accountsOut.last_accounts_period_start_on = lastStart;
  if (typeof la?.type === "string" && chOptStr(la.type)) accountsOut.last_accounts_type = chOptStr(la.type);
  const nextDue = chOptStr(na?.due_on ?? acc?.next_due);
  if (nextDue) accountsOut.next_accounts_due_on = nextDue;
  const nextOverdue = chOptBool(na?.overdue ?? acc?.overdue);
  if (nextOverdue !== undefined) accountsOut.next_accounts_overdue = nextOverdue;
  const nextEnd = chOptStr(na?.period_end_on ?? acc?.next_made_up_to);
  if (nextEnd) accountsOut.next_accounts_period_end_on = nextEnd;
  const nextStart = chOptStr(na?.period_start_on);
  if (nextStart) accountsOut.next_accounts_period_start_on = nextStart;

  const confirmationOut: Record<string, unknown> = {};
  if (cs) {
    const a = chOptStr(cs.last_made_up_to);
    if (a) confirmationOut.last_made_up_to = a;
    const b = chOptStr(cs.next_due);
    if (b) confirmationOut.next_due = b;
    const c = chOptStr(cs.next_made_up_to);
    if (c) confirmationOut.next_made_up_to = c;
    const od = chOptBool(cs.overdue);
    if (od !== undefined) confirmationOut.overdue = od;
  }

  const annualOut: Record<string, unknown> = {};
  if (ar) {
    const a = chOptStr(ar.last_made_up_to);
    if (a) annualOut.last_made_up_to = a;
    const b = chOptStr(ar.next_due);
    if (b) annualOut.next_due = b;
    const c = chOptStr(ar.next_made_up_to);
    if (c) annualOut.next_made_up_to = c;
    const od = chOptBool(ar.overdue);
    if (od !== undefined) annualOut.overdue = od;
  }

  const branchOut: Record<string, unknown> = {};
  if (branch) {
    const ba = chOptStr(branch.business_activity);
    if (ba) branchOut.business_activity = ba;
    const pn = chOptStr(branch.parent_company_name);
    if (pn) branchOut.parent_company_name = pn;
    const pnum = chOptStr(branch.parent_company_number);
    if (pnum) branchOut.parent_company_number = pnum;
  }

  const foreignOut: Record<string, unknown> = {};
  if (foreign) {
    const ba = chOptStr(foreign.business_activity);
    if (ba) foreignOut.business_activity = ba;
    const rn = chOptStr(foreign.registration_number);
    if (rn) foreignOut.registration_number = rn;
    const oc = chOptStr(foreign.originating_registry?.country);
    if (oc) foreignOut.originating_country = oc;
    const on = chOptStr(foreign.originating_registry?.name);
    if (on) foreignOut.originating_registry_name = on;
    const ct = chOptStr(foreign.company_type);
    if (ct) foreignOut.company_type = ct;
    const gb = chOptStr(foreign.governed_by);
    if (gb) foreignOut.governed_by = gb;
  }

  const sicCodes = profile.sic_codes?.filter((c) => typeof c === "string" && c.trim());

  const snapshot: Record<string, unknown> = {
    fetched_at: new Date().toISOString(),
    etag: chOptStr(profile.etag),
    company_status: chOptStr(profile.company_status),
    company_status_detail: chOptStr(profile.company_status_detail),
    date_of_creation: chOptStr(profile.date_of_creation),
    date_of_cessation: chOptStr(profile.date_of_cessation),
    jurisdiction: chOptStr(profile.jurisdiction),
    type: chOptStr(profile.type),
    sic_codes: sicCodes && sicCodes.length > 0 ? sicCodes : undefined,
    can_file: chOptBool(profile.can_file),
    registered_office_is_in_dispute: chOptBool(profile.registered_office_is_in_dispute),
    undeliverable_registered_office_address: chOptBool(profile.undeliverable_registered_office_address),
    partial_data_available: chOptStr(profile.partial_data_available),
    has_insolvency_history: chOptBool(profile.has_insolvency_history),
  };

  if (Object.keys(accountsOut).length > 0) snapshot.accounts = accountsOut;
  if (Object.keys(confirmationOut).length > 0) snapshot.confirmation_statement = confirmationOut;
  if (Object.keys(annualOut).length > 0) snapshot.annual_return = annualOut;
  if (Object.keys(branchOut).length > 0) snapshot.branch_company_details = branchOut;
  if (Object.keys(foreignOut).length > 0) snapshot.foreign_company_details = foreignOut;
  if (prevNames && prevNames.length > 0) snapshot.previous_company_names = prevNames;
  if (links && Object.keys(links).length > 0) snapshot.links = links;

  /** Flat keys for dashboard sort / display (avoid JSON array indexing in SQL). */
  appendLinkedChSummaryForSort(snapshot, linkedResponses);

  for (const k of Object.keys(snapshot)) {
    if (snapshot[k] === undefined) delete snapshot[k];
  }

  const rawClone = cloneJsonSafeRecord(rawApiBody);
  if (rawClone && Object.keys(rawClone).length > 0) {
    snapshot.ch_company_profile = rawClone;
  }

  const linkedClone = cloneJsonSafeRecord(linkedResponses);
  if (linkedClone && Object.keys(linkedClone).length > 0) {
    snapshot.ch_linked_resources = linkedClone;
  }

  return snapshot;
}

function buildNatureOfBusiness(profile: ChCompanyProfile): string {
  const parts: string[] = [];
  const sic = formatSicCodes(profile.sic_codes);
  if (sic) parts.push(`SIC codes: ${sic}`);
  const branchAct = chOptStr(profile.branch_company_details?.business_activity);
  if (branchAct) parts.push(`Branch activity: ${branchAct}`);
  const foreignAct = chOptStr(profile.foreign_company_details?.business_activity);
  if (foreignAct) parts.push(`Business activity: ${foreignAct}`);
  return parts.join(" | ");
}

function mapProfileToCompanyPatch(profile: ChCompanyProfile): Record<string, unknown> {
  const ro = profile.registered_office_address;
  const line1 = formatRegisteredOfficeLine1(ro);
  const nature = buildNatureOfBusiness(profile);

  const address: Record<string, unknown> = {
    line1,
    city: String(ro?.locality ?? ro?.region ?? "").trim(),
    postcode: String(ro?.postal_code ?? "").trim(),
  };
  const country = String(ro?.country ?? "").trim();
  if (country) address.country = country;

  const patch: Record<string, unknown> = {
    name: String(profile.company_name ?? "").trim(),
    number: String(profile.company_number ?? "").trim(),
    type: mapChTypeToBusinessType(profile.type),
    nature_of_business: nature,
    year_end: formatAccountingReferenceDate(profile.accounts?.accounting_reference_date),
    address,
  };

  const cs = chOptStr(profile.company_status);
  if (cs) patch.company_status = cs;
  const doc = chOptStr(profile.date_of_creation);
  if (doc) patch.date_of_creation = doc;
  const jur = chOptStr(profile.jurisdiction);
  if (jur) patch.jurisdiction = jur;

  return patch;
}

@Injectable()
export class CompaniesHouseService {
  private readonly logger = new Logger(CompaniesHouseService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>("COMPANIES_HOUSE_API_KEY")?.trim());
  }

  private requireApiKey(): string {
    const key = this.config.get<string>("COMPANIES_HOUSE_API_KEY", "").trim();
    if (!key) {
      throw new ServiceUnavailableException(
        "Companies House is not configured. Set COMPANIES_HOUSE_API_KEY in the backend environment.",
      );
    }
    return key;
  }

  private authHeader(): string {
    const key = this.requireApiKey();
    const token = Buffer.from(`${key}:`, "utf8").toString("base64");
    return `Basic ${token}`;
  }

  private async chJson(path: string, query: Record<string, string>): Promise<unknown> {
    const url = new URL(CH_BASE + path);
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
    const res = await fetch(url, {
      headers: {
        Authorization: this.authHeader(),
        Accept: "application/json",
      },
    });

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      const body = await res.text();
      this.logger.warn(`Companies House ${res.status} ${url.pathname}: ${body.slice(0, 300)}`);
      throw new BadGatewayException(`Companies House returned ${res.status}.`);
    }

    return res.json() as Promise<unknown>;
  }

  /** Only same-origin CH paths from `links` (relative URL path). */
  private sanitizeChLinkPath(path: unknown): string | null {
    if (typeof path !== "string") return null;
    const t = path.trim();
    if (!t.startsWith("/") || t.includes("..")) return null;
    if (!/^\/[a-zA-Z0-9/_-]+$/.test(t)) return null;
    return t;
  }

  /** List-style CH endpoints: request first page (100 items). */
  private linkedEndpointQuery(path: string): Record<string, string> {
    const p = path.toLowerCase();
    if (
      p.endsWith("/officers") ||
      p.endsWith("/filing-history") ||
      p.includes("persons-with-significant-control")
    ) {
      return { items_per_page: "100", start_index: "0" };
    }
    return {};
  }

  /**
   * GET a CH path without throwing: failures become JSON-serializable error objects
   * so one bad link does not break the whole bundle.
   */
  private async chFetchLinkedJson(path: string, query: Record<string, string>): Promise<unknown> {
    try {
      const url = new URL(CH_BASE + path);
      for (const [k, v] of Object.entries(query)) {
        url.searchParams.set(k, v);
      }
      const res = await fetch(url, {
        headers: {
          Authorization: this.authHeader(),
          Accept: "application/json",
        },
      });
      if (res.status === 404) {
        return { _not_found: true, path };
      }
      if (!res.ok) {
        const body = await res.text();
        this.logger.warn(`Companies House linked ${res.status} ${path}: ${body.slice(0, 200)}`);
        return { _http_error: true, status: res.status, path, detail: body.slice(0, 800) };
      }
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        return { _non_json: true, path, content_type: ct };
      }
      return (await res.json()) as unknown;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { _fetch_error: true, path, message: msg };
    }
  }

  /**
   * Calls each URL in `company.links` except `self` ? that resource is already the GET /company body
   * stored as `ch_company_profile`, so re-fetching it would duplicate payload and burn a CH request.
   */
  private async fetchAllChLinkedResources(companyJson: Record<string, unknown>): Promise<Record<string, unknown>> {
    const links = companyJson.links;
    if (!links || typeof links !== "object" || Array.isArray(links)) {
      return {};
    }
    const entries = Object.entries(links as Record<string, unknown>).filter(([name]) => name !== "self");
    const pairs = await Promise.all(
      entries.map(async ([name, pathVal]) => {
        const path = this.sanitizeChLinkPath(pathVal);
        if (!path) {
          return [name, { _error: true, message: "invalid_link_path" }] as const;
        }
        const q = this.linkedEndpointQuery(path);
        const data = await this.chFetchLinkedJson(path, q);
        return [name, data] as const;
      }),
    );
    const out: Record<string, unknown> = {};
    for (const [name, data] of pairs) {
      out[name] = data;
    }
    return out;
  }

  /**
   * Calls GET /search ? returns company hits only (filters out officers, etc.).
   */
  async searchCompanies(
    q: string,
    options?: { startIndex?: number; itemsPerPage?: number },
  ): Promise<{
    items: CompanySearchResultItem[];
    total_results: number;
    page_number: number;
    items_per_page: number;
    start_index: number;
    /** Next `start_index` for CH `/search` (based on raw hit count, not company-only filter). */
    next_start_index: number;
  }> {
    const term = q.trim();
    if (term.length < 2) {
      throw new BadRequestException("Search query must be at least 2 characters.");
    }

    const startIndex = Math.max(0, options?.startIndex ?? 0);
    const itemsPerPage = Math.min(100, Math.max(1, options?.itemsPerPage ?? 20));

    const data = (await this.chJson("/search", {
      q: term,
      start_index: String(startIndex),
      items_per_page: String(itemsPerPage),
    })) as ChSearchResponse;

    const rawItems = Array.isArray(data?.items) ? data.items : [];
    const companies = rawItems.filter((i) => i.kind === "searchresults#company");

    return {
      items: companies.map(mapSearchCompanyItem).filter((i) => i.company_number.length > 0),
      total_results: typeof data.total_results === "number" ? data.total_results : companies.length,
      page_number: typeof data.page_number === "number" ? data.page_number : 1,
      items_per_page: typeof data.items_per_page === "number" ? data.items_per_page : itemsPerPage,
      start_index: typeof data.start_index === "number" ? data.start_index : startIndex,
      next_start_index: startIndex + rawItems.length,
    };
  }

  /**
   * GET /company/{number} mapped to onboarding company patch (snake_case).
   */
  async getCompanyLookupPatch(companyNumber: string): Promise<{
    company: Record<string, unknown>;
    companies_house: Record<string, unknown>;
  }> {
    const num = companyNumber.replace(/\s/g, "").toUpperCase();
    if (!num) {
      throw new BadRequestException("company_number is required.");
    }

    const json = await this.chJson(`/company/${encodeURIComponent(num)}`, {});
    if (json === null || typeof json !== "object") {
      throw new NotFoundException(`Company ${num} was not found at Companies House.`);
    }

    const profile = json as ChCompanyProfile;
    const companyRecord = json as Record<string, unknown>;
    const linked = await this.fetchAllChLinkedResources(companyRecord);
    return {
      company: mapProfileToCompanyPatch(profile),
      companies_house: buildCompaniesHouseSnapshot(profile, json, linked),
    };
  }

  /**
   * Same fetches as {@link getCompanyLookupPatch}, returned as one explicit envelope for clients
   * that want the full Companies House bundle (profile + `links` follow-ups) in a single response.
   */
  async getCompanyCompleteBundle(companyNumber: string): Promise<{
    company_number: string;
    company: Record<string, unknown>;
    companies_house: Record<string, unknown>;
  }> {
    const patch = await this.getCompanyLookupPatch(companyNumber);
    const num = companyNumber.replace(/\s/g, "").toUpperCase();
    return {
      company_number: num,
      company: patch.company,
      companies_house: patch.companies_house,
    };
  }
}

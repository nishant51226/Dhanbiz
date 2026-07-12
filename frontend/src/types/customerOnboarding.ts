/**
 * Customer onboarding � single JSON document (DB SSOT). Keys are snake_case to match stored JSON.
 * Multiple form controls bind to the same paths (e.g. company.name, tax.utr, tax.auth_code) so values stay in sync.
 */

export type DirectorEntry = {
  /** Stable list key for React; optional on legacy saved rows. */
  uid?: string;
  name: string;
  address: string;
  city: string;
  postcode: string;
  personal_utr: string;
  ni_number: string;
  date_of_birth: string;
  paye_reference: string;
  identity_verification_code: string;
};

/** Subset of Companies House GET /company/{number} stored on the onboarding record (SSOT). */
export type CompaniesHouseProfileSnapshot = {
  fetched_at?: string;
  etag?: string;
  company_status?: string;
  company_status_detail?: string;
  date_of_creation?: string;
  date_of_cessation?: string;
  jurisdiction?: string;
  type?: string;
  sic_codes?: string[];
  can_file?: boolean;
  registered_office_is_in_dispute?: boolean;
  undeliverable_registered_office_address?: boolean;
  partial_data_available?: string;
  has_insolvency_history?: boolean;
  accounts?: {
    accounting_reference_day?: number;
    accounting_reference_month?: number;
    last_accounts_period_end_on?: string;
    last_accounts_period_start_on?: string;
    last_accounts_type?: string;
    next_accounts_due_on?: string;
    next_accounts_overdue?: boolean;
    next_accounts_period_end_on?: string;
    next_accounts_period_start_on?: string;
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
    originating_country?: string;
    originating_registry_name?: string;
    company_type?: string;
    governed_by?: string;
  };
  previous_company_names?: { name?: string; effective_from?: string; ceased_on?: string }[];
  links?: Record<string, string>;
};

export type CustomerOnboardingData = {
  company: {
    name: string;
    number: string;
    type: string;
    nature_of_business: string;
    year_end: string;
    /** Employer PAYE number (company-level; all business types). */
    paye_number: string;
    /** From Companies House profile when applied */
    company_status?: string;
    date_of_creation?: string;
    jurisdiction?: string;
    registeredAddress: {
      line1: string;
      city: string;
      postcode: string;
      country?: string;
    };
    traderAddress: {
      line1: string;
      city: string;
      postcode: string;
      country?: string;
    };
    /** When true, trader address stays a copy of the registered address (persisted with drafts). */
    traderSameAsRegistered?: boolean;
  };
  /** Full structured Companies House profile snapshot (from GET /company/{number}). */
  companies_house?: CompaniesHouseProfileSnapshot;
  contact: {
    phone: string;
    email: string;
  };
  directors: DirectorEntry[];
  tax: {
    utr: string;
    /** Companies House / gateway authentication code when applicable. */
    auth_code: string;
    vat_number: string;
    vat_quarter: string;
    /** Next VAT return due date (YYYY-MM-DD). */
    vat_return_due_date: string;
    paye_ref: string;
    ni_number: string;
    cis_reference: string;
  };
  services: {
    bookkeeping: boolean;
    vat: boolean;
    quarterly_reports: boolean;
    year_end_accounts: boolean;
    personal_tax_return: boolean;
    payroll: {
      enabled: boolean;
      employee_count: number;
      frequency: string;
    };
  };
  /** Estimated annual turnover (GBP), step 1 — used with `POST /api/subscription-plans/by-turnover` before plan pick. */
  annual_turnover_gbp?: number | null;
  /**
   * Subscription catalogue (step 1). IDs match `/api/subscription-plans`; name is denormalised for exports/PDFs.
   */
  subscription_plan_id?: string;
  subscription_plan_name?: string;
  /** Billing cadence for matrix recommend (`POST /api/subscriptions/recommend`). */
  subscription_billing_cycle?: string | null;
  /** Payee / payroll headcount for matrix recommend. */
  subscription_payee_users?: number | null;
  /** Dormant fee line item when yearly billing and plan supports dormant. */
  subscription_is_dormant?: boolean | null;
  /** Selected matrix `plans.id` from recommend API (not legacy `subscription_plans`). */
  subscription_matrix_plan_id?: string;
  subscription_matrix_plan_name?: string;
  /**
   * `pricing.final` from `POST /api/subscriptions/recommend` for the selected matrix plan (inc. VAT per billing cycle).
   * Denormalised for PDF / exports when the recommender is not re-run.
   */
  subscription_matrix_plan_price_inc_vat_gbp?: number | null;
  /** Active catalogue `services.id` values the client wants before plan recommend (subset filter). */
  subscription_selected_service_ids?: string[];
  /**
   * Denormalised labels for `subscription_selected_service_ids` (same order) for PDF/export when the
   * catalogue is not available server-side.
   */
  subscription_selected_services?: { id: string; name: string }[];
  agent: {
    name: string;
    address: string;
    postcode: string;
    phone: string;
    agent_code_sa: string;
    agent_code_ct: string;
    client_reference: string;
    /** Agent Government Gateway identifier (HMRC 64-8 CIS / PAYE sections). */
    government_gateway_id: string;
    /** PAYE Agent ID code (HMRC 64-8 CIS / PAYE sections; distinct from SA/CT agent codes). */
    paye_agent_id_code: string;
  };
  bank: {
    account_holder_name: string;
    account_number: string;
    sort_code: string;
    bank_address: string;
  };
  /**
   * Step 3 (Change of accountant): letter addressee — the outgoing accountant.
   * Not filled from company or trader address; user enters manually.
   */
  change_of_accountant: {
    previous_accountant_name: string;
    previous_accountant_address: {
      line1: string;
      city: string;
      postcode: string;
      country?: string;
    };
  };
  authorization: {
    self_assessment: boolean;
    partnership: boolean;
    trust: boolean;
    vat: boolean;
    paye: boolean;
    corporation_tax: boolean;
    tax_credits: boolean;
    cis: boolean;
  };
  /** HMRC 64-8 tick boxes, per-section reference boxes, and joint tax-credit claimant (step 2). */
  hmrc_options: {
    utr_not_yet_issued: boolean;
    send_statement_to_agent: boolean;
    vat_not_registered: boolean;
    cis_receive_online: boolean;
    cis_receive_phone_writing: boolean;
    paye_receive_online: boolean;
    paye_receive_phone_writing: boolean;
    joint_claimant_name: string;
    joint_claimant_ni_number: string;
    /** Independent box values for each HMRC 64-8 placement (wizard + PDF). */
    ref_self_assessment_ni_number: string;
    ref_self_assessment_utr: string;
    ref_trust_utr: string;
    ref_individual_paye_ni_number: string;
    ref_corporation_tax_utr: string;
    ref_tax_credits_ni_number: string;
    ref_cis_paye_ref: string;
    ref_employers_paye_ref: string;
    cis_government_gateway_id: string;
    cis_paye_agent_id_code: string;
    employers_government_gateway_id: string;
    employers_paye_agent_id_code: string;
  };
  /** Internal office fields (step 1 � not shown to the client on paper except in the office-use PDF block). */
  office_use: {
    /** Free-text office notes (UI label: Notes). */
    noted: string;
    internal_remarks: string;
    /** Stored value; use `labelForOfficeApprovalStatus` for display. */
    approval_status: string;
    /** Director Photo ID row (PDF / DocuSeal). */
    director_photo_id: {
      passport: boolean;
      driving_license: boolean;
    };
    /** Address Proof row. */
    address_proof: {
      utility_bill: boolean;
      bank_statement: boolean;
    };
    /** Online Access row. */
    online_access: {
      companies_house: boolean;
      hmrc: boolean;
      paye: boolean;
      vat: boolean;
      bank: boolean;
      credit_card: boolean;
      other: boolean;
    };
  };
  signatures: {
    /**
     * Set on step 4: how the four forms are signed.
     * `in_person` — pad on each step (remote signing hidden on steps 1–3).
     * `remote_email` — one email on step 4 sends DocuSeal for all four documents (single recipient).
     */
    capture_mode?: "in_person" | "remote_email";
    client_registration: {
      name: string;
      position: string;
      date: string;
      signature: string;
    };
    hmrc_64_8: {
      name: string;
      date: string;
      signature: string;
    };
    change_accountant: {
      name: string;
      date: string;
      signature: string;
    };
    direct_debit: {
      name: string;
      date: string;
      signature: string;
    };
    /** Per-wizard-step signature slots (1�4 align with onboarding steps). Mirrors named keys for exports. */
    by_form_index?: Record<
      string,
      {
        form_key?: string;
        name?: string;
        position?: string;
        date?: string;
        signature?: string;
      }
    >;
  };
};

/** Companies House search hits (companies only), from GET /api/company-lookup/search */
export type CompaniesHouseSearchItem = {
  company_number: string;
  title: string;
  company_status: string;
  company_type: string;
  date_of_creation: string | null;
  address_snippet: string | null;
  description: string | null;
};

export type CompaniesHouseSearchResponse = {
  items: CompaniesHouseSearchItem[];
  total_results: number;
  page_number: number;
  items_per_page: number;
  start_index: number;
  /** Next `start_index` for CH `/search` (raw API pagination, not company-only count). */
  next_start_index: number;
};

/** `GET /api/company-lookup/complete?company_number=` — full CH bundle (profile + link GETs). */
export type CompanyLookupCompleteResponse = {
  company_number: string;
  company: Record<string, unknown>;
  companies_house: Record<string, unknown>;
};

/** API lookup returns nested partials in the same shape (snake_case). */
export type CompanyLookupPatch = Partial<{
  company: Partial<{
    name: string;
    number: string;
    type: string;
    nature_of_business: string;
    year_end: string;
    paye_number: string;
    company_status: string;
    date_of_creation: string;
    jurisdiction: string;
    address: Partial<{ line1: string; city: string; postcode: string; country: string }>;
  }>;
  contact: Partial<{ phone: string; email: string }>;
  companies_house: CompaniesHouseProfileSnapshot;
}>;

export const BUSINESS_TYPE_OPTIONS = [
  "Limited company",
  "Sole trader",
  "Partnership",
] as const;

/** Title-case labels for the select; values in `BUSINESS_TYPE_OPTIONS` stay stable for persisted JSON. */
export const BUSINESS_TYPE_LABELS: Record<(typeof BUSINESS_TYPE_OPTIONS)[number], string> = {
  "Limited company": "Limited Company",
  "Sole trader": "Sole Trader",
  Partnership: "Partnership",
};

/** Map `?type=` query values from the new-customer flow to `company.type` option values. */
export function companyTypeFromOnboardingUrl(urlType: string | null | undefined): string {
  const raw = String(urlType ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (!raw) return "";
  const map: Record<string, string> = {
    sole_trader: "Sole trader",
    partnership: "Partnership",
    limited: "Limited company",
    limited_company: "Limited company",
    ltd: "Limited company",
  };
  return map[raw] ?? "";
}

function normalizeBusinessTypeKey(type: string | null | undefined): string {
  return String(type ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/\s+/g, " ");
}

/** True when `company.type` is the Partnership option from `BUSINESS_TYPE_OPTIONS` (case-insensitive). */
export function isPartnershipCompanyType(type: string | null | undefined): boolean {
  return normalizeBusinessTypeKey(type) === "partnership";
}

/** True when `company.type` is the Sole trader option from `BUSINESS_TYPE_OPTIONS` (case-insensitive). */
export function isSoleTraderCompanyType(type: string | null | undefined): boolean {
  const t = normalizeBusinessTypeKey(type);
  return t === "sole trader" || t === "sole_trader" || t === "solo";
}

export function isSoleTraderOrPartnershipCompanyType(type: string | null | undefined): boolean {
  return isSoleTraderCompanyType(type) || isPartnershipCompanyType(type);
}

/** Prefer persisted `company.type`; fall back to `?type=` when the wizard URL pre-selects sole/partnership. */
export function effectiveOnboardingCompanyType(
  companyType: string | null | undefined,
  urlBusinessType?: string | null | undefined,
): string {
  const ct = String(companyType ?? "").trim();
  if (ct) return ct;
  return companyTypeFromOnboardingUrl(urlBusinessType);
}

/** Companies House auth codes apply to incorporated entities, not sole traders or partnerships. */
export function showCompaniesHouseAuthCode(
  type: string | null | undefined,
  urlBusinessType?: string | null | undefined,
): boolean {
  return !isSoleTraderOrPartnershipCompanyType(effectiveOnboardingCompanyType(type, urlBusinessType));
}

/** HMRC agent codes (SA/CT) on step 2 are omitted for sole traders and partnerships. */
export function showHmrcAgentCodes(type: string | null | undefined): boolean {
  return !isSoleTraderOrPartnershipCompanyType(type);
}

/** Onboarding `company.type` uses `BUSINESS_TYPE_OPTIONS` labels, not Companies House legal `company_type` strings. */
const ONBOARDING_BUSINESS_TYPE_VALUES_LC = new Set(
  (BUSINESS_TYPE_OPTIONS as readonly string[]).map((o) => o.toLowerCase()),
);

export const OFFICE_APPROVAL_STATUS_OPTIONS = [
  { value: "", label: "" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
] as const;

export function labelForOfficeApprovalStatus(value: string): string {
  const hit = OFFICE_APPROVAL_STATUS_OPTIONS.find((o) => o.value === value);
  return hit?.label ?? (value.trim() || "\u2014");
}

/** Older drafts used `noted` as a boolean; normalize for UI, PDF, and `.trim()`. */
export function coerceOfficeNoted(noted: unknown): string {
  if (typeof noted === "string") return noted;
  if (typeof noted === "boolean") return noted ? "Marked as noted (legacy)." : "";
  if (noted == null) return "";
  return String(noted);
}

const EMPTY_AGENT: CustomerOnboardingData["agent"] = {
  name: "",
  address: "",
  postcode: "",
  phone: "",
  agent_code_sa: "2697XV",
  agent_code_ct: "X7783A",
  client_reference: "",
  government_gateway_id: "",
  paye_agent_id_code: "",
};

export const EMPTY_HMRC_OPTIONS: CustomerOnboardingData["hmrc_options"] = {
  utr_not_yet_issued: false,
  send_statement_to_agent: false,
  vat_not_registered: false,
  cis_receive_online: false,
  cis_receive_phone_writing: false,
  paye_receive_online: false,
  paye_receive_phone_writing: false,
  joint_claimant_name: "",
  joint_claimant_ni_number: "",
  ref_self_assessment_ni_number: "",
  ref_self_assessment_utr: "",
  ref_trust_utr: "",
  ref_individual_paye_ni_number: "",
  ref_corporation_tax_utr: "",
  ref_tax_credits_ni_number: "",
  ref_cis_paye_ref: "",
  ref_employers_paye_ref: "",
  cis_government_gateway_id: "",
  cis_paye_agent_id_code: "",
  employers_government_gateway_id: "",
  employers_paye_agent_id_code: "",
};

/** Practice defaults for HMRC 64-8 agent block (step 2). */
export const DEFAULT_PRACTICE_AGENT_STATIC = {
  name: "3K Financial & Accounting Services Ltd",
  address: "128 City Road, London",
  postcode: "EC1V 2NX",
  phone: "03 300 300 303",
} as const;

/** Fixed CIS reference (matches new onboarding default). */
export const DEFAULT_PRACTICE_CIS_REFERENCE = "HZ5896";

/** Matches refs produced by `defaultAgentClientReference` (slug = lowercase alphanumerics only). */
const AUTO_CLIENT_REF_PATTERN = /^3K-[a-z0-9]+-\d+$/i;

const CLIENT_REF_SEQ_LS_KEY = "docparser.clientReferenceSeq";

/** Monotonic counter in localStorage for new auto-generated client references. */
export function allocClientReferenceSequence(): number {
  try {
    if (typeof window === "undefined") return Math.floor(Date.now() % 1_000_000);
    const prev = Number.parseInt(window.localStorage.getItem(CLIENT_REF_SEQ_LS_KEY) ?? "0", 10);
    const next = (Number.isFinite(prev) && prev >= 0 ? prev : 0) + 1;
    window.localStorage.setItem(CLIENT_REF_SEQ_LS_KEY, String(next));
    return next;
  } catch {
    return Math.floor(Date.now() % 1_000_000);
  }
}

/** Company / trader display name → single lowercase slug (no spaces or punctuation). */
export function slugifyCompanyOrClientName(raw: string): string {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 48);
  return s || "client";
}

/**
 * Client reference: `3K-{companyOrClientNameSlug}-{incrementalNumber}`.
 * Increment comes from `allocClientReferenceSequence()` on first auto-assign; if `currentReference`
 * already matches our auto pattern, the same numeric suffix is kept when only the name slug changes.
 */
export function defaultAgentClientReference(
  data: Pick<CustomerOnboardingData, "company">,
  currentReference?: string | null,
): string {
  const slug = slugifyCompanyOrClientName(data.company?.name ?? "");
  const cur = String(currentReference ?? "").trim();
  const m = /^3K-[a-z0-9]+-(\d+)$/i.exec(cur);
  const seq = m ? m[1] : String(allocClientReferenceSequence());
  return `3K-${slug}-${seq}`;
}

export function isAutoFilledAgentClientReference(value: string): boolean {
  return AUTO_CLIENT_REF_PATTERN.test(String(value ?? "").trim());
}

/**
 * HMRC 64-8 practice agent block must never be blank: drafts, autosaves, and older JSON often
 * store empty strings while `company.name` stays stable, so UI effects keyed only on the name
 * would not re-run. Call after revive, merge, and when building empty onboarding.
 */
export function ensurePracticeAgentBlock(data: CustomerOnboardingData): CustomerOnboardingData {
  const a = data.agent;
  const next = { ...a };
  let changed = false;
  if (!String(next.name ?? "").trim()) {
    next.name = DEFAULT_PRACTICE_AGENT_STATIC.name;
    changed = true;
  }
  if (!String(next.address ?? "").trim()) {
    next.address = DEFAULT_PRACTICE_AGENT_STATIC.address;
    changed = true;
  }
  if (!String(next.postcode ?? "").trim()) {
    next.postcode = DEFAULT_PRACTICE_AGENT_STATIC.postcode;
    changed = true;
  }
  if (!String(next.phone ?? "").trim()) {
    next.phone = DEFAULT_PRACTICE_AGENT_STATIC.phone;
    changed = true;
  }
  if (!String(next.agent_code_sa ?? "").trim()) {
    next.agent_code_sa = EMPTY_AGENT.agent_code_sa;
    changed = true;
  }
  if (!String(next.agent_code_ct ?? "").trim()) {
    next.agent_code_ct = EMPTY_AGENT.agent_code_ct;
    changed = true;
  }
  if (!String(next.client_reference ?? "").trim()) {
    next.client_reference = defaultAgentClientReference(data, next.client_reference);
    changed = true;
  }
  return changed ? { ...data, agent: next } : data;
}

/**
 * Copy step-1 tax/director references into HMRC 64-8 `hmrc_options` boxed fields when still empty.
 * VAT is read from `tax.vat_number` directly on the 64-8 form; only NI and UTR need copying here.
 */
export function ensureHmrcRefsFromStep1(data: CustomerOnboardingData): CustomerOnboardingData {
  const d0 = data.directors[0];
  const ni = String(d0?.ni_number ?? "").trim();
  const companyUtr = String(data.tax.utr ?? "").trim();
  const personalUtr = String(d0?.personal_utr ?? "").trim();
  const saUtr = personalUtr || companyUtr;

  const ho = data.hmrc_options;
  const nextHo = { ...ho };
  let changed = false;

  const assignIfEmpty = (
    key:
      | "ref_self_assessment_ni_number"
      | "ref_individual_paye_ni_number"
      | "ref_tax_credits_ni_number"
      | "ref_self_assessment_utr"
      | "ref_corporation_tax_utr",
    value: string,
  ) => {
    if (!value) return;
    const cur = String(nextHo[key] ?? "").trim();
    if (cur) return;
    nextHo[key] = value;
    changed = true;
  };

  assignIfEmpty("ref_self_assessment_ni_number", ni);
  assignIfEmpty("ref_individual_paye_ni_number", ni);
  assignIfEmpty("ref_tax_credits_ni_number", ni);
  assignIfEmpty("ref_self_assessment_utr", saUtr);
  assignIfEmpty("ref_corporation_tax_utr", companyUtr);

  return changed ? { ...data, hmrc_options: nextHo } : data;
}

function newDirectorUid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `d-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function emptyDirector(): DirectorEntry {
  return {
    uid: newDirectorUid(),
    name: "",
    address: "",
    city: "",
    postcode: "",
    personal_utr: "",
    ni_number: "",
    date_of_birth: "",
    paye_reference: "",
    identity_verification_code: "",
  };
}

/** Maximum directors / proprietors / partners allowed on a single onboarding record. */
export const MAX_DIRECTORS = 5;

/** Local calendar date as `YYYY-MM-DD` for `<input type="date">` (uses `Date` / clock, not UTC midnight). */
export function isoDateLocal(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeStoredSignatureDate(saved: unknown, fallbackDate: string): string {
  if (typeof saved === "string" && saved.trim()) return saved.trim();
  if (typeof fallbackDate === "string" && fallbackDate.trim()) return fallbackDate.trim();
  return isoDateLocal();
}

export function createEmptyCustomerOnboardingData(): CustomerOnboardingData {
  const signatureDateToday = isoDateLocal();
  return ensurePracticeAgentBlock({
    company: {
      name: "",
      number: "",
      type: "",
      nature_of_business: "",
      year_end: "",
      paye_number: "",
      // ✅ ADD THESE - they are required by your type
      registeredAddress: {
        line1: "",
        city: "",
        postcode: "",
        country: "",
      },
      traderAddress: {
        line1: "",
        city: "",
        postcode: "",
        country: "",
      },
      traderSameAsRegistered: false,
    },
    contact: { phone: "", email: "" },
    directors: [emptyDirector()],
    tax: {
      utr: "",
      auth_code: "",
      vat_number: "",
      vat_quarter: "",
      vat_return_due_date: "",
      paye_ref: "",
      ni_number: "",
      cis_reference: DEFAULT_PRACTICE_CIS_REFERENCE,
    },
    services: {
      bookkeeping: false,
      vat: false,
      quarterly_reports: false,
      year_end_accounts: false,
      personal_tax_return: false,
      payroll: { enabled: false, employee_count: 0, frequency: "" },
    },
    annual_turnover_gbp: null,
    subscription_plan_id: "",
    subscription_plan_name: "",
    subscription_billing_cycle: "monthly",
    subscription_payee_users: 1,
    subscription_is_dormant: false,
    subscription_matrix_plan_id: "",
    subscription_matrix_plan_name: "",
    subscription_matrix_plan_price_inc_vat_gbp: null,
    subscription_selected_service_ids: [],
    subscription_selected_services: [],
    agent: { ...EMPTY_AGENT },
    bank: {
      account_holder_name: "",
      account_number: "",
      sort_code: "",
      bank_address: "",
    },
    change_of_accountant: {
      previous_accountant_name: "",
      previous_accountant_address: {
        line1: "",
        city: "",
        postcode: "",
        country: "",
      },
    },
    authorization: {
      self_assessment: false,
      partnership: false,
      trust: false,
      vat: false,
      paye: false,
      corporation_tax: true,
      tax_credits: false,
      cis: true,
    },
    hmrc_options: { ...EMPTY_HMRC_OPTIONS },
    office_use: {
      noted: "",
      internal_remarks: "",
      approval_status: "",
      director_photo_id: { passport: false, driving_license: false },
      address_proof: { utility_bill: false, bank_statement: false },
      online_access: {
        companies_house: false,
        hmrc: false,
        paye: false,
        vat: false,
        bank: false,
        credit_card: false,
        other: false,
      },
    },
    signatures: {
      client_registration: { name: "", position: "", date: signatureDateToday, signature: "" },
      hmrc_64_8: { name: "", date: signatureDateToday, signature: "" },
      change_accountant: { name: "", date: signatureDateToday, signature: "" },
      direct_debit: { name: "", date: signatureDateToday, signature: "" },
      by_form_index: {},
    },
  });
}

function takeStr(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

/** Merge lookup patch: only non-empty string leaves overwrite. */
export function mergeCompanyLookup(
  current: CustomerOnboardingData,
  patch: CompanyLookupPatch,
): CustomerOnboardingData {
  const next: CustomerOnboardingData = {
    ...current,
    company: {
      ...current.company,
      registeredAddress: { ...current.company.registeredAddress },
    },
    companies_house: current.companies_house,
    contact: { ...current.contact },
    tax: { ...current.tax },
    services: { ...current.services, payroll: { ...current.services.payroll } },
    agent: { ...current.agent },
    bank: { ...current.bank },
    change_of_accountant: {
      previous_accountant_name: current.change_of_accountant.previous_accountant_name,
      previous_accountant_address: {
        ...current.change_of_accountant.previous_accountant_address,
      },
    },
    authorization: { ...current.authorization },
    hmrc_options: { ...current.hmrc_options },
    office_use: {
      ...current.office_use,
      director_photo_id: { ...current.office_use.director_photo_id },
      address_proof: { ...current.office_use.address_proof },
      online_access: { ...current.office_use.online_access },
    },
    signatures: {
      ...(current.signatures.capture_mode === "in_person" || current.signatures.capture_mode === "remote_email"
        ? { capture_mode: current.signatures.capture_mode }
        : {}),
      client_registration: { ...current.signatures.client_registration },
      hmrc_64_8: { ...current.signatures.hmrc_64_8 },
      change_accountant: { ...current.signatures.change_accountant },
      direct_debit: { ...current.signatures.direct_debit },
      ...(current.signatures.by_form_index
        ? { by_form_index: { ...current.signatures.by_form_index } }
        : {}),
    },
    directors: current.directors.map((d) => ({ ...d })),
  };

  const pc = patch.company;
  if (pc) {
    const n = takeStr(pc.name);
    const num = takeStr(pc.number);
    const ty = takeStr(pc.type);
    const nob = takeStr(pc.nature_of_business);
    const ye = takeStr(pc.year_end);
    const cst = takeStr(pc.company_status);
    const doc = takeStr(pc.date_of_creation);
    const jur = takeStr(pc.jurisdiction);
    if (n !== undefined) next.company.name = n;
    if (num !== undefined) next.company.number = num;
    /**
     * Do not overwrite `company.type` once the user has chosen a business type (e.g. Partnership).
     * Companies House merge maps legal `type` to labels like "Limited company", which would
     * replace Partnership after lookup. Only fill from CH when the field is still empty.
     */
    if (ty !== undefined && !current.company.type.trim()) {
      const norm = ty.trim().toLowerCase();
      if (ONBOARDING_BUSINESS_TYPE_VALUES_LC.has(norm)) {
        next.company.type = ty;
      }
    }
    if (nob !== undefined) next.company.nature_of_business = nob;
    if (ye !== undefined) next.company.year_end = ye;
    if (cst !== undefined) next.company.company_status = cst;
    if (doc !== undefined) next.company.date_of_creation = doc;
    if (jur !== undefined) next.company.jurisdiction = jur;
    if (pc.address) {
      const a = pc.address;
      const l1 = takeStr(a.line1);
      const c = takeStr(a.city);
      const p = takeStr(a.postcode);
      const country = takeStr(a.country);
      if (l1 !== undefined) next.company.registeredAddress.line1 = l1;
      if (c !== undefined) next.company.registeredAddress.city = c;
      if (p !== undefined) next.company.registeredAddress.postcode = p;
      if (country !== undefined) next.company.registeredAddress.country = country;
    }
  }

  if (patch.companies_house && typeof patch.companies_house === "object") {
    next.companies_house = { ...patch.companies_house };
  }

  if (next.company.traderSameAsRegistered) {
    next.company.traderAddress = { ...next.company.registeredAddress };
  }

  if (patch.contact) {
    const ph = takeStr(patch.contact.phone);
    const em = takeStr(patch.contact.email);
    if (ph !== undefined) next.contact.phone = ph;
    if (em !== undefined) next.contact.email = em;
  }

  return ensurePracticeAgentBlock(next);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function reviveDirector(row: unknown): DirectorEntry {
  if (!isPlainObject(row)) return emptyDirector();
  const uidRaw = row.uid;
  const uid = typeof uidRaw === "string" && uidRaw.trim() ? uidRaw.trim() : undefined;
  const str = (keys: string[]): string => {
    for (const k of keys) {
      const v = row[k];
      if (typeof v === "string") return v;
    }
    return "";
  };
  return {
    ...(uid ? { uid } : {}),
    name: typeof row.name === "string" ? row.name : "",
    address: typeof row.address === "string" ? row.address : "",
    city: typeof row.city === "string" ? row.city : "",
    postcode: typeof row.postcode === "string" ? row.postcode : "",
    personal_utr: str(["personal_utr", "personalUtr", "personal_utr_d1", "personal_utr_d2"]),
    ni_number: str(["ni_number", "niNumber", "ni_no"]),
    date_of_birth: str(["date_of_birth", "dateOfBirth", "dob"]),
    paye_reference: str(["paye_reference", "payeReference", "paye_ref"]),
    identity_verification_code: str([
      "identity_verification_code",
      "identityVerificationCode",
      "director_code",
      "directorCode",
    ]),
  };
}

/** Deep-merge stored JSON into the canonical shape (handles partial / older saves). */
export function reviveCustomerOnboarding(raw: unknown): CustomerOnboardingData {
  if (raw !== null && typeof raw === "object" && "companyName" in (raw as object)) {
    return migrateLegacyFlatOnboarding(raw as Record<string, unknown>);
  }
  const base = createEmptyCustomerOnboardingData();
  if (!isPlainObject(raw)) return base;

  const o = raw as Record<string, unknown>;

  if (isPlainObject(o.company)) {
    const c = o.company as Record<string, unknown>;
    base.company = {
      ...base.company,
      name: typeof c.name === "string" ? c.name : base.company.name,
      number: typeof c.number === "string" ? c.number : base.company.number,
      type: typeof c.type === "string" ? c.type : base.company.type,
      nature_of_business:
        typeof c.nature_of_business === "string" ? c.nature_of_business : base.company.nature_of_business,
      year_end: typeof c.year_end === "string" ? c.year_end : base.company.year_end,
      paye_number: typeof c.paye_number === "string" ? c.paye_number : base.company.paye_number,
      company_status:
        typeof c.company_status === "string" ? c.company_status : base.company.company_status,
      date_of_creation:
        typeof c.date_of_creation === "string" ? c.date_of_creation : base.company.date_of_creation,
      jurisdiction: typeof c.jurisdiction === "string" ? c.jurisdiction : base.company.jurisdiction,
      registeredAddress: { ...base.company.registeredAddress, ...(isPlainObject(c.registeredAddress) ? reviveAddress(c.registeredAddress) : {}) },
      traderAddress: { ...base.company.traderAddress, ...(isPlainObject(c.traderAddress) ? reviveAddress(c.traderAddress) : {}) },
      traderSameAsRegistered:
        typeof c.traderSameAsRegistered === "boolean" ? c.traderSameAsRegistered : base.company.traderSameAsRegistered,
    };
  }

  if (isPlainObject(o.companies_house)) {
    base.companies_house = o.companies_house as CompaniesHouseProfileSnapshot;
  }

  if (isPlainObject(o.contact)) {
    const c = o.contact as Record<string, unknown>;
    base.contact = {
      phone: typeof c.phone === "string" ? c.phone : base.contact.phone,
      email: typeof c.email === "string" ? c.email : base.contact.email,
    };
  }

  if (Array.isArray(o.directors) && o.directors.length > 0) {
    base.directors = o.directors.map(reviveDirector);
  }

  if (isPlainObject(o.tax)) {
    const t = o.tax as Record<string, unknown>;
    base.tax = {
      utr: typeof t.utr === "string" ? t.utr : base.tax.utr,
      auth_code: typeof t.auth_code === "string" ? t.auth_code : base.tax.auth_code,
      vat_number: typeof t.vat_number === "string" ? t.vat_number : base.tax.vat_number,
      vat_quarter: typeof t.vat_quarter === "string" ? t.vat_quarter : base.tax.vat_quarter,
      vat_return_due_date:
        typeof t.vat_return_due_date === "string"
          ? t.vat_return_due_date
          : base.tax.vat_return_due_date,
      paye_ref: typeof t.paye_ref === "string" ? t.paye_ref : base.tax.paye_ref,
      ni_number: typeof t.ni_number === "string" ? t.ni_number : base.tax.ni_number,
      cis_reference: typeof t.cis_reference === "string" ? t.cis_reference : base.tax.cis_reference,
    };
  }

  if (isPlainObject(o.services)) {
    const s = o.services as Record<string, unknown>;
    const payrollMerged =
      typeof s.payroll === "boolean"
        ? { ...base.services.payroll, enabled: s.payroll }
        : revivePayroll(s.payroll, base.services.payroll);
    base.services = {
      bookkeeping: typeof s.bookkeeping === "boolean" ? s.bookkeeping : base.services.bookkeeping,
      vat: typeof s.vat === "boolean" ? s.vat : base.services.vat,
      quarterly_reports:
        typeof s.quarterly_reports === "boolean" ? s.quarterly_reports : base.services.quarterly_reports,
      year_end_accounts:
        typeof s.year_end_accounts === "boolean" ? s.year_end_accounts : base.services.year_end_accounts,
      personal_tax_return:
        typeof s.personal_tax_return === "boolean" ? s.personal_tax_return : base.services.personal_tax_return,
      payroll: payrollMerged,
    };
  }

  if (isPlainObject(o.agent)) {
    const a = o.agent as Record<string, unknown>;
    base.agent = {
      name: typeof a.name === "string" ? a.name : base.agent.name,
      address: typeof a.address === "string" ? a.address : base.agent.address,
      postcode: typeof a.postcode === "string" ? a.postcode : base.agent.postcode,
      phone: typeof a.phone === "string" ? a.phone : base.agent.phone,
      agent_code_sa: typeof a.agent_code_sa === "string" ? a.agent_code_sa : base.agent.agent_code_sa,
      agent_code_ct: typeof a.agent_code_ct === "string" ? a.agent_code_ct : base.agent.agent_code_ct,
      client_reference:
        typeof a.client_reference === "string" ? a.client_reference : base.agent.client_reference,
      government_gateway_id:
        typeof a.government_gateway_id === "string"
          ? a.government_gateway_id
          : base.agent.government_gateway_id,
      paye_agent_id_code:
        typeof a.paye_agent_id_code === "string" ? a.paye_agent_id_code : base.agent.paye_agent_id_code,
    };
  }

  if (isPlainObject(o.hmrc_options)) {
    const h = o.hmrc_options as Record<string, unknown>;
    const b = base.hmrc_options;
    base.hmrc_options = {
      utr_not_yet_issued:
        typeof h.utr_not_yet_issued === "boolean" ? h.utr_not_yet_issued : b.utr_not_yet_issued,
      send_statement_to_agent:
        typeof h.send_statement_to_agent === "boolean"
          ? h.send_statement_to_agent
          : b.send_statement_to_agent,
      vat_not_registered:
        typeof h.vat_not_registered === "boolean" ? h.vat_not_registered : b.vat_not_registered,
      cis_receive_online:
        typeof h.cis_receive_online === "boolean" ? h.cis_receive_online : b.cis_receive_online,
      cis_receive_phone_writing:
        typeof h.cis_receive_phone_writing === "boolean"
          ? h.cis_receive_phone_writing
          : b.cis_receive_phone_writing,
      paye_receive_online:
        typeof h.paye_receive_online === "boolean" ? h.paye_receive_online : b.paye_receive_online,
      paye_receive_phone_writing:
        typeof h.paye_receive_phone_writing === "boolean"
          ? h.paye_receive_phone_writing
          : b.paye_receive_phone_writing,
      joint_claimant_name:
        typeof h.joint_claimant_name === "string" ? h.joint_claimant_name : b.joint_claimant_name,
      joint_claimant_ni_number:
        typeof h.joint_claimant_ni_number === "string"
          ? h.joint_claimant_ni_number
          : b.joint_claimant_ni_number,
      ref_self_assessment_ni_number:
        typeof h.ref_self_assessment_ni_number === "string"
          ? h.ref_self_assessment_ni_number
          : b.ref_self_assessment_ni_number,
      ref_self_assessment_utr:
        typeof h.ref_self_assessment_utr === "string" ? h.ref_self_assessment_utr : b.ref_self_assessment_utr,
      ref_trust_utr: typeof h.ref_trust_utr === "string" ? h.ref_trust_utr : b.ref_trust_utr,
      ref_individual_paye_ni_number:
        typeof h.ref_individual_paye_ni_number === "string"
          ? h.ref_individual_paye_ni_number
          : b.ref_individual_paye_ni_number,
      ref_corporation_tax_utr:
        typeof h.ref_corporation_tax_utr === "string" ? h.ref_corporation_tax_utr : b.ref_corporation_tax_utr,
      ref_tax_credits_ni_number:
        typeof h.ref_tax_credits_ni_number === "string"
          ? h.ref_tax_credits_ni_number
          : b.ref_tax_credits_ni_number,
      ref_cis_paye_ref: typeof h.ref_cis_paye_ref === "string" ? h.ref_cis_paye_ref : b.ref_cis_paye_ref,
      ref_employers_paye_ref:
        typeof h.ref_employers_paye_ref === "string" ? h.ref_employers_paye_ref : b.ref_employers_paye_ref,
      cis_government_gateway_id:
        typeof h.cis_government_gateway_id === "string"
          ? h.cis_government_gateway_id
          : b.cis_government_gateway_id,
      cis_paye_agent_id_code:
        typeof h.cis_paye_agent_id_code === "string" ? h.cis_paye_agent_id_code : b.cis_paye_agent_id_code,
      employers_government_gateway_id:
        typeof h.employers_government_gateway_id === "string"
          ? h.employers_government_gateway_id
          : b.employers_government_gateway_id,
      employers_paye_agent_id_code:
        typeof h.employers_paye_agent_id_code === "string"
          ? h.employers_paye_agent_id_code
          : b.employers_paye_agent_id_code,
    };
  }

  if (isPlainObject(o.bank)) {
    const b = o.bank as Record<string, unknown>;
    base.bank = {
      account_holder_name:
        typeof b.account_holder_name === "string" ? b.account_holder_name : base.bank.account_holder_name,
      account_number: typeof b.account_number === "string" ? b.account_number : base.bank.account_number,
      sort_code: typeof b.sort_code === "string" ? b.sort_code : base.bank.sort_code,
      bank_address: typeof b.bank_address === "string" ? b.bank_address : base.bank.bank_address,
    };
  }

  if (isPlainObject(o.change_of_accountant)) {
    const ca = o.change_of_accountant as Record<string, unknown>;
    const addr = isPlainObject(ca.previous_accountant_address)
      ? (ca.previous_accountant_address as Record<string, unknown>)
      : {};
    base.change_of_accountant = {
      previous_accountant_name:
        typeof ca.previous_accountant_name === "string"
          ? ca.previous_accountant_name
          : base.change_of_accountant.previous_accountant_name,
      previous_accountant_address: {
        ...base.change_of_accountant.previous_accountant_address,
        ...reviveAddress(addr),
      },
    };
  }

  if (isPlainObject(o.authorization)) {
    const a = o.authorization as Record<string, unknown>;
    base.authorization = {
      self_assessment:
        typeof a.self_assessment === "boolean" ? a.self_assessment : base.authorization.self_assessment,
      partnership: typeof a.partnership === "boolean" ? a.partnership : base.authorization.partnership,
      trust: typeof a.trust === "boolean" ? a.trust : base.authorization.trust,
      vat: typeof a.vat === "boolean" ? a.vat : base.authorization.vat,
      paye: typeof a.paye === "boolean" ? a.paye : base.authorization.paye,
      corporation_tax:
        typeof a.corporation_tax === "boolean" ? a.corporation_tax : base.authorization.corporation_tax,
      tax_credits: typeof a.tax_credits === "boolean" ? a.tax_credits : base.authorization.tax_credits,
      cis: typeof a.cis === "boolean" ? a.cis : base.authorization.cis,
    };
  }

  if (isPlainObject(o.office_use)) {
    const ou = o.office_use as Record<string, unknown>;
    const notedStr = coerceOfficeNoted("noted" in ou ? ou.noted : base.office_use.noted);
    const dip = isPlainObject(ou.director_photo_id) ? (ou.director_photo_id as Record<string, unknown>) : undefined;
    const ap = isPlainObject(ou.address_proof) ? (ou.address_proof as Record<string, unknown>) : undefined;
    const oa = isPlainObject(ou.online_access) ? (ou.online_access as Record<string, unknown>) : undefined;
    const b = base.office_use;
    base.office_use = {
      noted: notedStr,
      internal_remarks:
        typeof ou.internal_remarks === "string" ? ou.internal_remarks : base.office_use.internal_remarks,
      approval_status:
        typeof ou.approval_status === "string" ? ou.approval_status : base.office_use.approval_status,
      director_photo_id: {
        passport: typeof dip?.passport === "boolean" ? dip.passport : b.director_photo_id.passport,
        driving_license:
          typeof dip?.driving_license === "boolean" ? dip.driving_license : b.director_photo_id.driving_license,
      },
      address_proof: {
        utility_bill:
          typeof ap?.utility_bill === "boolean" ? ap.utility_bill : b.address_proof.utility_bill,
        bank_statement:
          typeof ap?.bank_statement === "boolean" ? ap.bank_statement : b.address_proof.bank_statement,
      },
      online_access: {
        companies_house:
          typeof oa?.companies_house === "boolean" ? oa.companies_house : b.online_access.companies_house,
        hmrc: typeof oa?.hmrc === "boolean" ? oa.hmrc : b.online_access.hmrc,
        paye: typeof oa?.paye === "boolean" ? oa.paye : b.online_access.paye,
        vat: typeof oa?.vat === "boolean" ? oa.vat : b.online_access.vat,
        bank: typeof oa?.bank === "boolean" ? oa.bank : b.online_access.bank,
        credit_card: typeof oa?.credit_card === "boolean" ? oa.credit_card : b.online_access.credit_card,
        other: typeof oa?.other === "boolean" ? oa.other : b.online_access.other,
      },
    };
  }

  if (typeof o.annual_turnover_gbp === "number" && Number.isFinite(o.annual_turnover_gbp)) {
    base.annual_turnover_gbp = o.annual_turnover_gbp;
  } else if (typeof o.annual_turnover_gbp === "string" && o.annual_turnover_gbp.trim() !== "") {
    const tn = Number(o.annual_turnover_gbp);
    if (Number.isFinite(tn)) base.annual_turnover_gbp = tn;
  }
  if (typeof o.subscription_plan_id === "string") {
    base.subscription_plan_id = o.subscription_plan_id;
  }
  if (typeof o.subscription_plan_name === "string") {
    base.subscription_plan_name = o.subscription_plan_name;
  }
  if (typeof o.subscription_billing_cycle === "string") {
    base.subscription_billing_cycle = o.subscription_billing_cycle;
  }
  if (typeof o.subscription_payee_users === "number" && Number.isFinite(o.subscription_payee_users)) {
    base.subscription_payee_users = o.subscription_payee_users;
  } else if (typeof o.subscription_payee_users === "string" && o.subscription_payee_users.trim() !== "") {
    const pn = Number(o.subscription_payee_users);
    if (Number.isFinite(pn)) base.subscription_payee_users = Math.max(0, Math.floor(pn));
  }
  if (typeof o.subscription_is_dormant === "boolean") {
    base.subscription_is_dormant = o.subscription_is_dormant;
  }
  if (typeof o.subscription_matrix_plan_id === "string") {
    base.subscription_matrix_plan_id = o.subscription_matrix_plan_id;
  }
  if (typeof o.subscription_matrix_plan_name === "string") {
    base.subscription_matrix_plan_name = o.subscription_matrix_plan_name;
  }
  if (typeof o.subscription_matrix_plan_price_inc_vat_gbp === "number" && Number.isFinite(o.subscription_matrix_plan_price_inc_vat_gbp)) {
    base.subscription_matrix_plan_price_inc_vat_gbp = o.subscription_matrix_plan_price_inc_vat_gbp;
  } else if (o.subscription_matrix_plan_price_inc_vat_gbp === null) {
    base.subscription_matrix_plan_price_inc_vat_gbp = null;
  } else if (typeof o.subscription_matrix_plan_price_inc_vat_gbp === "string" && o.subscription_matrix_plan_price_inc_vat_gbp.trim() !== "") {
    const pn = Number(o.subscription_matrix_plan_price_inc_vat_gbp);
    if (Number.isFinite(pn)) base.subscription_matrix_plan_price_inc_vat_gbp = pn;
  }
  if (Array.isArray(o.subscription_selected_service_ids)) {
    const ids = o.subscription_selected_service_ids
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);
    base.subscription_selected_service_ids = [...new Set(ids)];
  }
  if (Array.isArray(o.subscription_selected_services)) {
    const rows: { id: string; name: string }[] = [];
    for (const it of o.subscription_selected_services) {
      if (!it || typeof it !== "object" || Array.isArray(it)) continue;
      const r = it as Record<string, unknown>;
      const id = typeof r.id === "string" ? r.id.trim() : "";
      if (!id) continue;
      rows.push({ id, name: typeof r.name === "string" ? r.name.trim() : "" });
    }
    base.subscription_selected_services = rows;
  }

  if (isPlainObject(o.signatures)) {
    const sig = o.signatures as Record<string, unknown>;
    const byIdx = sig.by_form_index;
    const cm = sig.capture_mode;
    base.signatures = {
      ...(cm === "in_person" || cm === "remote_email" ? { capture_mode: cm } : {}),
      client_registration: reviveSigBlock4(sig.client_registration, base.signatures.client_registration),
      hmrc_64_8: reviveSigBlock3(sig.hmrc_64_8, base.signatures.hmrc_64_8),
      change_accountant: reviveSigBlock3(sig.change_accountant, base.signatures.change_accountant),
      direct_debit: reviveSigBlock3(sig.direct_debit, base.signatures.direct_debit),
      ...(isPlainObject(byIdx)
        ? {
            by_form_index: {
              ...(byIdx as NonNullable<CustomerOnboardingData["signatures"]["by_form_index"]>),
            },
          }
        : {}),
    };
  }

  return ensurePracticeAgentBlock(base);
}

function reviveAddress(a: Record<string, unknown>): Partial<CustomerOnboardingData["company"]["registeredAddress"]> {
  const out: Partial<CustomerOnboardingData["company"]["registeredAddress"]> = {};
  if (typeof a.line1 === "string") out.line1 = a.line1;
  if (typeof a.city === "string") out.city = a.city;
  if (typeof a.postcode === "string") out.postcode = a.postcode;
  if (typeof a.country === "string") out.country = a.country;
  return out;
}

function revivePayroll(
  raw: unknown,
  fallback: CustomerOnboardingData["services"]["payroll"],
): CustomerOnboardingData["services"]["payroll"] {
  if (!isPlainObject(raw)) return { ...fallback };
  const p = raw as Record<string, unknown>;
  const ec = p.employee_count;
  return {
    enabled: typeof p.enabled === "boolean" ? p.enabled : fallback.enabled,
    employee_count: typeof ec === "number" && Number.isFinite(ec) ? ec : fallback.employee_count,
    frequency: typeof p.frequency === "string" ? p.frequency : fallback.frequency,
  };
}

function reviveSigBlock4(
  raw: unknown,
  fallback: CustomerOnboardingData["signatures"]["client_registration"],
): CustomerOnboardingData["signatures"]["client_registration"] {
  if (!isPlainObject(raw)) return { ...fallback };
  const s = raw as Record<string, unknown>;
  return {
    name: typeof s.name === "string" ? s.name : fallback.name,
    position: typeof s.position === "string" ? s.position : fallback.position,
    date: normalizeStoredSignatureDate(s.date, fallback.date),
    signature: typeof s.signature === "string" ? s.signature : fallback.signature,
  };
}

function reviveSigBlock3(
  raw: unknown,
  fallback: CustomerOnboardingData["signatures"]["hmrc_64_8"],
): CustomerOnboardingData["signatures"]["hmrc_64_8"] {
  if (!isPlainObject(raw)) return { ...fallback };
  const s = raw as Record<string, unknown>;
  return {
    name: typeof s.name === "string" ? s.name : fallback.name,
    date: normalizeStoredSignatureDate(s.date, fallback.date),
    signature: typeof s.signature === "string" ? s.signature : fallback.signature,
  };
}

/** Migrate pre-nested flat onboarding object from localStorage / old API. */
function migrateLegacyFlatOnboarding(o: Record<string, unknown>): CustomerOnboardingData {
  const empty = createEmptyCustomerOnboardingData();
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");

  const legacyServices = o.services as Record<string, unknown> | undefined;
  const legacyTaxAuth = o.taxAuthorization as Record<string, unknown> | undefined;
  const payrollEnabled =
    typeof legacyServices?.payroll === "boolean" ? (legacyServices.payroll as boolean) : false;

  return reviveCustomerOnboarding({
    company: {
      name: str("companyName"),
      number: str("companyRegistrationNumber"),
      type: str("businessType"),
      nature_of_business: str("natureOfBusiness"),
      year_end: str("yearEnd"),
      address: {
        line1: str("addressLine1"),
        city: str("city"),
        postcode: str("postcode"),
      },
    },
    contact: {
      phone: str("phoneNumber"),
      email: str("emailAddress"),
    },
    directors: Array.isArray(o.directors) ? o.directors : empty.directors,
    tax: {
      utr: str("utr"),
      auth_code: str("auth_code") || str("authCode") || str("companiesHouseAuthCode"),
      vat_number: str("vatNumber"),
      vat_quarter: str("vatQuarter"),
      vat_return_due_date: str("vatReturnDueDate"),
      paye_ref: str("payeReference"),
      ni_number: str("niNumber"),
      cis_reference: str("cisReference"),
    },
    services: {
      bookkeeping: !!legacyServices?.bookkeeping,
      vat: !!legacyServices?.vat,
      quarterly_reports: !!legacyServices?.quarterlyReports,
      year_end_accounts: !!legacyServices?.yearEndAccounts,
      personal_tax_return: !!legacyServices?.personalTaxReturn,
      payroll: {
        enabled: payrollEnabled,
        employee_count: Number.parseInt(String(o.payrollNumberOfEmployees ?? "0"), 10) || 0,
        frequency: typeof o.payrollFrequency === "string" ? o.payrollFrequency : "",
      },
    },
    agent: {
      name: str("agentName") || empty.agent.name,
      address: str("agentAddress") || empty.agent.address,
      postcode: str("agentPostcode") || empty.agent.postcode,
      phone: str("agentPhone"),
      agent_code_sa: str("agentCodeSA"),
      agent_code_ct: str("agentCodeCT"),
      client_reference: str("clientReference"),
    },
    bank: {
      account_holder_name: str("accountHolderName"),
      account_number: str("accountNumber"),
      sort_code: str("sortCode"),
      bank_address: str("bankAddress"),
    },
    authorization: {
      self_assessment: !!legacyTaxAuth?.selfAssessment,
      partnership: !!legacyTaxAuth?.partnership,
      trust: !!legacyTaxAuth?.trust,
      vat: !!legacyTaxAuth?.vat,
      paye: !!legacyTaxAuth?.paye,
      corporation_tax: true,
      tax_credits: false,
      cis: true,
    },
    hmrc_options: { ...EMPTY_HMRC_OPTIONS },
    signatures: {
      client_registration: {
        name: str("signatoryName"),
        position: str("signatoryPosition"),
        date: str("signatureDate"),
        signature: str("signature"),
      },
      hmrc_64_8: {
        name: str("signatoryName"),
        date: str("signatureDate"),
        signature: str("signature"),
      },
      change_accountant: {
        name: str("signatoryName"),
        date: str("changeOfAccountantLetterDate") || str("signatureDate"),
        signature: str("signature"),
      },
      direct_debit: {
        name: str("signatoryName"),
        date: str("signatureDate"),
        signature: str("signature"),
      },
    },
  });
}

/**
 * Customer onboarding � single JSON document (DB SSOT). Keys are snake_case to match stored JSON.
 * Multiple form controls bind to the same paths (e.g. company.name, tax.utr, company.gstin) so values stay in sync.
 */

import crypto from "node:crypto";

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

export type CustomerOnboardingData = {
  company: {
    name: string;
    number: string;
    type: string;
    nature_of_business: string;
    year_end: string;
    /** Employer PAYE number (company-level; all business types). */
    paye_number: string;
    /** GSTIN (15 chars) — validated client-side; state derived from first two digits. */
    gstin?: string;
    /** PAN (10 chars, AAAAA9999A). */
    pan?: string;
    /** Business constitution. */
    constitution?:
      | "proprietorship"
      | "partnership"
      | "llp"
      | "private_limited"
      | "public_limited"
      | "other";
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
  contact: {
    phone: string;
    email: string;
  };
  directors: DirectorEntry[];
  tax: {
    utr: string;
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
  subscription_billing_cycle?: string | null;
  subscription_payee_users?: number | null;
  subscription_is_dormant?: boolean | null;
  subscription_matrix_plan_id?: string;
  subscription_matrix_plan_name?: string;
  /**
   * `pricing.final` from matrix recommend for the selected plan (inc. VAT per billing cycle).
   * Stored for PDF / exports.
   */
  subscription_matrix_plan_price_inc_vat_gbp?: number | null;
  subscription_selected_service_ids?: string[];
  /** Denormalised names for selected service ids (PDF/export). */
  subscription_selected_services?: { id: string; name: string }[];
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
      gst: boolean;
      paye: boolean;
      vat: boolean;
      bank: boolean;
      credit_card: boolean;
      other: boolean;
    };
  };
  signatures: {
    /**
     * How the documents are signed.
     * `in_person` — pad on each step (remote signing hidden on steps before the last).
     * `remote_email` — one email sends DocuSeal for all remaining documents (single recipient).
     */
    capture_mode?: "in_person" | "remote_email";
    client_registration: {
      name: string;
      position: string;
      date: string;
      signature: string;
    };
    change_accountant: {
      name: string;
      date: string;
      signature: string;
    };
    /** Per-wizard-step signature slots. Mirrors named keys for exports. */
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

/** API lookup returns nested partials in the same shape (snake_case). */
export type CompanyLookupPatch = Partial<{
  company: Partial<{
    name: string;
    number: string;
    type: string;
    nature_of_business: string;
    year_end: string;
    paye_number: string;
    address: Partial<{ line1: string; city: string; postcode: string; country: string }>;
  }>;
  contact: Partial<{ phone: string; email: string }>;
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

/** Fixed CIS reference (matches new onboarding default). */
export const DEFAULT_PRACTICE_CIS_REFERENCE = "HZ5896";

export function emptyDirector(): DirectorEntry {
  return {
    uid: crypto.randomUUID(),
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
  return {
    company: {
      name: "",
      number: "",
      type: "",
      nature_of_business: "",
      year_end: "",
      paye_number: "",
      gstin: "",
      pan: "",
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
    change_of_accountant: {
      previous_accountant_name: "",
      previous_accountant_address: {
        line1: "",
        city: "",
        postcode: "",
        country: "",
      },
    },
    office_use: {
      noted: "",
      internal_remarks: "",
      approval_status: "",
      director_photo_id: { passport: false, driving_license: false },
      address_proof: { utility_bill: false, bank_statement: false },
      online_access: {
        companies_house: false,
        gst: false,
        paye: false,
        vat: false,
        bank: false,
        credit_card: false,
        other: false,
      },
    },
    signatures: {
      client_registration: { name: "", position: "", date: signatureDateToday, signature: "" },
      change_accountant: { name: "", date: signatureDateToday, signature: "" },
      by_form_index: {},
    },
  };
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
    contact: { ...current.contact },
    tax: { ...current.tax },
    services: { ...current.services, payroll: { ...current.services.payroll } },
    change_of_accountant: {
      previous_accountant_name: current.change_of_accountant.previous_accountant_name,
      previous_accountant_address: {
        ...current.change_of_accountant.previous_accountant_address,
      },
    },
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
      change_accountant: { ...current.signatures.change_accountant },
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
    if (n !== undefined) next.company.name = n;
    if (num !== undefined) next.company.number = num;
    /**
     * Do not overwrite `company.type` once the user has chosen a business type (e.g. Partnership).
     * Only fill from lookup when the field is still empty.
     */
    if (ty !== undefined && !current.company.type.trim()) {
      const norm = ty.trim().toLowerCase();
      if (ONBOARDING_BUSINESS_TYPE_VALUES_LC.has(norm)) {
        next.company.type = ty;
      }
    }
    if (nob !== undefined) next.company.nature_of_business = nob;
    if (ye !== undefined) next.company.year_end = ye;
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

  if (next.company.traderSameAsRegistered) {
    next.company.traderAddress = { ...next.company.registeredAddress };
  }

  if (patch.contact) {
    const ph = takeStr(patch.contact.phone);
    const em = takeStr(patch.contact.email);
    if (ph !== undefined) next.contact.phone = ph;
    if (em !== undefined) next.contact.email = em;
  }

  return next;
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
      gstin: typeof c.gstin === "string" ? c.gstin : base.company.gstin,
      pan: typeof c.pan === "string" ? c.pan : base.company.pan,
      constitution:
        c.constitution === "proprietorship" ||
        c.constitution === "partnership" ||
        c.constitution === "llp" ||
        c.constitution === "private_limited" ||
        c.constitution === "public_limited" ||
        c.constitution === "other"
          ? c.constitution
          : base.company.constitution,
      registeredAddress: { ...base.company.registeredAddress, ...(isPlainObject(c.registeredAddress) ? reviveAddress(c.registeredAddress) : {}) },
      traderAddress: { ...base.company.traderAddress, ...(isPlainObject(c.traderAddress) ? reviveAddress(c.traderAddress) : {}) },
      traderSameAsRegistered:
        typeof c.traderSameAsRegistered === "boolean" ? c.traderSameAsRegistered : base.company.traderSameAsRegistered,
    };
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
        gst: typeof oa?.gst === "boolean" ? oa.gst : b.online_access.gst,
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
      change_accountant: reviveSigBlock3(sig.change_accountant, base.signatures.change_accountant),
      ...(isPlainObject(byIdx)
        ? {
            by_form_index: {
              ...(byIdx as NonNullable<CustomerOnboardingData["signatures"]["by_form_index"]>),
            },
          }
        : {}),
    };
  }

  return base;
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
  fallback: CustomerOnboardingData["signatures"]["change_accountant"],
): CustomerOnboardingData["signatures"]["change_accountant"] {
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
    signatures: {
      client_registration: {
        name: str("signatoryName"),
        position: str("signatoryPosition"),
        date: str("signatureDate"),
        signature: str("signature"),
      },
      change_accountant: {
        name: str("signatoryName"),
        date: str("changeOfAccountantLetterDate") || str("signatureDate"),
        signature: str("signature"),
      },
    },
  });
}

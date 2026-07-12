import {
  BUSINESS_TYPE_OPTIONS,
  coerceOfficeNoted,
  ensureHmrcRefsFromStep1,
  type CustomerOnboardingData,
  reviveCustomerOnboarding,
} from "../customers/onboarding-templates/customerOnboarding";
import type { OnboardingSignatureSlot } from "../entities/customer-form-submission.entity";

function normLabel(s: string): string {
  return s.trim().toLowerCase();
}

/** Stable segment for DocuSeal checkbox names, e.g. `Limited company` -> `limited_company`. */
function businessTypeOptionSlug(label: string): string {
  return normLabel(label)
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function shouldOmitSignatureValue(path: string, val: string): boolean {
  if (!/\.signature$/i.test(path)) return false;
  const t = val.trim();
  if (!t) return false;
  if (t.startsWith("data:")) return true;
  if (t.length > 8000) return true;
  return false;
}

export type DocusealPrefillValues = Record<string, string | boolean | number>;

/**
 * Stored JSON paths that map to one character per DocuSeal text field on boxed PDF layouts.
 * Indices are zero-based: `tax.ni_number.0` … `tax.ni_number.8` for a 9-box NI field.
 */
export const DOCUSEAL_BOXED_FIELD_LENGTHS: Readonly<Record<string, number>> = {
  "tax.ni_number": 9,
  "tax.utr": 10,
  "company.number": 8,
  "tax.vat_number": 9,
  "tax.paye_ref": 12,
  "hmrc_options.joint_claimant_ni_number": 9,
  "hmrc_options.ref_self_assessment_ni_number": 9,
  "hmrc_options.ref_self_assessment_utr": 10,
  "hmrc_options.ref_trust_utr": 10,
  "hmrc_options.ref_individual_paye_ni_number": 9,
  "hmrc_options.ref_corporation_tax_utr": 10,
  "hmrc_options.ref_tax_credits_ni_number": 9,
  "hmrc_options.ref_cis_paye_ref": 12,
  "hmrc_options.ref_employers_paye_ref": 12,
  "bank.account_number": 8,
  "bank.sort_code": 6,
};

/** Fixed on the Direct Debit PDF; not stored in onboarding JSON. */
export const DIRECT_DEBIT_SERVICE_USER_NUMBER = "275069";

function charsForBoxedField(value: string): string[] {
  return value.replace(/\s/g, "").split("");
}

/** Tax refs NI on form 1 PDF; wizard often only has `directors.0.ni_number` — use at DocuSeal send only. */
function withDocusealTaxNiFallback(data: CustomerOnboardingData): CustomerOnboardingData {
  if (data.tax.ni_number.trim()) return data;
  const fromDirector = data.directors[0]?.ni_number?.trim() ?? "";
  if (!fromDirector) return data;
  return { ...data, tax: { ...data.tax, ni_number: fromDirector } };
}

/**
 * Splits flattened string values into per-box DocuSeal keys and removes the parent key so
 * templates do not receive both `tax.utr` and `tax.utr.0` at once.
 */
export function expandBoxedFields(flat: DocusealPrefillValues): DocusealPrefillValues {
  const out: DocusealPrefillValues = { ...flat };

  for (const [path, boxCount] of Object.entries(DOCUSEAL_BOXED_FIELD_LENGTHS)) {
    const raw = out[path];
    if (typeof raw !== "string") continue;

    const chars = charsForBoxedField(raw);
    for (let i = 0; i < boxCount; i++) {
      const ch = chars[i];
      if (ch) out[`${path}.${i}`] = ch;
    }
    delete out[path];
  }

  return out;
}

/** DocuSeal-only keys for the fixed Service User Number on the Direct Debit instruction. */
export function expandDirectDebitServiceUserNumber(out: DocusealPrefillValues): DocusealPrefillValues {
  const next = { ...out };
  const chars = DIRECT_DEBIT_SERVICE_USER_NUMBER.split("");
  for (let i = 0; i < chars.length; i++) {
    next[`direct_debit.service_user_number.${i}`] = chars[i]!;
  }
  return next;
}

export function flattenCustomerOnboardingForDocuseal(data: CustomerOnboardingData): DocusealPrefillValues {
  const out: DocusealPrefillValues = {};

  const walk = (value: unknown, path: string): void => {
    if (value === undefined || value === null) return;

    if (typeof value === "string") {
      let s = value;
      if (path === "office_use.noted") {
        s = coerceOfficeNoted(value);
      }
      if (shouldOmitSignatureValue(path, s)) return;
      const t = s.trim();
      if (!t) return;
      out[path] = t;
      return;
    }

    if (typeof value === "boolean") {
      if (!path) return;
      out[path] = value;
      return;
    }

    if (typeof value === "number") {
      if (!path || !Number.isFinite(value)) return;
      out[path] = value;
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}.${i}`));
      return;
    }

    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        const next = path ? `${path}.${k}` : k;
        walk(v, next);
      }
    }
  };

  walk(data, "");

  const selected = normLabel(data.company.type);
  for (const opt of BUSINESS_TYPE_OPTIONS) {
    const slug = businessTypeOptionSlug(opt);
    if (!slug) continue;
    out[`company.business_type.${slug}`] = normLabel(opt) === selected;
  }

  const notedForSeal = coerceOfficeNoted(data.office_use.noted).trim();
  if (notedForSeal) {
    out["office_use.noted"] = notedForSeal;
    out["office_use.notes"] = notedForSeal;
  }

  const selectedIds = (data.subscription_selected_service_ids ?? [])
    .map((x) => String(x).trim())
    .filter(Boolean);
  if (selectedIds.length > 0) {
    const nameById = new Map<string, string>();
    for (const row of data.subscription_selected_services ?? []) {
      const id = String(row?.id ?? "").trim();
      if (!id) continue;
      const name = String(row?.name ?? "").trim();
      nameById.set(id, name);
    }
    const labels: string[] = [];
    for (const id of selectedIds) {
      const nm = nameById.get(id);
      if (nm && nm.length > 0) labels.push(nm);
      else labels.push(id);
    }
    if (labels.length > 0) {
      out["subscription_selected_services_text"] = labels.map((l) => `\u2611 ${l}`).join("\n");
    }
  }

  return out;
}

/**
 * Builds DocuSeal `submitters[].values` from persisted onboarding JSON (DB source of truth).
 * Boxed PDF fields are expanded at send time; stored JSON keeps single string paths unchanged.
 */
export function docusealPrefillForSignatureTarget(
  data: CustomerOnboardingData,
  target: OnboardingSignatureSlot,
): DocusealPrefillValues {
  const enriched = ensureHmrcRefsFromStep1(withDocusealTaxNiFallback(data));
  let out = expandBoxedFields(flattenCustomerOnboardingForDocuseal(enriched));
  if (target === "direct_debit") {
    out = expandDirectDebitServiceUserNumber(out);
  }
  return out;
}

/** Revive raw submission `data` JSON and build expanded DocuSeal field values. */
export function docusealPrefillFromSubmissionData(
  raw: unknown,
  target: OnboardingSignatureSlot,
): DocusealPrefillValues {
  return docusealPrefillForSignatureTarget(reviveCustomerOnboarding(raw), target);
}

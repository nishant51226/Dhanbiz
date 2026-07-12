import type { OnboardingDocusealSignatureTarget } from "../types/api";
import {
  BUSINESS_TYPE_OPTIONS,
  coerceOfficeNoted,
  type CustomerOnboardingData,
} from "../types/customerOnboarding";

function normLabel(s: string): string {
  return s.trim().toLowerCase();
}

/** Stable segment for DocuSeal checkbox names, e.g. `Limited company` -> `limited_company`. */
function businessTypeOptionSlug(label: string): string {
  return normLabel(label)
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * True when this path should not be sent to DocuSeal (image payloads blow request size).
 */
function shouldOmitSignatureValue(path: string, val: string): boolean {
  if (!/\.signature$/i.test(path)) return false;
  const t = val.trim();
  if (!t) return false;
  if (t.startsWith("data:")) return true;
  if (t.length > 8000) return true;
  return false;
}

/** Values DocuSeal `submitters[].values` accepts (text + JSON primitives for checkboxes/numbers). */
export type DocusealPrefillValues = Record<string, string | boolean | number>;

/**
 * Flattens `CustomerOnboardingData` into dot-path keys for DocuSeal `submitters[].values`.
 * Dot paths mirror the JSON shape (single source of truth): e.g. `company.name`, `tax.utr`,
 * `services.bookkeeping`, `directors.0.name`, `signatures.by_form_index.1.date`.
 *
 * - Strings: trimmed; empty omitted (except booleans/numbers handled separately).
 * - **Booleans and numbers:** sent as JSON **boolean** / **number** (DocuSeal checkboxes often ignore string `"true"`/`"false"`).
 * - Arrays: numeric segments (`directors.0.name`).
 * - `office_use.noted` (Notes in UI): passed through `coerceOfficeNoted` before trim.
 * - `*.signature`: omitted when value is a data URL or excessively long; `file:<uuid>` kept.
 */
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

  /* DocuSeal templates sometimes use `office_use.notes`; JSON SSOT is `office_use.noted`. */
  const notedForSeal = coerceOfficeNoted(data.office_use.noted).trim();
  if (notedForSeal) {
    out["office_use.noted"] = notedForSeal;
    out["office_use.notes"] = notedForSeal;
  }

  /**
   * Single multi-line text rendering of selected catalogue services for templates that bind one Text
   * control to the whole list (e.g. `<text-field name="subscription_selected_services_text">`).
   * One `\u2611 Name` per service in the order chosen on the wizard; falls back to the raw id when
   * the denormalised name is missing. Mirrors `subscriptionSelectedServicesRowHtml` in the in-app
   * preview at `frontend/src/utils/onboardingHtmlTemplate.ts`.
   */
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
 * DocuSeal prefill: full onboarding JSON as dot-path keys (SOT). Name template fields to match
 * these keys exactly (e.g. field name `company.name`).
 */
export function docusealPrefillFromOnboarding(data: CustomerOnboardingData): DocusealPrefillValues {
  return flattenCustomerOnboardingForDocuseal(data);
}

/**
 * Same payload for every remote-signature step: the whole onboarding record is always the SOT.
 * `target` is kept for call-site clarity; it does not change which keys are sent.
 */
export function docusealPrefillForSignatureTarget(
  data: CustomerOnboardingData,
  _target: OnboardingDocusealSignatureTarget,
): DocusealPrefillValues {
  return flattenCustomerOnboardingForDocuseal(data);
}

/**
 * Flatten nested JSON into dot/bracket paths → string values (same rules as
 * `backend/src/customers/customer-export.util.ts` for GET …/export).
 */
export function flattenCustomerExportPayload(data: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};

  if (data === null || data === undefined) {
    if (prefix) out[prefix] = "";
    return out;
  }

  if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") {
    out[prefix || "value"] = String(data);
    return out;
  }

  if (data instanceof Date) {
    out[prefix || "value"] = data.toISOString();
    return out;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      if (prefix) out[prefix] = "";
      return out;
    }
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const p = prefix ? `${prefix}[${i}]` : `[${i}]`;
      Object.assign(out, flattenCustomerExportPayload(item, p));
    }
    return out;
  }

  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) {
      if (prefix) out[prefix] = "";
      return out;
    }
    for (const [k, v] of entries) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (v === null || v === undefined) {
        out[p] = "";
      } else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        out[p] = String(v);
      } else if (v instanceof Date) {
        out[p] = v.toISOString();
      } else if (Array.isArray(v) || (typeof v === "object" && v !== null)) {
        Object.assign(out, flattenCustomerExportPayload(v, p));
      } else {
        out[p] = String(v);
      }
    }
    return out;
  }

  out[prefix || "value"] = String(data);
  return out;
}

/** Same object shape as `GET /api/customers/:id` / single-customer export. */
export function buildCustomerExportShape(customer: {
  id: string;
  name: string;
  onboardingData?: Record<string, unknown> | null;
  annualTurnoverGbp?: number | string | null;
  planId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  plan?: Record<string, unknown> | null;
  portalUsers?: unknown[] | null;
  onboardingFormPdfDownloads?: unknown[] | null;
}): Record<string, unknown> {
  return {
    id: customer.id,
    name: customer.name,
    onboardingData: customer.onboardingData ?? null,
    annualTurnoverGbp: customer.annualTurnoverGbp ?? null,
    planId: customer.planId ?? null,
    createdAt: customer.createdAt ?? null,
    updatedAt: customer.updatedAt ?? null,
    plan: customer.plan ?? null,
    portalUsers: customer.portalUsers ?? null,
    onboardingFormPdfDownloads: customer.onboardingFormPdfDownloads ?? null,
  };
}

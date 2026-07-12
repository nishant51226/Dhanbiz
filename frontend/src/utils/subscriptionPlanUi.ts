import type { SubscriptionPlan, SubscriptionPlanFeatures } from "../types/api";

export function listPlanFeatures(plan: SubscriptionPlan): { included: string[]; not_included: string[] } {
  const f = plan.features as SubscriptionPlanFeatures | null | undefined;
  if (!f || typeof f !== "object") return { included: [], not_included: [] };
  const inc = Array.isArray(f.included) ? f.included.filter((x): x is string => typeof x === "string") : [];
  const exc = Array.isArray(f.not_included)
    ? f.not_included.filter((x): x is string => typeof x === "string")
    : [];
  return { included: inc, not_included: exc };
}

export function formatPlanTurnoverBand(plan: SubscriptionPlan): string {
  const min = plan.turnoverMinGbp != null ? Number(plan.turnoverMinGbp) : 0;
  const maxRaw = plan.turnoverMaxGbp;
  const max = maxRaw != null && String(maxRaw).trim() !== "" ? Number(maxRaw) : null;
  if (!Number.isFinite(min)) return "—";
  if (max == null || !Number.isFinite(max)) return `£${min.toLocaleString("en-GB")}+`;
  return `£${min.toLocaleString("en-GB")} – £${max.toLocaleString("en-GB")}`;
}

function sortOrderFromPlan(plan: SubscriptionPlan): number {
  const p = plan as SubscriptionPlan & { sort_order?: number | string };
  const v: unknown = p.sortOrder ?? p.sort_order;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Stable ordering for catalogue pickers (admin sort order, then name). */
export function sortPlansForDisplay(plans: SubscriptionPlan[]): SubscriptionPlan[] {
  return [...plans].sort((a, b) => {
    const ao = sortOrderFromPlan(a);
    const bo = sortOrderFromPlan(b);
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name, "en-GB");
  });
}

/** Matrix billing is yearly (dormant account option and dormant fee in recommend apply only for these). */
export function isMatrixYearlyBilling(cycle: string | null | undefined): boolean {
  const t = String(cycle ?? "").trim().toLowerCase();
  return t === "yearly" || t === "annual" || t === "annually";
}

import type { SubscriptionPlan } from "../types/api";

function toNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

/** Inclusive band `[turnoverMinGbp, turnoverMaxGbp]`; `turnoverMaxGbp` null/undefined means no upper cap. */
export function subscriptionPlanMatchesTurnover(turnoverGbp: number, plan: SubscriptionPlan): boolean {
  const t = Number(turnoverGbp);
  if (!Number.isFinite(t) || t < 0) return false;
  const min = toNumber(plan.turnoverMinGbp ?? 0);
  const maxRaw = plan.turnoverMaxGbp;
  const max = maxRaw === null || maxRaw === undefined ? Infinity : toNumber(maxRaw);
  if (!Number.isFinite(min)) return false;
  if (t < min) return false;
  if (Number.isFinite(max) && t > max) return false;
  return true;
}

/**
 * Pick the recommended plan for annual turnover (GBP).
 * Uses inclusive bands `[turnoverMinGbp, turnoverMaxGbp]`; `turnoverMaxGbp` null means no upper cap.
 * Among matches, prefers the **narrowest** turnover band, then lower `sortOrder`.
 */
export function recommendSubscriptionPlanId(turnoverGbp: number, plans: SubscriptionPlan[]): string | null {
  const t = Number(turnoverGbp);
  if (!Number.isFinite(t) || t < 0 || plans.length === 0) return null;

  const matches = plans.filter((p) => subscriptionPlanMatchesTurnover(t, p));

  if (matches.length === 0) return null;

  const width = (p: SubscriptionPlan) => {
    const min = toNumber(p.turnoverMinGbp ?? 0);
    const maxRaw = p.turnoverMaxGbp;
    const max = maxRaw === null || maxRaw === undefined ? Infinity : toNumber(maxRaw);
    if (!Number.isFinite(max)) return Number.POSITIVE_INFINITY;
    return max - min;
  };

  matches.sort((a, b) => {
    const wa = width(a);
    const wb = width(b);
    if (wa !== wb) return wa - wb;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });

  return matches[0]?.id ?? null;
}

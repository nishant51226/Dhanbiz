import type { SubscriptionPlan } from "../types/api";

type PlanActiveFields = SubscriptionPlan & {
  is_active?: boolean | number | string | null;
};

function explicitlyInactive(v: unknown): boolean {
  return v === false || v === 0 || v === "0" || v === "false" || v === "f" || v === "F";
}

/**
 * Whether a plan is flagged as customer-facing in the catalogue (e.g. for future assignment flows).
 * Treats missing / unknown as listed (matches DB default). Any explicit inactive flag wins.
 */
export function subscriptionPlanIsListedForCustomers(plan: SubscriptionPlan): boolean {
  const p = plan as PlanActiveFields;
  const candidates: unknown[] = [p.isActive, p.is_active].filter(
    (x: unknown) => x !== undefined && x !== null && x !== "",
  );
  if (candidates.length === 0) return true;
  return !candidates.some(explicitlyInactive);
}

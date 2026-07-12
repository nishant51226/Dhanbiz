import type { AiPricingRow } from "../types/api";

/** Matches backend `findActivePricing`: latest row per provider/model that is not expired. */
export function pickActiveAiPricingRow(
  rows: AiPricingRow[],
  provider: string,
  model: string
): AiPricingRow | null {
  const trimmed = model.trim();
  const matches = rows
    .filter((r) => r.provider === provider && r.model.trim() === trimmed)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const now = Date.now();
  for (const r of matches) {
    if (!r.effectiveUntil || new Date(r.effectiveUntil).getTime() > now) {
      return r;
    }
  }
  return null;
}

/** One active pricing row per provider + model for display in the manage table. */
export function listActiveAiPricingRows(rows: AiPricingRow[]): AiPricingRow[] {
  const byKey = new Map<string, AiPricingRow>();
  const now = Date.now();
  for (const r of rows) {
    if (r.effectiveUntil && new Date(r.effectiveUntil).getTime() <= now) {
      continue;
    }
    const key = `${r.provider}\t${r.model.trim()}`;
    const existing = byKey.get(key);
    if (!existing || new Date(r.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
      byKey.set(key, r);
    }
  }
  return [...byKey.values()].sort((a, b) => {
    const p = a.provider.localeCompare(b.provider);
    return p !== 0 ? p : a.model.localeCompare(b.model);
  });
}

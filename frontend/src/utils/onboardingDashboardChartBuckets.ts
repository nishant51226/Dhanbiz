import type { CustomerPageRowWithSubmission } from "../types/api";

export type OnboardingChartBucket = { label: string; count: number };

function readDotPath(data: Record<string, unknown> | null | undefined, dotPath: string): unknown {
  if (!data || typeof data !== "object") return undefined;
  const parts = dotPath.split(".").filter(Boolean);
  let cur: unknown = data;
  for (const p of parts) {
    if (!cur || typeof cur !== "object" || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Buckets customers by the value at `sortFieldDotPath` (under each row's `onboardingData`).
 * ISO dates → month key `YYYY-MM`; booleans → `true`/`false`; empty → `(missing)`; other strings truncated.
 */
export function buildOnboardingSortFieldBuckets(
  rows: CustomerPageRowWithSubmission[],
  sortFieldDotPath: string,
): OnboardingChartBucket[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const raw = readDotPath(row.onboardingData ?? undefined, sortFieldDotPath);
    let key: string;
    if (raw === null || raw === undefined || raw === "") {
      key = "(missing)";
    } else if (typeof raw === "boolean") {
      key = raw ? "true" : "false";
    } else if (typeof raw === "number" && Number.isFinite(raw)) {
      key = String(raw);
    } else {
      const s = String(raw).trim();
      if (s.length === 0) {
        key = "(missing)";
      } else {
        const m = ISO_DATE.exec(s);
        key = m ? `${m[1]}-${m[2]}` : s.length > 48 ? `${s.slice(0, 45)}…` : s;
      }
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const list: OnboardingChartBucket[] = [...counts.entries()].map(([label, count]) => ({ label, count }));
  list.sort((a, b) => {
    if (a.label === "(missing)") return 1;
    if (b.label === "(missing)") return -1;
    return a.label.localeCompare(b.label, undefined, { numeric: true });
  });
  return list;
}

export type DeadlineDateFieldDef = {
  id: string;
  label: string;
  /** Dot-separated path segments from onboarding display root. */
  path?: readonly string[];
  /** Legacy root-level keys (first non-empty wins). */
  rootKeys?: readonly string[];
};

/**
 * Catalog of onboarding date fields deadline campaigns can watch.
 * Emptied during the India conversion (UK statutory fields removed).
 * Workstream D repopulates this with GST due-date fields (GSTR-1/3B by
 * registration filing frequency) once gst_registrations exists.
 */
export const DEADLINE_DATE_FIELDS: readonly DeadlineDateFieldDef[] = [] as const;

const BY_ID = new Map(DEADLINE_DATE_FIELDS.map((f) => [f.id, f]));

export function getDeadlineDateField(id: string): DeadlineDateFieldDef | undefined {
  return BY_ID.get(id.trim());
}

function readDotPath(root: Record<string, unknown>, path: readonly string[]): string | null {
  let cur: unknown = root;
  for (const seg of path) {
    if (cur == null || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[seg];
  }
  if (typeof cur !== "string") return null;
  const t = cur.trim();
  return t || null;
}

function readRootKeys(root: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const v = root[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Read a raw date string from onboarding JSON for the given catalog field id. */
export function readDeadlineDateFromOnboarding(
  onboardingData: Record<string, unknown> | null | undefined,
  fieldId: string,
): string | null {
  const field = getDeadlineDateField(fieldId);
  if (!field || !onboardingData) return null;
  if (field.path) return readDotPath(onboardingData, field.path);
  if (field.rootKeys) return readRootKeys(onboardingData, field.rootKeys);
  return null;
}

const ISO_YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Normalise to `YYYY-MM-DD` or null if unparseable. */
export function normaliseDeadlineDateKey(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  const iso = ISO_YMD.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const DEADLINE_CAMPAIGN_TIMEZONE = "Asia/Kolkata";

/** Calendar date key `YYYY-MM-DD` in the campaign timezone. */
export function campaignDateKey(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: DEADLINE_CAMPAIGN_TIMEZONE });
}

/** Signed calendar-day difference: `toKey - fromKey` in whole days. */
export function calendarDaysBetween(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T12:00:00Z`);
  const to = Date.parse(`${toKey}T12:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return NaN;
  return Math.round((to - from) / 86_400_000);
}

export type DeadlinePhaseEvaluation = {
  phase: "upcoming" | "overdue";
  daysRemaining?: number;
  daysOverdue?: number;
};

export function evaluateDeadlinePhase(params: {
  dueDateKey: string;
  todayKey: string;
  upcomingEnabled: boolean;
  upcomingLeadDays: number;
  overdueEnabled: boolean;
  overdueLeadDays: number;
}): DeadlinePhaseEvaluation | null {
  const diff = calendarDaysBetween(params.todayKey, params.dueDateKey);
  if (Number.isNaN(diff)) return null;

  if (diff > 0 && params.upcomingEnabled) {
    if (diff <= params.upcomingLeadDays) {
      return { phase: "upcoming", daysRemaining: diff };
    }
    return null;
  }

  if (diff < 0 && params.overdueEnabled) {
    const overdue = -diff;
    if (overdue <= params.overdueLeadDays) {
      return { phase: "overdue", daysOverdue: overdue };
    }
    return null;
  }

  if (diff === 0 && params.upcomingEnabled) {
    return { phase: "upcoming", daysRemaining: 0 };
  }

  return null;
}

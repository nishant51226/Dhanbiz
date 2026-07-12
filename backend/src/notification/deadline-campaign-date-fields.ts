/** Catalog of onboarding date fields deadline campaigns can watch. */

export type DeadlineDateFieldDef = {
  id: string;
  label: string;
  /** Dot-separated path segments from onboarding display root. */
  path?: readonly string[];
  /** Legacy root-level keys (first non-empty wins). */
  rootKeys?: readonly string[];
};

export const DEADLINE_DATE_FIELDS: readonly DeadlineDateFieldDef[] = [
  {
    id: "companies_house.accounts.next_accounts_due_on",
    label: "CH — Accounts due",
    path: ["companies_house", "accounts", "next_accounts_due_on"],
  },
  {
    id: "companies_house.confirmation_statement.next_made_up_to",
    label: "CH — Confirmation statement due",
    path: ["companies_house", "confirmation_statement", "next_made_up_to"],
  },
  {
    id: "companies_house.confirmation_statement.next_due",
    label: "CH — CS next due",
    path: ["companies_house", "confirmation_statement", "next_due"],
  },
  {
    id: "custom_accounts_due",
    label: "Custom accounts due",
    rootKeys: ["accounts_fd", "accountsFd", "acsFd"],
  },
  {
    id: "custom_cs_due",
    label: "Custom CS due",
    rootKeys: ["cs", "confirmation_stmt", "confirmationStmt"],
  },
  {
    id: "tax.vat_return_due_date",
    label: "VAT return due",
    path: ["tax", "vat_return_due_date"],
  },
  {
    id: "companies_house.accounts.next_accounts_period_end_on",
    label: "CH — Financial year end",
    path: ["companies_house", "accounts", "next_accounts_period_end_on"],
  },
  {
    id: "companies_house.psc_appointment_verification_statement_due_on",
    label: "CH — PSC identity verification due",
    path: ["companies_house", "psc_appointment_verification_statement_due_on"],
  },
  {
    id: "companies_house.officer_appointment_verification_statement_due_on",
    label: "CH — Officer identity verification due",
    path: ["companies_house", "officer_appointment_verification_statement_due_on"],
  },
] as const;

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

export const DEADLINE_CAMPAIGN_TIMEZONE = "Europe/London";

/** Calendar date key `YYYY-MM-DD` in Europe/London. */
export function londonDateKey(d: Date = new Date()): string {
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

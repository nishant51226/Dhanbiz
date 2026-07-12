/** Application standard display format: **DD/MM/YYYY** (`en-GB`). Storage/API stays ISO `YYYY-MM-DD`. */

export const APP_DISPLAY_LOCALE = "en-GB";

const ISO_YMD = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/;
const UK_DAY_FIRST = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

function isValidCalendarParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

function toIsoKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Normalise UK financial dates (`DD/MM/YYYY`) to `YYYY-MM-DD`. */
export function normalizeFinancialDateToIso(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();

  const iso = ISO_YMD.exec(trimmed);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return isValidCalendarParts(year, month, day) ? toIsoKey(year, month, day) : null;
  }

  const uk = UK_DAY_FIRST.exec(trimmed);
  if (uk) {
    const day = Number(uk[1]);
    const month = Number(uk[2]);
    const year = Number(uk[3]);
    return isValidCalendarParts(year, month, day) ? toIsoKey(year, month, day) : null;
  }

  return null;
}

function parseFinancialCalendarDate(value: string | null | undefined): Date | null {
  const key = normalizeFinancialDateToIso(value);
  if (!key) return null;
  const [year, month, day] = key.split("-").map(Number);
  if (!isValidCalendarParts(year!, month!, day!)) return null;
  return new Date(Date.UTC(year!, month! - 1, day!, 12, 0, 0));
}

export function parseIsoDate(iso: string | null | undefined): Date | null {
  const fromFinancial = parseFinancialCalendarDate(iso);
  if (fromFinancial) return fromFinancial;
  if (!iso?.trim()) return null;
  const d = new Date(iso.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateFormatOptions(timeZone?: string) {
  return {
    day: "2-digit" as const,
    month: "2-digit" as const,
    year: "numeric" as const,
    ...(timeZone ? { timeZone } : {}),
  };
}

/** DD/MM/YYYY */
export function formatDate(iso: string | Date | null | undefined, timeZone?: string): string {
  if (iso == null || iso === "") return "—";
  if (iso instanceof Date) {
    if (Number.isNaN(iso.getTime())) return "—";
    return iso.toLocaleDateString(APP_DISPLAY_LOCALE, dateFormatOptions(timeZone));
  }
  const trimmed = iso.trim();
  if (!trimmed) return "—";
  const normalized = normalizeFinancialDateToIso(trimmed);
  if (normalized) return formatCalendarDateKey(normalized);
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (ymd) return formatCalendarDateKey(`${ymd[1]}-${ymd[2]}-${ymd[3]}`);
  const d = parseIsoDate(trimmed);
  if (!d) return trimmed;
  return d.toLocaleDateString(APP_DISPLAY_LOCALE, dateFormatOptions(timeZone));
}

/** DD/MM/YYYY, HH:MM */
export function formatDateTime(iso: string | Date | null | undefined, timeZone?: string): string {
  if (iso == null || iso === "") return "—";
  const d = iso instanceof Date ? iso : parseIsoDate(iso);
  if (!d || Number.isNaN(d.getTime())) {
    const raw = typeof iso === "string" ? iso.trim() : "";
    return raw || "—";
  }
  const datePart = formatDate(d, timeZone);
  const timePart = d.toLocaleTimeString(APP_DISPLAY_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
  return `${datePart}, ${timePart}`;
}

/** DD/MM/YYYY from `YYYY-MM-DD` (no timezone shift). */
export function formatCalendarDateKey(dateKey: string | null | undefined): string {
  if (!dateKey?.trim()) return "—";
  const t = dateKey.trim();
  if (t === "Undated") return "Undated";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return formatDate(t);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** DD/MM/YYYY from calendar parts (`month` is 1–12). */
export function formatDateParts(year: number, month: number, day: number): string {
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

/** MM/YYYY for month-only labels (e.g. customer since). */
export function formatMonthYear(iso: string | Date | null | undefined, timeZone?: string): string {
  if (iso == null || iso === "") return "—";
  const d = iso instanceof Date ? iso : parseIsoDate(iso);
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(APP_DISPLAY_LOCALE, {
    month: "2-digit",
    year: "numeric",
    ...(timeZone ? { timeZone } : {}),
  });
}

/** Dashboard/onboarding cell: booleans, ISO dates, or passthrough text → DD/MM/YYYY when possible. */
export function formatDateDisplay(raw: string | null | undefined): string {
  if (!raw?.trim() || raw.trim() === "—") return "—";
  const t = raw.trim();
  if (t === "true") return "Yes";
  if (t === "false") return "No";
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return formatCalendarDateKey(t.slice(0, 10));
  return formatDate(t);
}

/** Application standard display format: **DD/MM/YYYY** (`en-GB`). Storage/API stays ISO `YYYY-MM-DD`. */

import { normalizeFinancialDateToIso, parseFinancialCalendarDate } from "./financial-date.util.js";

export const APP_DISPLAY_LOCALE = "en-GB";

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

function dateTimeFormatOptions(timeZone?: string) {
  return {
    ...dateFormatOptions(timeZone),
    hour: "2-digit" as const,
    minute: "2-digit" as const,
  };
}

/** DD/MM/YYYY */
export function formatDisplayDate(iso: string | Date | null | undefined, timeZone?: string): string {
  if (iso == null || iso === "") return "";
  if (iso instanceof Date) {
    if (Number.isNaN(iso.getTime())) return "";
    return iso.toLocaleDateString(APP_DISPLAY_LOCALE, dateFormatOptions(timeZone));
  }
  const trimmed = iso.trim();
  if (!trimmed) return "";
  const normalized = normalizeFinancialDateToIso(trimmed);
  if (normalized) return formatCalendarDateKey(normalized);
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (ymd) return formatCalendarDateKey(`${ymd[1]}-${ymd[2]}-${ymd[3]}`);
  const d = parseIsoDate(trimmed);
  if (!d) return trimmed;
  return d.toLocaleDateString(APP_DISPLAY_LOCALE, dateFormatOptions(timeZone));
}

/** DD/MM/YYYY, HH:MM */
export function formatDisplayDateTime(iso: string | Date | null | undefined, timeZone?: string): string {
  if (iso == null || iso === "") return "";
  const d = iso instanceof Date ? iso : parseIsoDate(iso);
  if (!d || Number.isNaN(d.getTime())) {
    return typeof iso === "string" ? iso.trim() : "";
  }
  return d.toLocaleString(APP_DISPLAY_LOCALE, dateTimeFormatOptions(timeZone));
}

/** DD/MM/YYYY from `YYYY-MM-DD` (no timezone shift). */
export function formatCalendarDateKey(dateKey: string | null | undefined): string {
  if (!dateKey?.trim()) return "";
  const t = dateKey.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return formatDisplayDate(t);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** DD/MM/YYYY from calendar parts (`month` is 1–12). */
export function formatDateParts(year: number, month: number, day: number): string {
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

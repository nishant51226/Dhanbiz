import { formatCalendarDateKey, formatDate, formatDateTime, parseIsoDate } from "./formatDate";

/** Calendar timezone for library document grouping (matches backend browse/export). */
export const LIBRARY_DOCUMENT_TIMEZONE = "Europe/London";

const calendarKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: LIBRARY_DOCUMENT_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const calendarPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: LIBRARY_DOCUMENT_TIMEZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

/** Same instant order as backend `EFFECTIVE_DOC_DATE` (document date, then upload). */
function effectiveLibraryInstant(
  documentDate: string | null | undefined,
  uploadedAt: string | null | undefined,
  createdAt?: string | null | undefined,
): Date | null {
  return parseIsoDate(documentDate) ?? parseIsoDate(uploadedAt) ?? parseIsoDate(createdAt);
}

/** Upload time only — matches backend `dateBasis=uploaded` / folder date browse. */
function uploadLibraryInstant(
  uploadedAt: string | null | undefined,
  createdAt?: string | null | undefined,
): Date | null {
  return parseIsoDate(uploadedAt) ?? parseIsoDate(createdAt);
}

/** `YYYY-MM-DD` in the library calendar timezone (document date, else upload/created). */
export function libraryDocumentCalendarDateKey(
  documentDate: string | null | undefined,
  uploadedAt: string | null | undefined,
  createdAt?: string | null | undefined,
): string {
  const dt = effectiveLibraryInstant(documentDate, uploadedAt, createdAt);
  if (!dt) return "Undated";
  return calendarKeyFormatter.format(dt);
}

export function libraryDocumentCalendarParts(
  documentDate: string | null | undefined,
  uploadedAt: string | null | undefined,
  createdAt?: string | null | undefined,
): { year: number; month: number; day: number } | null {
  const dt = effectiveLibraryInstant(documentDate, uploadedAt, createdAt);
  if (!dt) return null;
  const parts = calendarPartsFormatter.formatToParts(dt);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month: month - 1, day };
}

/** `YYYY-MM-DD` by UK upload time (not invoice/document date). */
export function libraryDocumentUploadCalendarDateKey(
  uploadedAt: string | null | undefined,
  createdAt?: string | null | undefined,
): string {
  const dt = uploadLibraryInstant(uploadedAt, createdAt);
  if (!dt) return "Undated";
  return calendarKeyFormatter.format(dt);
}

export function libraryDocumentUploadCalendarParts(
  uploadedAt: string | null | undefined,
  createdAt?: string | null | undefined,
): { year: number; month: number; day: number } | null {
  const dt = uploadLibraryInstant(uploadedAt, createdAt);
  if (!dt) return null;
  const parts = calendarPartsFormatter.formatToParts(dt);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month: month - 1, day };
}

/** Upload timestamp for lists — DD/MM/YYYY, HH:MM (Europe/London). */
export function formatLibraryDocumentUploadDateTime(iso: string | null | undefined): string {
  return formatDateTime(iso, LIBRARY_DOCUMENT_TIMEZONE);
}

/** Normalize bucket key to `YYYY-MM-DD` for API queries. */
export function normalizeLibraryCalendarDateKey(dateKey: string): string {
  if (dateKey === "Undated") return dateKey;
  const trimmed = dateKey.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const dt = new Date(trimmed);
  if (!Number.isNaN(dt.getTime())) return calendarKeyFormatter.format(dt);
  return trimmed;
}

/** Human label for a `YYYY-MM-DD` bucket key — DD/MM/YYYY. */
export function formatLibraryCalendarDateKeyLabel(dateKey: string): string {
  return formatCalendarDateKey(normalizeLibraryCalendarDateKey(dateKey));
}

/** List cell: document date, else upload — DD/MM/YYYY. */
export function formatLibraryDocumentDisplayDate(
  documentDate: string | null | undefined,
  uploadedAt: string | null | undefined,
  createdAt?: string | null | undefined,
): string {
  const dt = effectiveLibraryInstant(documentDate, uploadedAt, createdAt);
  if (!dt) return "—";
  return formatDate(dt, LIBRARY_DOCUMENT_TIMEZONE);
}

/** List cell: UK upload date only — DD/MM/YYYY. */
export function formatLibraryDocumentUploadDisplayDate(
  uploadedAt: string | null | undefined,
  createdAt?: string | null | undefined,
): string {
  const dt = uploadLibraryInstant(uploadedAt, createdAt);
  if (!dt) return "—";
  return formatDate(dt, LIBRARY_DOCUMENT_TIMEZONE);
}

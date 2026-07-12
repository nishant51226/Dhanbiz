/** UK financial documents: slash dates are **DD/MM/YYYY**. Storage/API uses **YYYY-MM-DD**. */

const ISO_YMD = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/;

/** `DD/MM/YYYY`, `DD-MM-YYYY`, or `DD.MM.YYYY` */
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

/** Normalise invoice/statement dates to `YYYY-MM-DD` using UK day-first rules. */
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

/** Parse a financial date string to a UTC noon `Date` (calendar-safe). */
export function parseFinancialCalendarDate(value: string | null | undefined): Date | null {
  const key = normalizeFinancialDateToIso(value);
  if (!key) return null;
  const parts = key.split("-").map(Number);
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  if (!isValidCalendarParts(year!, month!, day!)) return null;
  return new Date(Date.UTC(year!, month! - 1, day!, 12, 0, 0));
}

import { BadRequestException } from "@nestjs/common";

/** Normalize ISO or date-only input to `YYYY-MM-DD`. */
export function toCalendarDateString(value: string | null | undefined, field: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    throw new BadRequestException(`${field} is required`);
  }
  const dateOnly = trimmed.length >= 10 ? trimmed.slice(0, 10) : trimmed;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    throw new BadRequestException(`Invalid ${field} date (use YYYY-MM-DD)`);
  }
  const parsed = new Date(`${dateOnly}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Invalid ${field} date`);
  }
  return dateOnly;
}

export function parseCalendarReportRange(from: string, to: string): { from: string; to: string } {
  const fromDate = toCalendarDateString(from, "from");
  const toDate = toCalendarDateString(to, "to");
  if (fromDate > toDate) {
    throw new BadRequestException("from must be on or before to");
  }
  return { from: fromDate, to: toDate };
}

export function parseReportRange(from?: string, to?: string): { from: Date; to: Date } {
  const now = new Date();
  const end = to ? new Date(to) : now;
  if (Number.isNaN(end.getTime())) {
    throw new BadRequestException("Invalid to date");
  }
  const start = from ? new Date(from) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(start.getTime())) {
    throw new BadRequestException("Invalid from date");
  }
  if (start.getTime() > end.getTime()) {
    throw new BadRequestException("from must be before to");
  }
  return { from: start, to: end };
}

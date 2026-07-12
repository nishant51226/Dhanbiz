import { formatCalendarDateKey } from "./formatDate";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain text for onboarding HTML/PDF field cells. */
export function htmlFieldText(s: string): string {
  const t = s.trim();
  return t ? esc(t) : "&nbsp;";
}

/** `<input type="date">` value (`YYYY-MM-DD`) → DD/MM/YYYY in previews/PDFs. */
export function htmlFieldDate(s: string): string {
  const t = s.trim();
  if (!t) return "&nbsp;";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return esc(formatCalendarDateKey(t));
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (ymd) return esc(formatCalendarDateKey(`${ymd[1]}-${ymd[2]}-${ymd[3]}`));
  return htmlFieldText(t);
}

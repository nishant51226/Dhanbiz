import Popover from "@mui/material/Popover";
import { useMemo, useState } from "react";
import {
  WEEKDAYS,
  addMonths,
  dayMs,
  formatYmd,
  formatYmdDisplay,
  parseYmd,
  sameDay,
  startOfMonth,
} from "../utils/datePickerShared";

function formatRangeLabel(from: string, to: string): string {
  if (!from && !to) return "Select date range…";
  if (from && to) return `${formatYmdDisplay(from)} – ${formatYmdDisplay(to)}`;
  if (from) return `From ${formatYmdDisplay(from)}`;
  return `Until ${formatYmdDisplay(to)}`;
}

type CalendarProps = {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
};

function RangeCalendar({ from, to, onChange }: CalendarProps) {
  const initialMonth = parseYmd(from) ?? parseYmd(to) ?? new Date();
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(initialMonth));

  const fromDate = parseYmd(from);
  const toDate = parseYmd(to);
  const fromMs = fromDate ? dayMs(fromDate) : null;
  const toMs = toDate ? dayMs(toDate) : null;
  const rangeStart = fromMs !== null && toMs !== null ? Math.min(fromMs, toMs) : fromMs;
  const rangeEnd = fromMs !== null && toMs !== null ? Math.max(fromMs, toMs) : toMs;

  const cells = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const first = new Date(year, month, 1);
    const startPad = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const items: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < startPad; i++) {
      const d = new Date(year, month, -startPad + i + 1);
      items.push({ date: d, inMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      items.push({ date: new Date(year, month, day), inMonth: true });
    }
    while (items.length % 7 !== 0) {
      const last = items[items.length - 1]!.date;
      items.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false });
    }
    return items;
  }, [viewMonth]);

  const pickDay = (d: Date) => {
    const ymd = formatYmd(d);
    if (!from || (from && to)) {
      onChange(ymd, "");
      return;
    }
    const anchor = parseYmd(from);
    if (!anchor) {
      onChange(ymd, "");
      return;
    }
    if (dayMs(d) < dayMs(anchor)) {
      onChange(ymd, from);
    } else {
      onChange(from, ymd);
    }
  };

  const monthLabel = viewMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div className="w-[280px] select-none p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          className="rounded-md border border-border px-2 py-1 text-xs text-ink hover:bg-surface-muted"
          onClick={() => setViewMonth((m) => addMonths(m, -1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-ink">{monthLabel}</span>
        <button
          type="button"
          className="rounded-md border border-border px-2 py-1 text-xs text-ink hover:bg-surface-muted"
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold uppercase text-muted">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map(({ date, inMonth }) => {
          const ms = dayMs(date);
          const isStart = fromDate && sameDay(date, fromDate);
          const isEnd = toDate && sameDay(date, toDate);
          const inRange =
            rangeStart !== null &&
            rangeEnd !== null &&
            ms >= rangeStart &&
            ms <= rangeEnd &&
            Boolean(from && to);
          return (
            <button
              key={formatYmd(date)}
              type="button"
              disabled={!inMonth}
              onClick={() => pickDay(date)}
              className={[
                "h-8 rounded-md text-xs tabular-nums",
                !inMonth ? "text-muted/30" : "text-ink hover:bg-surface-muted",
                inRange ? "bg-brand/20" : "",
                isStart || isEnd ? "bg-brand font-semibold text-white hover:bg-brand" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-muted">Click a start date, then an end date.</p>
    </div>
  );
}

const triggerClass =
  "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-input px-3 text-left text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-50";

type DateRangePickerFieldProps = {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  disabled?: boolean;
};

export function DateRangePickerField({ from, to, onChange, disabled = false }: DateRangePickerFieldProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = Boolean(anchor) && !disabled;

  return (
    <>
      <button
        type="button"
        className={triggerClass}
        disabled={disabled}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={!from && !to ? "text-muted" : "truncate tabular-nums"}>{formatRangeLabel(from, to)}</span>
        <svg
          className="h-4 w-4 shrink-0 text-muted"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
        </svg>
      </button>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            className: "mt-1 rounded-xl border border-border bg-surface-raised shadow-lg",
          },
        }}
      >
        <RangeCalendar from={from} to={to} onChange={onChange} />
        <div className="flex justify-end gap-2 border-t border-border px-3 py-2">
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs font-medium text-muted hover:text-ink"
            onClick={() => onChange("", "")}
          >
            Clear
          </button>
          <button
            type="button"
            className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
            onClick={() => setAnchor(null)}
          >
            Done
          </button>
        </div>
      </Popover>
    </>
  );
}

import Popover from "@mui/material/Popover";
import { useMemo, useState } from "react";
import {
  WEEKDAYS,
  addMonths,
  formatYmd,
  formatYmdDisplay,
  parseYmd,
  sameDay,
  startOfMonth,
} from "../utils/datePickerShared";

const triggerClass =
  "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-input px-3 text-left text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-50";

type SingleDateCalendarProps = {
  value: string;
  onChange: (value: string) => void;
};

function SingleDateCalendar({ value, onChange }: SingleDateCalendarProps) {
  const initialMonth = parseYmd(value) ?? new Date();
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(initialMonth));
  const selected = parseYmd(value);

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
          const isSelected = selected ? sameDay(date, selected) : false;
          return (
            <button
              key={formatYmd(date)}
              type="button"
              disabled={!inMonth}
              onClick={() => onChange(formatYmd(date))}
              className={[
                "h-8 rounded-md text-xs tabular-nums",
                !inMonth ? "text-muted/30" : "text-ink hover:bg-surface-muted",
                isSelected ? "bg-brand font-semibold text-white hover:bg-brand" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type DatePickerFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
};

/** Calendar picker storing `YYYY-MM-DD`, displaying DD/MM/YYYY (UK). */
export function DatePickerField({
  value,
  onChange,
  disabled = false,
  placeholder = "Select date…",
  className,
  "aria-label": ariaLabel,
}: DatePickerFieldProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = Boolean(anchor) && !disabled;
  const label = value.trim() ? formatYmdDisplay(value) : placeholder;

  return (
    <>
      <button
        type="button"
        className={className ?? triggerClass}
        disabled={disabled}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className={!value.trim() ? "text-muted" : "truncate tabular-nums"}>{label}</span>
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
        <SingleDateCalendar
          value={value}
          onChange={(next) => {
            onChange(next);
            setAnchor(null);
          }}
        />
        <div className="flex justify-end gap-2 border-t border-border px-3 py-2">
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs font-medium text-muted hover:text-ink"
            onClick={() => {
              onChange("");
              setAnchor(null);
            }}
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

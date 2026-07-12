import { useCallback, useRef, type KeyboardEvent, type ReactNode } from "react";
import { lab } from "./fieldStyles";

const refBoxClass =
  "h-9 w-8 shrink-0 rounded-sm border border-border bg-surface-raised px-0 text-center font-mono text-sm text-ink shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-60";

const authBoxClass =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-border bg-surface-raised text-sm font-bold leading-none text-ink shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-60";

/** Bordered subsection — uses app theme tokens (works on dark + light). */
export function HmrcSecBox({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-raised/40">
      {title ? (
        <div className="border-b border-border bg-brand/10 px-3 py-2 text-sm font-semibold text-ink">{title}</div>
      ) : null}
      <div className="space-y-4 p-3 sm:p-4">{children}</div>
    </div>
  );
}

export function AuthBoxCheckbox({
  checked,
  onChange,
  disabled,
  ariaLabel,
  className = "",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`${authBoxClass} ${className}`.trim()}
    >
      {checked ? "✓" : ""}
    </button>
  );
}

export function AuthBoxRow({
  label,
  checked,
  onChange,
  description,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-ink">{label}</span>
        <AuthBoxCheckbox checked={checked} onChange={onChange} disabled={disabled} ariaLabel={label} />
      </div>
      {description ? <p className="text-xs leading-relaxed text-muted">{description}</p> : null}
    </div>
  );
}

/** Checkbox inline at end of sentence — stays adjacent to text, not pushed to far edge. */
export function InlineTickRow({
  children,
  checked,
  onChange,
  ariaLabel,
}: {
  children: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex items-start gap-2 text-sm leading-relaxed text-ink">
      <span className="min-w-0">
        {children}{" "}
        <AuthBoxCheckbox
          checked={checked}
          onChange={onChange}
          ariaLabel={ariaLabel}
          className="ml-1 inline-flex align-middle"
        />
      </span>
    </div>
  );
}

export function RefBoxField({
  fieldId,
  label,
  value,
  onChange,
  count,
  readOnly,
}: {
  /** Stable unique id for this box row (avoids duplicate React keys across sections). */
  fieldId: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  count: number;
  readOnly?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const chars = value.replace(/\s/g, "").slice(0, count).split("");
  const boxes = Array.from({ length: count }, (_, i) => chars[i] ?? "");

  const commit = useCallback(
    (nextBoxes: string[]) => {
      onChange(nextBoxes.join("").replace(/\s/g, ""));
    },
    [onChange],
  );

  const handleChange = (index: number, raw: string) => {
    if (readOnly) return;
    const cleaned = raw.replace(/\s/g, "").toUpperCase();
    if (cleaned.length > 1) {
      const pasted = cleaned.slice(0, count);
      const next = Array.from({ length: count }, (_, i) => pasted[i] ?? "");
      commit(next);
      const focusIdx = Math.min(pasted.length, count - 1);
      refs.current[focusIdx]?.focus();
      return;
    }
    const next = [...boxes];
    next[index] = cleaned;
    commit(next);
    if (cleaned && index < count - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (readOnly) return;
    if (e.key === "Backspace" && !boxes[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      refs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowRight" && index < count - 1) {
      e.preventDefault();
      refs.current[index + 1]?.focus();
    }
  };

  return (
    <div className="min-w-0">
      <p className={lab}>{label}</p>
      <div className="mt-1.5 inline-flex max-w-full flex-wrap gap-1">
        {boxes.map((char, index) => (
          <input
            key={`${fieldId}-${index}`}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="text"
            inputMode="text"
            autoComplete="off"
            name={`${fieldId}.${index}`}
            maxLength={1}
            value={char}
            readOnly={readOnly}
            disabled={readOnly}
            aria-label={`${label} character ${index + 1}`}
            className={refBoxClass}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
          />
        ))}
      </div>
    </div>
  );
}

const formBoxClass =
  "mt-1.5 w-full rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm text-ink shadow-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-70";

/** Single bordered field box (Direct Debit text fields). */
export function FormBoxField({
  label,
  value,
  onChange,
  readOnly,
  tall,
  placeholder,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  tall?: boolean;
  placeholder?: string;
}) {
  if (tall) {
    return (
      <label className="block min-w-0">
        <span className={lab}>{label}</span>
        <textarea
          value={value}
          readOnly={readOnly}
          disabled={readOnly}
          placeholder={placeholder}
          rows={4}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          className={`${formBoxClass} min-h-[5rem] resize-y`}
        />
      </label>
    );
  }

  return (
    <label className="block min-w-0">
      <span className={lab}>{label}</span>
      <input
        type="text"
        value={value}
        readOnly={readOnly}
        disabled={readOnly}
        placeholder={placeholder}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className={`${formBoxClass} min-h-[2.25rem]`}
      />
    </label>
  );
}

const digitBoxClass =
  "h-9 w-9 shrink-0 border-0 border-r border-border bg-surface-raised px-0 text-center font-mono text-sm font-semibold text-ink focus:z-10 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-70 last:border-r-0";

/** Connected digit boxes (Direct Debit account number, sort code, service user number). */
export function DigitBoxField({
  label,
  value,
  onChange,
  count,
  readOnly,
  numeric = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  count: number;
  readOnly?: boolean;
  numeric?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const sanitize = (raw: string) => {
    const stripped = raw.replace(/\s/g, "");
    return numeric ? stripped.replace(/\D/g, "") : stripped.toUpperCase();
  };
  const chars = sanitize(value).slice(0, count).split("");
  const boxes = Array.from({ length: count }, (_, i) => chars[i] ?? "");

  const commit = useCallback(
    (nextBoxes: string[]) => {
      onChange(nextBoxes.join("").replace(/\s/g, ""));
    },
    [onChange],
  );

  const handleChange = (index: number, raw: string) => {
    if (readOnly) return;
    const cleaned = sanitize(raw);
    if (cleaned.length > 1) {
      const pasted = cleaned.slice(0, count);
      const next = Array.from({ length: count }, (_, i) => pasted[i] ?? "");
      commit(next);
      const focusIdx = Math.min(pasted.length, count - 1);
      refs.current[focusIdx]?.focus();
      return;
    }
    const next = [...boxes];
    next[index] = cleaned;
    commit(next);
    if (cleaned && index < count - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (readOnly) return;
    if (e.key === "Backspace" && !boxes[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      refs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowRight" && index < count - 1) {
      e.preventDefault();
      refs.current[index + 1]?.focus();
    }
  };

  return (
    <div className="min-w-0">
      <p className={lab}>{label}</p>
      <div className="mt-1.5 inline-flex overflow-hidden rounded-sm border border-border shadow-sm">
        {boxes.map((char, index) => (
          <input
            key={index}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="text"
            inputMode={numeric ? "numeric" : "text"}
            autoComplete="off"
            maxLength={1}
            value={char}
            readOnly={readOnly}
            disabled={readOnly}
            aria-label={`${label} digit ${index + 1}`}
            className={digitBoxClass}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
          />
        ))}
      </div>
    </div>
  );
}

/** Read-only bordered instruction / info block on the Direct Debit form. */
export function FormStaticBox({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-sm border border-border bg-surface-raised/50 p-3 text-xs leading-relaxed text-ink">
      {title ? <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">{title}</p> : null}
      {children}
    </div>
  );
}

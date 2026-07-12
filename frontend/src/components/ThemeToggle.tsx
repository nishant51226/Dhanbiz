import { useUiTheme } from "../theme/ThemeContext";

const btn =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-raised text-ink shadow-sm transition hover:bg-surface-muted";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useUiTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className={`${btn} ${className}`.trim()}
      onClick={toggleTheme}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? (
        <svg className="h-5 w-5 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg className="h-5 w-5 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

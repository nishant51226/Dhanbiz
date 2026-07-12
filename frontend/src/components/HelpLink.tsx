import { getHelpUrl } from "../constants";

function IconHelp() {
  return (
    <svg
      className="h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );
}

type HelpLinkProps = {
  /** Doc path under the help site, e.g. `/docs/admin/overview`. */
  docPath?: string;
  className?: string;
};

export function HelpLink({ docPath, className = "" }: HelpLinkProps) {
  return (
    <a
      href={getHelpUrl(docPath)}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs font-semibold text-ink shadow-sm transition hover:bg-surface-muted ${className}`}
      title="Open user guide (new tab)"
    >
      <IconHelp />
      <span className="hidden sm:inline">Help</span>
    </a>
  );
}

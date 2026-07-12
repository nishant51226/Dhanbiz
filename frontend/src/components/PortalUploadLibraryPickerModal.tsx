import type { PortalLibrarySection } from "../types/api";

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (section: PortalLibrarySection) => void;
};

export function PortalUploadLibraryPickerModal({ open, onClose, onSelect }: Props) {
  if (!open) return null;

  const choice = (section: PortalLibrarySection, label: string, hint: string) => (
    <button
      key={section}
      type="button"
      onClick={() => onSelect(section)}
      className="flex w-full flex-col items-start rounded-xl border border-border bg-surface-muted/30 px-4 py-3 text-left transition hover:border-brand/50 hover:bg-surface-muted/60"
    >
      <span className="text-sm font-bold uppercase tracking-wide text-brand">{label}</span>
      <span className="mt-1 text-xs text-muted">{hint}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-ink">New upload</h3>
        <p className="mt-1 text-xs text-muted">Choose where this file belongs. You will pick a supplier next.</p>
        <div className="mt-4 space-y-2">
          {choice("invoices", "Invoices", "Tax invoices and vendor PDFs")}
          {choice("statements", "Statements", "Bank and account statements")}
          {choice("files", "Files", "General files library")}
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-muted"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

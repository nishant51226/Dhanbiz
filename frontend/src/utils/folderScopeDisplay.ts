/** Shared folder scope labels and Tailwind classes aligned with `index.css` tokens. */

export type FolderScopeDisplayInput = {
  isGlobal?: boolean;
  isRestricted?: boolean;
};

export type FolderPickerKind = "global" | "customer" | "restricted";

export function folderScopeDetailsLabel(
  folder: FolderScopeDisplayInput & { customer?: { name?: string } | null },
): string {
  if (folder.isRestricted) {
    return folder.isGlobal ? "Restricted folder · Global" : "Restricted folder";
  }
  if (folder.isGlobal) return "Global folder";
  return folder.customer?.name?.trim() || "—";
}

/** MUI theme palette path for folder icons (matches admin theme). */
export function folderScopeIconColor(
  folder: FolderScopeDisplayInput,
): "secondary.main" | "primary.main" | "warning.dark" {
  if (folder.isRestricted) return "secondary.main";
  if (folder.isGlobal) return "primary.main";
  return "warning.dark";
}

export function folderScopeNameColor(folder: FolderScopeDisplayInput): "secondary.main" | "text.primary" {
  return folder.isRestricted ? "secondary.main" : "text.primary";
}

const pickerBase =
  "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors";

/** Upload folder picker — uses brand/surface tokens like other upload controls. */
export function folderPickerButtonClass(kind: FolderPickerKind, selected: boolean): string {
  if (kind === "restricted") {
    return `${pickerBase} ${
      selected
        ? "border-brand bg-brand/15 text-ink ring-1 ring-brand/40"
        : "border-brand/35 bg-brand/5 text-ink hover:bg-brand/10"
    }`;
  }
  return `${pickerBase} ${
    selected
      ? "border-border bg-surface-muted text-ink ring-1 ring-ink/15"
      : "border-border bg-surface-raised text-ink hover:bg-surface-muted"
  }`;
}

export function folderSelectedSummaryClass(isRestricted: boolean): string {
  return isRestricted
    ? "border-brand/50 bg-brand/10"
    : "border-border bg-surface-muted/60";
}

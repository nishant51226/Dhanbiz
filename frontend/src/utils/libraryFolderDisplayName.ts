import type { PortalLibraryFolderRow } from "../types/api";

const LIBRARY_KIND_PREFIX = /^(files|invoices|statements)\./i;
const LEGACY_SCOPE_SUFFIX = /\.(global|customer)$/i;
const LIBRARY_KIND_SEGMENT = /^(files|invoices|statements)$/i;

/** Strip internal library-folder slugs (e.g. `files.folderforcustomer.customer`) for UI. */
export function cleanLibraryFolderName(raw: string): string {
  let s = String(raw ?? "").trim();
  if (!s) return "—";

  s = s.replace(LEGACY_SCOPE_SUFFIX, "").trim();
  s = s.replace(LIBRARY_KIND_PREFIX, "").trim();

  const parts = s.split(".").filter(Boolean);
  if (parts.length > 1) {
    const meaningful = parts.filter((p) => !LIBRARY_KIND_SEGMENT.test(p));
    const tail = meaningful[meaningful.length - 1];
    if (tail) s = tail;
  }

  return humanizeFolderToken(s) || String(raw).trim() || "—";
}

function humanizeFolderToken(value: string): string {
  const spaced = value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b(for|and|the|to)\b/gi, " $1 ")
    .replace(/\s+/g, " ")
    .trim();

  if (!spaced) return "";
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Normalized key for duplicate folder-name checks (case/whitespace insensitive). */
export function folderNameKey(name: string): string {
  const label = cleanLibraryFolderName(name);
  if (label === "—") return "";
  return label.replace(/\s+/g, " ").trim().toLowerCase();
}

export function customerFolderNameExists(
  name: string,
  options: Array<{ label: string; disambiguation: string }>,
): boolean {
  const key = folderNameKey(name);
  if (!key) return false;
  return options.some((o) => o.disambiguation !== "Global" && folderNameKey(o.label) === key);
}

export function globalFolderNameExists(
  name: string,
  options: Array<{ label: string; disambiguation: string }>,
): boolean {
  const key = folderNameKey(name);
  if (!key) return false;
  return options.some((o) => o.disambiguation === "Global" && folderNameKey(o.label) === key);
}

export function libraryFolderDisplayName(
  folder: PortalLibraryFolderRow,
  opts: { showCustomerPrefix: boolean },
): string {
  const label = cleanLibraryFolderName(folder.name);
  if (opts.showCustomerPrefix && folder.customer?.name) {
    return `${label} — ${folder.customer.name}`;
  }
  return label;
}

/** True when a folder row matches a folder-view search query (folder label only, not customer name alone). */
export function folderMatchesSearchQuery(
  folder: PortalLibraryFolderRow,
  query: string,
  opts: { showCustomerPrefix: boolean },
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const raw = folder.name.toLowerCase();
  const label = cleanLibraryFolderName(folder.name).toLowerCase();
  const display = libraryFolderDisplayName(folder, { showCustomerPrefix: opts.showCustomerPrefix }).toLowerCase();
  const compact = (s: string) => s.replace(/[^a-z0-9]/g, "");
  const compactQ = compact(q);
  if (!compactQ) return false;

  return (
    raw.includes(q) ||
    label.includes(q) ||
    display.includes(q) ||
    compact(raw).includes(compactQ) ||
    compact(label).includes(compactQ)
  );
}

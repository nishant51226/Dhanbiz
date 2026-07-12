/** Normalized key for duplicate folder-name checks (case/whitespace insensitive). */
export function libraryFolderNameKey(raw: string): string {
  return libraryFolderDisplayLabel(raw).replace(/\s+/g, " ").trim().toLowerCase();
}

/** Strip internal library-folder slugs for search/display (mirrors frontend `cleanLibraryFolderName`). */
export function libraryFolderDisplayLabel(raw: string): string {
  let s = String(raw ?? "").trim();
  if (!s) return "";

  s = s.replace(/\.(global|customer)$/i, "").trim();
  s = s.replace(/^(files|invoices|statements)\./i, "").trim();

  const parts = s.split(".").filter(Boolean);
  if (parts.length > 1) {
    const meaningful = parts.filter((p) => !/^(files|invoices|statements)$/i.test(p));
    const tail = meaningful[meaningful.length - 1];
    if (tail) s = tail;
  }

  return s || String(raw ?? "").trim();
}

function compactAlphanumeric(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/** Apply folder-name search (alias must be `folder`). Uses STRPOS like documents.list search. */
export function applyLibraryFolderNameSearch(
  qb: { andWhere: (...args: unknown[]) => unknown },
  searchText: string | undefined,
): void {
  const term = searchText?.trim();
  if (!term) return;

  qb.andWhere("STRPOS(LOWER(COALESCE(folder.name, '')), LOWER(:folderSearchTerm)) > 0", {
    folderSearchTerm: term,
  });
}

/** In-memory check when post-filtering folder rows. */
export function libraryFolderNameMatchesSearch(rawName: string, searchText: string): boolean {
  const term = searchText.trim();
  if (!term) return true;

  const q = term.toLowerCase();
  const raw = String(rawName ?? "").toLowerCase();
  const label = libraryFolderDisplayLabel(rawName).toLowerCase();
  const compactQ = compactAlphanumeric(term);

  if (raw.includes(q) || label.includes(q)) return true;
  if (compactQ && (compactAlphanumeric(raw).includes(compactQ) || compactAlphanumeric(label).includes(compactQ))) {
    return true;
  }
  return false;
}

/** Hidden `files` tree root per library kind — extraction jobs still use `files` + `jobs`. */
export function portalStagingFolderName(kind: "invoices" | "statements" | "files"): string {
  return `__portal_extractions_${kind}__`;
}

export const PORTAL_JOB_STAGING_META_KEY = "portalJobStagingRoot";

/** Set on staging folder rows under `files`. */
export const PORTAL_STAGING_LIBRARY_KIND_META_KEY = "portalLibraryKind";

/** Set on `files` rows that only back `jobs` for portal uploads (canonical row is `documents`). */
export const PORTAL_JOB_FILE_META_KEY = "portalLibraryJob";

/** Legacy invoice-only keys (still filtered from drive listings). */
export const LEGACY_INVOICE_JOB_STAGING_META_KEY = "invoiceJobStagingRoot";
export const LEGACY_INVOICE_PORTAL_JOB_FILE_META_KEY = "invoicePortalJob";

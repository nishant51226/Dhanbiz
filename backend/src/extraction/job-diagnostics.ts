import type { FinancialDocument, JobDiagnosticEntry } from "./financial-types.js";

const MAX_META_STRING = 1200;
const MAX_DIAGNOSTIC_ENTRIES = 400;

function truncateDeep(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[max-depth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length <= MAX_META_STRING ? value : `${value.slice(0, MAX_META_STRING)}…`;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const cap = Math.min(value.length, 40);
    const out = value.slice(0, cap).map((v) => truncateDeep(v, depth + 1));
    if (value.length > cap) {
      (out as unknown[]).push(`…+${value.length - cap} more`);
    }
    return out;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const keys = Object.keys(o).slice(0, 30);
    for (const k of keys) {
      out[k] = truncateDeep(o[k], depth + 1);
    }
    if (Object.keys(o).length > 30) {
      out["_truncatedKeys"] = Object.keys(o).length - 30;
    }
    return out;
  }
  return String(value);
}

/** Safe for JSONB / API: trims large strings and caps array sizes in `meta`. */
export function sanitizeDiagnosticMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  return truncateDeep(meta) as Record<string, unknown>;
}

/** Compact view of raw per-page JSON from the structure model (for logs / `diagnosticLog`). */
export function summarizeExtractedPayload(extracted: unknown): Record<string, unknown> {
  if (extracted == null) {
    return { shape: "null" };
  }
  if (typeof extracted !== "object") {
    return { shape: typeof extracted };
  }
  const o = extracted as Record<string, unknown>;
  const out: Record<string, unknown> = {
    topLevelKeys: Object.keys(o).slice(0, 24),
  };
  if ("vendor" in o || "invoiceNumber" in o || "lineItems" in o || "total" in o) {
    out.kindHint = "invoice_like";
    out.vendor = o.vendor ?? null;
    out.customer = o.customer ?? null;
    out.invoiceNumber = o.invoiceNumber ?? null;
    out.invoiceDate = o.invoiceDate ?? null;
    out.dueDate = o.dueDate ?? null;
    out.currency = o.currency ?? null;
    out.subtotal = o.subtotal ?? null;
    out.tax = o.tax ?? null;
    out.total = o.total ?? null;
    const li = o.lineItems;
    out.lineItemCount = Array.isArray(li) ? li.length : 0;
  }
  if ("accountHolder" in o || "bankName" in o || "transactions" in o) {
    out.kindHint = out.kindHint ? `${String(out.kindHint)}+statement_like` : "statement_like";
    out.accountHolder = o.accountHolder ?? null;
    out.bankName = o.bankName ?? null;
    out.accountNumber = o.accountNumber ?? null;
    out.statementPeriodStart = o.statementPeriodStart ?? o.periodStart ?? null;
    out.statementPeriodEnd = o.statementPeriodEnd ?? o.periodEnd ?? null;
    out.openingBalance = o.openingBalance ?? null;
    out.closingBalance = o.closingBalance ?? null;
    const tx = o.transactions;
    out.transactionCount = Array.isArray(tx) ? tx.length : 0;
  }
  return out;
}

export function summarizeFinancialDocument(doc: FinancialDocument): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: doc.id,
    type: doc.type,
    status: doc.status,
    pageStart: doc.metadata.pageRange.start,
    pageEnd: doc.metadata.pageRange.end,
  };
  if (doc.type === "invoice" && doc.invoice) {
    const inv = doc.invoice;
    base.vendor = inv.vendor;
    base.invoiceNumber = inv.invoiceNumber;
    base.invoiceDate = inv.invoiceDate;
    base.dueDate = inv.dueDate;
    base.currency = inv.currency;
    base.subtotal = inv.subtotal;
    base.tax = inv.tax;
    base.total = inv.total;
    base.lineItemCount = inv.lineItems?.length ?? 0;
    base.lineItemsDescription = inv.lineItemsDescription;
    base.validationErrorCount = inv.validation?.errors?.length ?? 0;
  } else if (doc.type === "statement" && doc.statement) {
    const st = doc.statement;
    base.accountHolder = st.accountHolder;
    base.bankName = st.bankName;
    base.currency = st.currency;
    base.transactionCount = st.transactions?.length ?? 0;
    base.closingBalance = st.closingBalance;
    base.validationErrorCount = st.validation?.errors?.length ?? 0;
  }
  return base;
}

export function summarizeTextSegmentsForLog(
  segments: { pageNumber: number; text: string; textSource: string }[],
  maxPages = 25
): Record<string, unknown> {
  const slice = segments.slice(0, maxPages);
  return {
    totalPages: segments.length,
    pagesLogged: slice.length,
    pages: slice.map((s) => ({
      page: s.pageNumber,
      textSource: s.textSource,
      textChars: s.text.length,
      textPreview: s.text.slice(0, 280),
    })),
    ...(segments.length > maxPages ? { _morePagesOmitted: segments.length - maxPages } : {}),
  };
}

export function appendJobDiagnostic(
  log: JobDiagnosticEntry[],
  phase: string,
  message: string,
  meta?: Record<string, unknown>
): JobDiagnosticEntry {
  const entry: JobDiagnosticEntry = {
    at: new Date().toISOString(),
    phase,
    message,
    meta: sanitizeDiagnosticMeta(meta),
  };
  if (log.length >= MAX_DIAGNOSTIC_ENTRIES) {
    log.shift();
    entry.meta = {
      ...(entry.meta ?? {}),
      _note: "earliest diagnostic entries dropped (cap)",
    };
  }
  log.push(entry);
  return entry;
}

/** Log every per-page char line to console (very verbose on large PDFs). */
export function extractionDebugPageChars(): boolean {
  const v = process.env.EXTRACTION_DEBUG_PAGE_CHARS?.toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  return process.env.EXTRACTION_DEBUG_LOG?.toLowerCase() === "1";
}

/** When false, per-page char diagnostics are summarized only. */
export function shouldLogDiagnosticToConsole(phase: string): boolean {
  if (phase === "page_chars") return extractionDebugPageChars();
  return true;
}

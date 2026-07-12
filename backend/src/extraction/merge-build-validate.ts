import { randomUUID } from "node:crypto";
import type { TenantId } from "../tenant/tenant-scope.js";
import type {
  DocumentValidation,
  FinancialDocType,
  FinancialDocument,
  FinancialDocumentStatus,
  Invoice,
  InvoiceLine,
  Segment,
  SegmentClassification,
  SegmentKind,
  Statement,
  StatementLine,
} from "./financial-types.js";
import { normalizeFinancialDateToIso } from "../financial-date.util.js";

const EPS = 0.02;

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(String(v).replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function normalizeDateStr(v: unknown): string | null {
  const raw = str(v);
  if (!raw) return null;
  return normalizeFinancialDateToIso(raw) ?? raw;
}

function extractedRecord(seg: Segment): Record<string, unknown> | null {
  const d = seg.extractedData;
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  return d as Record<string, unknown>;
}

function firstExtractedField(group: Segment[], field: string): string | null {
  for (const seg of group) {
    const v = str(extractedRecord(seg)?.[field]);
    if (v) return v;
  }
  return null;
}

function groupDocumentKind(group: Segment[]): SegmentKind {
  for (const seg of group) {
    const k = seg.classification?.segmentKind;
    if (k === "invoice" || k === "statement") return k;
  }
  if (firstExtractedField(group, "invoiceNumber") || firstExtractedField(group, "vendor")) {
    return "invoice";
  }
  if (firstExtractedField(group, "accountNumber") || firstExtractedField(group, "accountHolder")) {
    return "statement";
  }
  return group[0]?.classification?.segmentKind ?? "other";
}

function pageHasNewInvoiceNumber(seg: Segment, prevGroup: Segment[]): boolean {
  const invoiceNumber = str(extractedRecord(seg)?.invoiceNumber);
  const prevInvoiceNumber = firstExtractedField(prevGroup, "invoiceNumber");
  return Boolean(invoiceNumber && prevInvoiceNumber && invoiceNumber !== prevInvoiceNumber);
}

function pageHasNewStatementAccount(seg: Segment, prevGroup: Segment[]): boolean {
  const accountNumber = str(extractedRecord(seg)?.accountNumber);
  const prevAccountNumber = firstExtractedField(prevGroup, "accountNumber");
  return Boolean(accountNumber && prevAccountNumber && accountNumber !== prevAccountNumber);
}

function isInventedInvoiceIdentity(seg: Segment): boolean {
  const o = extractedRecord(seg);
  if (!o) return true;
  const invoiceNumber = str(o.invoiceNumber);
  const vendor = str(o.vendor);
  const invoiceDate = str(o.invoiceDate);
  return Boolean(invoiceNumber && !vendor && !invoiceDate);
}

/**
 * Continuation when the page does not introduce a new invoice identity.
 * Blank pages, totals-only pages, and extra line-item pages belong to the previous invoice.
 */
function isInvoiceContinuationPage(seg: Segment, prevGroup: Segment[]): boolean {
  if (groupDocumentKind(prevGroup) !== "invoice") return false;

  const textLen = seg.text.trim().length;
  if (textLen < 50) return true;

  if (pageHasNewInvoiceNumber(seg, prevGroup) && !isInventedInvoiceIdentity(seg)) {
    return false;
  }

  const invoiceNumber = str(extractedRecord(seg)?.invoiceNumber);
  const prevInvoiceNumber = firstExtractedField(prevGroup, "invoiceNumber");
  if (invoiceNumber && prevInvoiceNumber && invoiceNumber === prevInvoiceNumber) {
    return true;
  }
  if (invoiceNumber && !prevInvoiceNumber) {
    const pageVendor = str(extractedRecord(seg)?.vendor);
    const pageDate = str(extractedRecord(seg)?.invoiceDate);
    const groupVendor = firstExtractedField(prevGroup, "vendor");
    if (pageVendor && groupVendor && pageVendor !== groupVendor) return false;
    if (!pageVendor && !pageDate) return true;
    if (seg.classification?.boundary === "continuation") return true;
    return false;
  }

  // No invoice number on this page → keep with previous invoice (blank / VAT / line items).
  return !invoiceNumber;
}

function isStatementContinuationPage(seg: Segment, prevGroup: Segment[]): boolean {
  if (groupDocumentKind(prevGroup) !== "statement") return false;
  if (pageHasNewStatementAccount(seg, prevGroup)) return false;

  const accountNumber = str(extractedRecord(seg)?.accountNumber);
  const prevAccountNumber = firstExtractedField(prevGroup, "accountNumber");
  if (accountNumber && prevAccountNumber && accountNumber === prevAccountNumber) {
    return true;
  }

  return !accountNumber;
}

function shouldContinuePreviousGroup(seg: Segment, group: Segment[]): boolean {
  const gk = groupDocumentKind(group);
  if (gk === "invoice" && isInvoiceContinuationPage(seg, group)) return true;
  if (gk === "statement" && isStatementContinuationPage(seg, group)) return true;

  const c: SegmentClassification = seg.classification ?? {
    segmentKind: "other",
    boundary: "new",
  };
  const sk = c.segmentKind;
  return c.boundary === "continuation" && sk === gk && sk !== "other";
}

/** Stage 5 — group consecutive segments into document groups. */
export function groupSegmentsForDocuments(segments: Segment[]): Segment[][] {
  const groups: Segment[][] = [];
  let group: Segment[] = [];
  for (const seg of segments) {
    if (group.length === 0) {
      group.push(seg);
      continue;
    }
    if (shouldContinuePreviousGroup(seg, group)) {
      group.push(seg);
    } else {
      groups.push(group);
      group = [seg];
    }
  }
  if (group.length) groups.push(group);
  return groups;
}

function firstNonNull<T>(values: (T | null | undefined)[]): T | null {
  for (const v of values) {
    if (v !== null && v !== undefined && v !== "") return v as T;
  }
  return null;
}

function lastNonNull<T>(values: (T | null | undefined)[]): T | null {
  let last: T | null = null;
  for (const v of values) {
    if (v !== null && v !== undefined && v !== "") last = v as T;
  }
  return last;
}

function parseLineItems(raw: unknown): InvoiceLine[] {
  if (!Array.isArray(raw)) return [];
  const out: InvoiceLine[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    out.push({
      description: str(o.description),
      quantity: num(o.quantity),
      unitPrice: num(o.unitPrice),
      amount: num(o.amount),
      discount: num(o.discount),
      taxAmount: num(o.taxAmount),
    });
  }
  return out;
}

function parseTransactions(raw: unknown): StatementLine[] {
  if (!Array.isArray(raw)) return [];
  const out: StatementLine[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    out.push({
      date: normalizeDateStr(o.date),
      description: str(o.description),
      debit: num(o.debit),
      credit: num(o.credit),
      balance: num(o.balance),
    });
  }
  return out;
}

/** Stage 6 — build invoice from merged segment extractedData. */
export function buildInvoiceFromGroup(segments: Segment[]): Invoice {
  const datas = segments
    .map((s) => s.extractedData)
    .filter((x): x is Record<string, unknown> => x !== null && typeof x === "object" && !Array.isArray(x));

  const lineItems: InvoiceLine[] = [];
  for (const d of datas) {
    lineItems.push(...parseLineItems(d.lineItems));
  }

  const vendors = datas.map((d) => str(d.vendor));
  const customers = datas.map((d) => str(d.customer));
  const legacyStoreNames = datas.map((d) => str(d.storeName));
  const customerAddresses = datas.map((d) => str(d.customerAddress));
  const invNums = datas.map((d) => str(d.invoiceNumber));
  const invDates = datas.map((d) => normalizeDateStr(d.invoiceDate));
  const dueDates = datas.map((d) => normalizeDateStr(d.dueDate));
  const currencies = datas.map((d) => str(d.currency));
  const subs = datas.map((d) => num(d.subtotal));
  const taxes = datas.map((d) => num(d.tax));
  const totals = datas.map((d) => num(d.total));
  const notes = datas.map((d) => str(d.notes));
  const lineItemsDescriptions = datas.map((d) => str(d.lineItemsDescription));

  const billTo = firstNonNull([...customers, ...legacyStoreNames]);

  return {
    vendor: firstNonNull(vendors),
    customer: billTo,
    storeName: billTo,
    customerAddress: firstNonNull(customerAddresses),
    invoiceNumber: firstNonNull(invNums),
    invoiceDate: firstNonNull(invDates),
    dueDate: firstNonNull(dueDates),
    currency: firstNonNull(currencies),
    subtotal: lastNonNull(subs),
    tax: lastNonNull(taxes),
    total: lastNonNull(totals),
    notes: lastNonNull(notes),
    lineItemsDescription: firstNonNull(lineItemsDescriptions),
    lineItems,
    status: "pending",
    validation: { errors: [], warnings: [] },
  };
}

export function buildStatementFromGroup(segments: Segment[]): Statement {
  const datas = segments
    .map((s) => s.extractedData)
    .filter((x): x is Record<string, unknown> => x !== null && typeof x === "object" && !Array.isArray(x));

  const transactions: StatementLine[] = [];
  for (const d of datas) {
    transactions.push(...parseTransactions(d.transactions));
  }

  const holders = datas.map((d) => str(d.accountHolder));
  const banks = datas.map((d) => str(d.bankName));
  const accs = datas.map((d) => str(d.accountNumber));
  const starts = datas.map((d) => normalizeDateStr(d.statementPeriodStart));
  const ends = datas.map((d) => normalizeDateStr(d.statementPeriodEnd));
  const currencies = datas.map((d) => str(d.currency));
  const opens = datas.map((d) => num(d.openingBalance));
  const closes = datas.map((d) => num(d.closingBalance));
  const notes = datas.map((d) => str(d.notes));

  return {
    accountHolder: firstNonNull(holders),
    bankName: firstNonNull(banks),
    accountNumber: firstNonNull(accs),
    statementPeriodStart: firstNonNull(starts),
    statementPeriodEnd: lastNonNull(ends),
    currency: firstNonNull(currencies),
    openingBalance: firstNonNull(opens),
    closingBalance: lastNonNull(closes),
    notes: lastNonNull(notes),
    transactions,
    status: "pending",
    validation: { errors: [], warnings: [] },
  };
}

export function validateInvoice(inv: Invoice): DocumentValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const codes: string[] = [];

  if (!inv.invoiceNumber && !inv.total) {
    warnings.push("Missing invoice number and total.");
    codes.push("MISSING_KEY_FIELDS");
  }

  let sumLines = 0;
  let hasLineAmount = false;
  for (const li of inv.lineItems) {
    if (li.amount != null) {
      sumLines += li.amount;
      hasLineAmount = true;
    }
  }

  if (inv.subtotal != null && hasLineAmount && Math.abs(sumLines - inv.subtotal) > EPS) {
    warnings.push(
      `Sum of line amounts (${sumLines.toFixed(2)}) differs from subtotal (${inv.subtotal}).`
    );
    codes.push("LINE_SUBTOTAL_MISMATCH");
  }

  if (inv.subtotal != null && inv.tax != null && inv.total != null) {
    const exp = inv.subtotal + inv.tax;
    if (Math.abs(exp - inv.total) > EPS) {
      warnings.push(`subtotal + tax (${exp}) differs from total (${inv.total}).`);
      codes.push("TOTAL_MISMATCH");
    }
  }

  const status: FinancialDocumentStatus = errors.length > 0 ? "error" : "success";
  return { errors, warnings, codes };
}

export function validateStatement(st: Statement): DocumentValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const codes: string[] = [];

  if (!st.transactions.length && st.closingBalance == null) {
    warnings.push("No transactions and no closing balance.");
    codes.push("EMPTY_STATEMENT");
  }

  let net = 0;
  for (const t of st.transactions) {
    if (t.debit != null) net -= t.debit;
    if (t.credit != null) net += t.credit;
  }
  if (st.openingBalance != null && st.closingBalance != null && st.transactions.length > 0) {
    const expected = st.openingBalance + net;
    if (Math.abs(expected - st.closingBalance) > EPS * 100) {
      warnings.push("Transaction net change does not reconcile to opening vs closing balance.");
      codes.push("BALANCE_RECONCILE");
    }
  }

  return { errors, warnings, codes };
}

/** Stages 5–7: build financial documents + validation. */
export function mergeBuildAndValidate(
  segments: Segment[],
  jobId: string,
  fileId: string,
  customerId: TenantId
): FinancialDocument[] {
  const groups = groupSegmentsForDocuments(segments);
  const docs: FinancialDocument[] = [];

  for (const group of groups) {
    const kind: SegmentKind = groupDocumentKind(group);
    const docType: FinancialDocType =
      kind === "statement" ? "statement" : "invoice";
    const pages = group.map((s) => s.pageNumber);
    const start = Math.min(...pages);
    const end = Math.max(...pages);
    const id = randomUUID();

    const fd: FinancialDocument = {
      id,
      type: docType,
      metadata: {
        pageRange: { start, end },
        jobId,
        fileId,
        customerId,
      },
      status: "pending",
      invoice: null,
      statement: null,
    };

    if (docType === "statement") {
      const st = buildStatementFromGroup(group);
      st.validation = validateStatement(st);
      st.status = st.validation.errors.length > 0 ? "error" : "success";
      fd.statement = st;
      fd.status = st.status;
    } else {
      const inv = buildInvoiceFromGroup(group);
      // inv.validation = validateInvoice(inv);
      inv.status = inv.validation.errors.length > 0 ? "error" : "success";
      fd.invoice = inv;
      fd.status = inv.status;
    }

    for (const s of group) {
      s.financialDocumentId = id;
      s.status = "merged";
    }

    docs.push(fd);
  }

  return docs;
}

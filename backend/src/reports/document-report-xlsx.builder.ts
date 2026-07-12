import ExcelJS from "exceljs";
import type {
  CustomerDocumentsReportModel,
  DocumentReportExtraction,
  DocumentReportRow,
} from "./customer-documents-report.types.js";
import { exportFilenameBase } from "../customers/customer-export.util.js";
import { formatDisplayDate, formatDisplayDateTime } from "../format-display-date.util.js";

const TABLE_COLS = 7;
/** File details and summary key-value blocks (label col A, value col B). */
const METADATA_COLS = 2;
const METADATA_LABEL_WIDTH = 24;
const METADATA_VALUE_WIDTH = 52;

const COLORS = {
  sectionHeader: "FF1E3A5F",
  sectionHeaderText: "FFFFFFFF",
  subHeader: "FFE8EEF4",
  subHeaderText: "FF1E3A5F",
  labelBg: "FFF3F4F6",
  tableHeader: "FF2563EB",
  tableHeaderText: "FFFFFFFF",
  altRow: "FFF9FAFB",
  border: "FFD1D5DB",
  muted: "FF6B7280",
  success: "FF16A34A",
  error: "FFDC2626",
  warning: "FFD97706",
  link: "FF0563C1",
  netColumnBg: "FFE5E7EB",
  reviewRow: "FFFFFF00",
} as const;

const INVOICE_REGISTER_HEADERS = [
  "Inv No",
  "Invoice date",
  "Page",
  "Store name",
  "Customer address",
  "Supplier",
  "Details",
  "Gross",
  "VAT",
  "Net",
] as const;
const INVOICE_REGISTER_COLS = INVOICE_REGISTER_HEADERS.length;
const STATEMENT_REGISTER_HEADERS = ["Date", "Description", "Dr", "Cr", "Balance"] as const;
const STATEMENT_REGISTER_COLS = STATEMENT_REGISTER_HEADERS.length;

function numCell(value: number | null | undefined): number | "" {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return value;
}

const LIBRARY_TZ = "Europe/London";

function formatUkShortDate(iso: string | null | undefined): string {
  return formatDisplayDate(iso, LIBRARY_TZ);
}

const INVALID_SHEET_CHARS = /[\\/?*[\]:]/g;
const EXCEL_SHEET_NAME_MAX_LEN = 31;
const RESERVED_SHEET_NAMES = new Set(["Summary"]);

export function sanitizeSheetName(raw: string | null | undefined, maxLen = EXCEL_SHEET_NAME_MAX_LEN): string {
  let name = (raw ?? "").replace(INVALID_SHEET_CHARS, " ").replace(/\s+/g, " ").trim() || "Sheet";
  if (name.length > maxLen) {
    name = name.slice(0, maxLen).trim() || "Sheet";
  }
  return name;
}

/** Excel tab names must be unique and ≤31 chars; collision after truncation is common for all-customers exports. */
function uniqueSheetNames(desired: string[], reserved = RESERVED_SHEET_NAMES): string[] {
  const used = new Set(reserved);
  return desired.map((raw, index) => {
    const stem = (raw ?? "").replace(INVALID_SHEET_CHARS, " ").replace(/\s+/g, " ").trim() || "Sheet";
    let candidate = sanitizeSheetName(stem);
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
    for (let n = 2; n < 10_000; n++) {
      const suffix = ` (${n})`;
      const maxStem = Math.max(1, EXCEL_SHEET_NAME_MAX_LEN - suffix.length);
      candidate = sanitizeSheetName(`${stem.slice(0, maxStem)}${suffix}`);
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }
    const fallback = sanitizeSheetName(`Sheet ${index + 1}`);
    let unique = fallback;
    let m = 2;
    while (used.has(unique)) {
      unique = sanitizeSheetName(`Sheet ${index + 1} ${m}`);
      m++;
    }
    used.add(unique);
    return unique;
  });
}

function customerSheetLabel(doc: Pick<DocumentReportRow, "customerId" | "customerName">): string {
  const name = (doc.customerName ?? "Customer").trim() || "Customer";
  const shortId = doc.customerId.replace(/-/g, "").slice(0, 6);
  return `${name} [${shortId}]`;
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const edge = { style: "thin" as const, color: { argb: COLORS.border } };
  return { top: edge, left: edge, bottom: edge, right: edge };
}

function applyRowBorders(row: ExcelJS.Row, fromCol: number, toCol: number): void {
  for (let c = fromCol; c <= toCol; c++) {
    row.getCell(c).border = thinBorder();
  }
}

function styleSectionHeader(row: ExcelJS.Row, sheet: ExcelJS.Worksheet, span = TABLE_COLS): void {
  sheet.mergeCells(row.number, 1, row.number, span);
  const cell = row.getCell(1);
  cell.font = { bold: true, size: 12, color: { argb: COLORS.sectionHeaderText } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.sectionHeader } };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  row.height = 24;
}

function styleSubHeader(row: ExcelJS.Row, sheet: ExcelJS.Worksheet, span = TABLE_COLS): void {
  sheet.mergeCells(row.number, 1, row.number, span);
  const cell = row.getCell(1);
  cell.font = { bold: true, size: 10, color: { argb: COLORS.subHeaderText } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.subHeader } };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  row.height = 20;
}

function styleStatusValue(cell: ExcelJS.Cell, status: string): void {
  const s = status.toLowerCase();
  let color: string = COLORS.subHeaderText;
  if (s === "completed" || s === "success") color = COLORS.success;
  else if (s === "failed" || s === "error" || s === "cancelled") color = COLORS.error;
  else if (s === "queued" || s === "processing") color = COLORS.warning;
  cell.font = { bold: true, color: { argb: color } };
}

function setHyperlink(cell: ExcelJS.Cell, text: string, url: string): void {
  cell.value = { text, hyperlink: url };
  cell.font = { color: { argb: COLORS.link }, underline: true };
}

type KeyValueEntry = {
  label: string;
  value: string | number;
  hyperlink?: string;
  statusStyle?: boolean;
};

function addKeyValueTable(
  sheet: ExcelJS.Worksheet,
  entries: KeyValueEntry[],
  options?: { skipEmpty?: boolean; valueColSpan?: number; compact?: boolean },
): void {
  const compact = options?.compact === true;
  const valueSpan = compact ? 1 : (options?.valueColSpan ?? TABLE_COLS - 1);
  for (const entry of entries) {
    if (options?.skipEmpty && entry.value === "") continue;
    const row = sheet.addRow([entry.label, entry.value]);
    const labelCell = row.getCell(1);
    labelCell.font = { bold: true, size: 10, color: { argb: "FF374151" } };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.labelBg } };
    labelCell.alignment = { vertical: "top", wrapText: true };
    labelCell.border = thinBorder();

    if (valueSpan > 1) {
      sheet.mergeCells(row.number, 2, row.number, 1 + valueSpan);
    }
    const valueCell = row.getCell(2);
    valueCell.alignment = { vertical: "top", wrapText: true };
    valueCell.border = thinBorder();
    if (entry.hyperlink) {
      setHyperlink(valueCell, String(entry.value), entry.hyperlink);
    } else if (entry.statusStyle && typeof entry.value === "string") {
      styleStatusValue(valueCell, entry.value);
    } else if (typeof entry.value === "number") {
      valueCell.numFmt = "#,##0.00";
    }
    if (!compact) {
      applyRowBorders(row, 3, TABLE_COLS);
    }
  }
  if (compact) {
    sheet.getColumn(1).width = Math.max(sheet.getColumn(1).width ?? 0, METADATA_LABEL_WIDTH);
    sheet.getColumn(2).width = Math.max(sheet.getColumn(2).width ?? 0, METADATA_VALUE_WIDTH);
  }
}

function ensureTableColumnWidths(sheet: ExcelJS.Worksheet): void {
  sheet.getColumn(1).width = METADATA_LABEL_WIDTH;
  sheet.getColumn(2).width = METADATA_VALUE_WIDTH;
  const lineWidths = [10, 14, 14, 12, 12];
  for (let i = 0; i < lineWidths.length; i++) {
    sheet.getColumn(i + 3).width = lineWidths[i]!;
  }
}

function addSpacer(sheet: ExcelJS.Worksheet): void {
  sheet.addRow([]);
}

function formatPagesRange(pageStart: number, pageEnd: number): string {
  const lo = Math.min(pageStart, pageEnd);
  const hi = Math.max(pageStart, pageEnd);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

function invoiceSubtotal(extraction: Extract<DocumentReportExtraction, { kind: "invoice" }>): number | null {
  if (extraction.subtotal != null && !Number.isNaN(extraction.subtotal)) {
    return extraction.subtotal;
  }
  let sum = 0;
  let any = false;
  for (const line of extraction.lines) {
    if (line.amount != null && !Number.isNaN(line.amount)) {
      sum += line.amount;
      any = true;
    }
  }
  return any ? sum : null;
}

function addExtractionResultBlock(
  sheet: ExcelJS.Worksheet,
  params: {
    typeLabel: "Invoice" | "Statement";
    index: number;
    total: number;
    pageStart: number;
    pageEnd: number;
    status: string;
    rows: KeyValueEntry[];
  },
): void {
  const pages = formatPagesRange(params.pageStart, params.pageEnd);
  const status = params.status.trim() || "—";

  const section = sheet.addRow(["Extraction result"]);
  styleSectionHeader(section, sheet, METADATA_COLS);

  const sub = sheet.addRow([
    `${params.typeLabel} ${params.index} of ${params.total} · pages ${pages} · ${status.toLowerCase()}`,
  ]);
  styleSubHeader(sub, sheet, METADATA_COLS);

  addKeyValueTable(
    sheet,
    [{ label: "Pages", value: pages }, ...params.rows, { label: "Status", value: status, statusStyle: true }],
    { skipEmpty: false, compact: true },
  );
  addSpacer(sheet);
}

function addInvoiceExtractionResult(
  sheet: ExcelJS.Worksheet,
  extraction: Extract<DocumentReportExtraction, { kind: "invoice" }>,
  index: number,
  total: number,
): void {
  addExtractionResultBlock(sheet, {
    typeLabel: "Invoice",
    index,
    total,
    pageStart: extraction.pageStart,
    pageEnd: extraction.pageEnd,
    status: extraction.status,
    rows: [
      { label: "Invoice #", value: extraction.invoiceNumber ?? "" },
      { label: "Invoice date", value: formatUkShortDate(extraction.invoiceDate) },
      ...(extraction.storeName?.trim() ? [{ label: "Store name", value: extraction.storeName.trim() }] : []),
      ...(extraction.customerAddress?.trim()
        ? [{ label: "Customer address", value: extraction.customerAddress.trim() }]
        : []),
      { label: "Subtotal", value: numCell(invoiceSubtotal(extraction)) },
      { label: "Tax", value: numCell(extraction.tax) },
      { label: "Total", value: numCell(extraction.total) },
      { label: "Currency", value: extraction.currency ?? "" },
      ...(extraction.lineItemsDescription?.trim()
        ? [{ label: "Summary", value: extraction.lineItemsDescription.trim() }]
        : []),
    ],
  });
}

function addStatementExtractionResult(
  sheet: ExcelJS.Worksheet,
  extraction: Extract<DocumentReportExtraction, { kind: "statement" }>,
  index: number,
  total: number,
): void {
  addExtractionResultBlock(sheet, {
    typeLabel: "Statement",
    index,
    total,
    pageStart: extraction.pageStart,
    pageEnd: extraction.pageEnd,
    status: extraction.status,
    rows: [
      { label: "Opening balance", value: numCell(extraction.openingBalance) },
      { label: "Closing balance", value: numCell(extraction.closingBalance) },
      { label: "Currency", value: extraction.currency ?? "" },
    ],
  });
}

type ExtractionResultSlice =
  | { kind: "invoice"; extraction: Extract<DocumentReportExtraction, { kind: "invoice" }> }
  | { kind: "statement"; extraction: Extract<DocumentReportExtraction, { kind: "statement" }> };

function extractionSlicesForDocument(doc: DocumentReportRow): ExtractionResultSlice[] {
  if (doc.job.kind === "job" && doc.job.financialDocuments.length > 0) {
    const sorted = [...doc.job.financialDocuments].sort(
      (a, b) => a.pageStart - b.pageStart || a.pageEnd - b.pageEnd,
    );
    return sorted.flatMap((fd): ExtractionResultSlice[] => {
      if (fd.extraction.kind === "invoice") {
        return [{ kind: "invoice", extraction: fd.extraction }];
      }
      if (fd.extraction.kind === "statement") {
        return [{ kind: "statement", extraction: fd.extraction }];
      }
      return [];
    });
  }
  if (doc.extraction.kind === "invoice") {
    return [{ kind: "invoice", extraction: doc.extraction }];
  }
  if (doc.extraction.kind === "statement") {
    return [{ kind: "statement", extraction: doc.extraction }];
  }
  return [];
}

function pickFirstNonEmpty(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function pickConsolidatedLabel(values: Array<string | null | undefined>): string | null {
  const nonEmpty = [...new Set(values.map((v) => v?.trim()).filter(Boolean) as string[])];
  if (nonEmpty.length === 0) return null;
  if (nonEmpty.length === 1) return nonEmpty[0]!;
  return `${nonEmpty[0]!} (+${nonEmpty.length - 1} more)`;
}

function sumNullable(values: Array<number | null | undefined>): number | null {
  let sum = 0;
  let any = false;
  for (const value of values) {
    if (value != null && !Number.isNaN(value)) {
      sum += value;
      any = true;
    }
  }
  return any ? sum : null;
}

function pickLongestText(values: Array<string | null | undefined>): string | null {
  let best = "";
  for (const value of values) {
    const trimmed = value?.trim() ?? "";
    if (trimmed.length > best.length) best = trimmed;
  }
  return best || null;
}

function invoiceSummaryForDocument(
  doc: DocumentReportRow,
  slices: ExtractionResultSlice[],
): Extract<DocumentReportExtraction, { kind: "invoice" }> | null {
  if (doc.extraction.kind === "invoice") {
    return doc.extraction;
  }
  const invoiceSlices = slices.filter(
    (slice): slice is { kind: "invoice"; extraction: Extract<DocumentReportExtraction, { kind: "invoice" }> } =>
      slice.kind === "invoice",
  );
  if (invoiceSlices.length === 0) return null;

  const extractions = invoiceSlices.map((slice) => slice.extraction);
  const pageStart = Math.min(...extractions.map((e) => e.pageStart));
  const pageEnd = Math.max(...extractions.map((e) => e.pageEnd));

  return {
    kind: "invoice",
    vendor: pickFirstNonEmpty([...extractions.map((e) => e.vendor), doc.supplierName]),
    storeName: pickFirstNonEmpty(extractions.map((e) => e.storeName)),
    customerAddress: pickLongestText(extractions.map((e) => e.customerAddress)),
    invoiceNumber: pickConsolidatedLabel(extractions.map((e) => e.invoiceNumber)),
    invoiceDate: pickFirstNonEmpty(extractions.map((e) => e.invoiceDate)) ?? doc.documentDate,
    dueDate: pickFirstNonEmpty(extractions.map((e) => e.dueDate)),
    subtotal: sumNullable(extractions.map((e) => invoiceSubtotal(e))),
    tax: sumNullable(extractions.map((e) => e.tax)),
    total: sumNullable(extractions.map((e) => e.total)),
    currency: pickFirstNonEmpty(extractions.map((e) => e.currency)),
    status: pickFirstNonEmpty(extractions.map((e) => e.status)) ?? "success",
    pageStart,
    pageEnd,
    lineItemsDescription: pickLongestText(extractions.map((e) => e.lineItemsDescription)),
    lines: [],
  };
}

function statementSummaryForDocument(
  doc: DocumentReportRow,
  slices: ExtractionResultSlice[],
): Extract<DocumentReportExtraction, { kind: "statement" }> | null {
  if (doc.extraction.kind === "statement") {
    return doc.extraction;
  }
  const statementSlices = slices.filter(
    (slice): slice is { kind: "statement"; extraction: Extract<DocumentReportExtraction, { kind: "statement" }> } =>
      slice.kind === "statement",
  );
  if (statementSlices.length === 0) return null;

  const extractions = statementSlices.map((slice) => slice.extraction);
  const pageStart = Math.min(...extractions.map((e) => e.pageStart));
  const pageEnd = Math.max(...extractions.map((e) => e.pageEnd));
  const lastByPage = [...extractions].sort((a, b) => b.pageEnd - a.pageEnd || b.pageStart - a.pageStart)[0]!;

  return {
    kind: "statement",
    accountHolder: pickFirstNonEmpty(extractions.map((e) => e.accountHolder)),
    bankName: pickFirstNonEmpty(extractions.map((e) => e.bankName)),
    periodStart: pickFirstNonEmpty(extractions.map((e) => e.periodStart)),
    periodEnd: pickFirstNonEmpty(extractions.map((e) => e.periodEnd)),
    openingBalance: extractions.find((e) => e.openingBalance != null)?.openingBalance ?? null,
    closingBalance: lastByPage.closingBalance ?? extractions.find((e) => e.closingBalance != null)?.closingBalance ?? null,
    currency: pickFirstNonEmpty(extractions.map((e) => e.currency)),
    status: pickFirstNonEmpty(extractions.map((e) => e.status)) ?? "success",
    pageStart,
    pageEnd,
    lines: extractions.flatMap((e) => e.lines ?? []),
  };
}

function addDocumentFileSummary(
  sheet: ExcelJS.Worksheet,
  doc: DocumentReportRow,
  slices: ExtractionResultSlice[],
): void {
  const invoice = invoiceSummaryForDocument(doc, slices);
  const statement = invoice ? null : statementSummaryForDocument(doc, slices);

  const section = sheet.addRow(["Document summary"]);
  styleSectionHeader(section, sheet, METADATA_COLS);

  const common: KeyValueEntry[] = [
    { label: "File name", value: doc.name },
    { label: "Folder", value: doc.folderPath || doc.folderSheetName },
    { label: "Document type", value: doc.documentType },
  ];
  if (doc.documentDate?.trim()) {
    common.push({ label: "Document date", value: doc.documentDate.trim() });
  }
  if (doc.supplierName?.trim() && !invoice?.vendor?.trim()) {
    common.push({ label: "Supplier", value: doc.supplierName.trim() });
  }

  if (invoice) {
    addKeyValueTable(
      sheet,
      [
        ...common,
        { label: "Invoice #", value: invoice.invoiceNumber ?? "" },
        { label: "Supplier", value: invoice.vendor?.trim() || doc.supplierName?.trim() || "" },
        { label: "Invoice date", value: formatUkShortDate(invoice.invoiceDate) },
        { label: "Page", value: formatPagesRange(invoice.pageStart, invoice.pageEnd) },
        ...(invoice.storeName?.trim() ? [{ label: "Store name", value: invoice.storeName.trim() }] : []),
        ...(invoice.customerAddress?.trim()
          ? [{ label: "Customer address", value: invoice.customerAddress.trim() }]
          : []),
        { label: "Due date", value: formatUkShortDate(invoice.dueDate) },
        { label: "Subtotal", value: numCell(invoice.subtotal ?? invoiceSubtotal(invoice)) },
        { label: "Tax (VAT)", value: numCell(invoice.tax) },
        { label: "Total", value: numCell(invoice.total) },
        { label: "Currency", value: invoice.currency ?? "" },
        ...(invoice.lineItemsDescription?.trim()
          ? [{ label: "Summary", value: invoice.lineItemsDescription.trim() }]
          : []),
        { label: "Status", value: invoice.status, statusStyle: true },
      ],
      { skipEmpty: true, compact: true },
    );
    addSpacer(sheet);
    return;
  }

  if (statement) {
    addKeyValueTable(
      sheet,
      [
        ...common,
        { label: "Account holder", value: statement.accountHolder ?? "" },
        { label: "Bank", value: statement.bankName ?? "" },
        { label: "Period start", value: statement.periodStart ?? "" },
        { label: "Period end", value: statement.periodEnd ?? "" },
        { label: "Opening balance", value: numCell(statement.openingBalance) },
        { label: "Closing balance", value: numCell(statement.closingBalance) },
        { label: "Currency", value: statement.currency ?? "" },
        { label: "Status", value: statement.status, statusStyle: true },
        ...(slices.length > 1
          ? [{ label: "Extracted pages", value: formatPagesRange(statement.pageStart, statement.pageEnd) }]
          : []),
      ],
      { skipEmpty: true, compact: true },
    );
    addSpacer(sheet);
    return;
  }

  addKeyValueTable(sheet, common, { skipEmpty: true, compact: true });
  addSpacer(sheet);
}

function addDocumentExtractionSummary(sheet: ExcelJS.Worksheet, doc: DocumentReportRow): void {
  const slices = extractionSlicesForDocument(doc);
  if (slices.length === 0) {
    const section = sheet.addRow(["No extraction"]);
    styleSectionHeader(section, sheet, METADATA_COLS);
    addKeyValueTable(
      sheet,
      [
        { label: "File name", value: doc.name },
        { label: "Document type", value: doc.documentType },
      ],
      { skipEmpty: true, compact: true },
    );
    addSpacer(sheet);
    return;
  }

  addDocumentFileSummary(sheet, doc, slices);

  const total = slices.length;
  slices.forEach((slice, i) => {
    const index = i + 1;
    if (slice.kind === "invoice") {
      addInvoiceExtractionResult(sheet, slice.extraction, index, total);
    } else {
      addStatementExtractionResult(sheet, slice.extraction, index, total);
    }
  });
}

function addDocumentSections(
  sheet: ExcelJS.Worksheet,
  documents: DocumentReportRow[],
): void {
  ensureTableColumnWidths(sheet);

  const sorted = [...documents].sort((a, b) => a.name.localeCompare(b.name, "en"));
  for (let i = 0; i < sorted.length; i++) {
    const doc = sorted[i]!;
    if (i > 0) {
      addSpacer(sheet);
      const sep = sheet.addRow([""]);
      sheet.mergeCells(sep.number, 1, sep.number, TABLE_COLS);
      sep.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
      sep.height = 6;
      addSpacer(sheet);
    }

    const titleRow = sheet.addRow([`Document ${i + 1} of ${sorted.length}: ${doc.name}`]);
    styleSectionHeader(titleRow, sheet);
    titleRow.getCell(1).font = { bold: true, size: 13, color: { argb: COLORS.sectionHeaderText } };

    addDocumentExtractionSummary(sheet, doc);
  }
}

type InvoiceRegisterRow = {
  invNo: string;
  invoiceDate: string;
  page: string;
  storeName: string;
  customerAddress: string;
  supplier: string;
  details: string;
  gross: number | "";
  vat: number | "";
  net: number | "";
  needsReview: boolean;
  sortDate: string;
};

function invoiceNeedsReview(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s !== "" && s !== "success" && s !== "completed";
}

function grossFromNetVat(net: number | "", vat: number | ""): number | "" {
  if (typeof net === "number" && typeof vat === "number") return net + vat;
  if (typeof net === "number") return net;
  return "";
}

function invoiceRegisterAmounts(
  inv: Extract<DocumentReportExtraction, { kind: "invoice" }>,
): { gross: number | ""; vat: number | ""; net: number | "" } {
  const headerNet = numCell(
    inv.subtotal ??
      invoiceSubtotal(inv) ??
      (inv.total != null && inv.tax != null ? inv.total - inv.tax : null),
  );
  const headerVat = numCell(inv.tax);
  const headerGross = numCell(inv.total) !== "" ? numCell(inv.total) : grossFromNetVat(headerNet, headerVat);
  if (headerGross !== "" || headerVat !== "" || headerNet !== "") {
    return {
      net: headerNet,
      vat: headerVat,
      gross: headerGross,
    };
  }

  if (inv.lines.length > 0) {
    let netSum = 0;
    let vatSum = 0;
    let anyNet = false;
    let anyVat = false;
    for (const line of inv.lines) {
      if (line.amount != null && !Number.isNaN(line.amount)) {
        netSum += line.amount;
        anyNet = true;
      }
      if (line.taxAmount != null && !Number.isNaN(line.taxAmount)) {
        vatSum += line.taxAmount;
        anyVat = true;
      }
    }
    const net = anyNet ? numCell(netSum) : "";
    const vat = anyVat ? numCell(vatSum) : "";
    const gross = grossFromNetVat(net, vat);
    return { net, vat, gross };
  }

  return { net: "", vat: "", gross: "" };
}

function collectInvoiceRegisterRows(documents: DocumentReportRow[]): InvoiceRegisterRow[] {
  const rows: InvoiceRegisterRow[] = [];

  for (const doc of documents) {
    const slices = extractionSlicesForDocument(doc).filter(
      (slice): slice is { kind: "invoice"; extraction: Extract<DocumentReportExtraction, { kind: "invoice" }> } =>
        slice.kind === "invoice",
    );

    for (const slice of slices) {
      const inv = slice.extraction;
      const supplier = inv.vendor?.trim() || doc.supplierName?.trim() || "";
      const invNo = inv.invoiceNumber?.trim() ?? "";
      const sortDate = inv.invoiceDate?.trim() || doc.documentDate?.trim() || "";
      const invoiceDate = formatUkShortDate(sortDate);
      const page = formatPagesRange(inv.pageStart, inv.pageEnd);
      const needsReview = invoiceNeedsReview(inv.status);
      const { gross, vat, net } = invoiceRegisterAmounts(inv);

      rows.push({
        invNo,
        invoiceDate,
        page,
        storeName: inv.storeName?.trim() ?? "",
        customerAddress: inv.customerAddress?.trim() ?? "",
        supplier,
        details: inv.lineItemsDescription?.trim() ?? "",
        gross,
        vat,
        net,
        needsReview,
        sortDate,
      });
    }
  }

  rows.sort((a, b) => {
    const dateCmp = a.sortDate.localeCompare(b.sortDate);
    if (dateCmp !== 0) return dateCmp;
    const supplierCmp = a.supplier.localeCompare(b.supplier, "en");
    if (supplierCmp !== 0) return supplierCmp;
    return a.invNo.localeCompare(b.invNo, "en");
  });

  return rows;
}

function styleInvoiceRegisterHeader(row: ExcelJS.Row): void {
  row.height = 22;
  for (let c = 1; c <= INVOICE_REGISTER_COLS; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: COLORS.tableHeaderText } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.tableHeader } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = thinBorder();
  }
}

function addInvoiceRegisterSheet(workbook: ExcelJS.Workbook, documents: DocumentReportRow[]): void {
  const sheet = workbook.addWorksheet("Invoices", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headerRow = sheet.addRow([...INVOICE_REGISTER_HEADERS]);
  styleInvoiceRegisterHeader(headerRow);

  const registerRows = collectInvoiceRegisterRows(documents);
  for (const entry of registerRows) {
    const row = sheet.addRow([
      entry.invNo,
      entry.invoiceDate,
      entry.page,
      entry.storeName,
      entry.customerAddress,
      entry.supplier,
      entry.details,
      entry.gross,
      entry.vat,
      entry.net,
    ]);
    applyRowBorders(row, 1, INVOICE_REGISTER_COLS);

    for (let c = 1; c <= INVOICE_REGISTER_COLS; c++) {
      const cell = row.getCell(c);
      cell.alignment = { vertical: "top", wrapText: c === 5 || c === 7 };
      if (c >= 8 && typeof cell.value === "number") {
        cell.numFmt = "#,##0.00";
        cell.alignment = { vertical: "top", horizontal: "right" };
      }
      if (c === 10) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.netColumnBg } };
      }
      if (entry.needsReview) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.reviewRow } };
      }
    }
  }

  const widths = [14, 12, 8, 22, 32, 24, 36, 10, 10, 10];
  for (let i = 0; i < widths.length; i++) {
    sheet.getColumn(i + 1).width = widths[i]!;
  }
}

type StatementRegisterRow = {
  date: string;
  description: string;
  debit: number | "";
  credit: number | "";
  balance: number | "";
  needsReview: boolean;
  sortDate: string;
  sortIndex: number;
};

function statementNeedsReview(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s !== "" && s !== "success" && s !== "completed";
}

function collectStatementExtractions(
  doc: DocumentReportRow,
): Array<Extract<DocumentReportExtraction, { kind: "statement" }>> {
  const slices = extractionSlicesForDocument(doc).filter(
    (slice): slice is { kind: "statement"; extraction: Extract<DocumentReportExtraction, { kind: "statement" }> } =>
      slice.kind === "statement",
  );
  if (slices.length > 0) {
    return slices.map((slice) => slice.extraction);
  }
  if (doc.extraction.kind === "statement") {
    return [doc.extraction];
  }
  return [];
}

function collectStatementRegisterRows(documents: DocumentReportRow[]): StatementRegisterRow[] {
  const rows: StatementRegisterRow[] = [];

  for (const doc of documents) {
    for (const st of collectStatementExtractions(doc)) {
      const needsReview = statementNeedsReview(st.status);
      const lines = [...(st.lines ?? [])].sort((a, b) => a.lineIndex - b.lineIndex);

      if (lines.length === 0) {
        const sortDate = st.periodStart?.trim() || st.periodEnd?.trim() || doc.documentDate?.trim() || "";
        rows.push({
          date: formatUkShortDate(sortDate),
          description:
            [st.accountHolder, st.bankName].filter(Boolean).join(" — ") ||
            "Statement (no transaction lines extracted)",
          debit: "",
          credit: "",
          balance: numCell(st.closingBalance ?? st.openingBalance),
          needsReview: true,
          sortDate,
          sortIndex: 0,
        });
        continue;
      }

      for (const line of lines) {
        const sortDate = line.date?.trim() || st.periodStart?.trim() || doc.documentDate?.trim() || "";
        rows.push({
          date: formatUkShortDate(sortDate),
          description: line.description?.trim() || "",
          debit: numCell(line.debit),
          credit: numCell(line.credit),
          balance: numCell(line.balance),
          needsReview,
          sortDate,
          sortIndex: line.lineIndex,
        });
      }
    }
  }

  rows.sort((a, b) => {
    const dateCmp = a.sortDate.localeCompare(b.sortDate);
    if (dateCmp !== 0) return dateCmp;
    return a.sortIndex - b.sortIndex;
  });

  return rows;
}

function styleStatementRegisterHeader(row: ExcelJS.Row): void {
  row.height = 22;
  for (let c = 1; c <= STATEMENT_REGISTER_COLS; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: COLORS.tableHeaderText } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.tableHeader } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = thinBorder();
  }
}

function addStatementRegisterSheet(workbook: ExcelJS.Workbook, documents: DocumentReportRow[]): void {
  const sheet = workbook.addWorksheet("Statements", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headerRow = sheet.addRow([...STATEMENT_REGISTER_HEADERS]);
  styleStatementRegisterHeader(headerRow);

  const registerRows = collectStatementRegisterRows(documents);
  for (const entry of registerRows) {
    const row = sheet.addRow([entry.date, entry.description, entry.debit, entry.credit, entry.balance]);
    applyRowBorders(row, 1, STATEMENT_REGISTER_COLS);

    for (let c = 1; c <= STATEMENT_REGISTER_COLS; c++) {
      const cell = row.getCell(c);
      cell.alignment = { vertical: "top", wrapText: c === 2 };
      if (c >= 3 && typeof cell.value === "number") {
        cell.numFmt = "#,##0.00";
        cell.alignment = { vertical: "top", horizontal: "right" };
      }
      if (entry.needsReview) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.reviewRow } };
      }
    }
  }

  const widths = [12, 48, 12, 12, 12];
  for (let i = 0; i < widths.length; i++) {
    sheet.getColumn(i + 1).width = widths[i]!;
  }
}

function addGroupedSheets(
  workbook: ExcelJS.Workbook,
  documents: DocumentReportRow[],
  groupKey: (doc: DocumentReportRow) => string,
  sheetNameForGroup: (docs: DocumentReportRow[]) => string,
): void {
  const groups = new Map<string, DocumentReportRow[]>();
  for (const doc of documents) {
    const key = groupKey(doc);
    const list = groups.get(key) ?? [];
    list.push(doc);
    groups.set(key, list);
  }

  const entries = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "en"));
  const names = uniqueSheetNames(entries.map(([, docs]) => sheetNameForGroup(docs)));

  for (let i = 0; i < entries.length; i++) {
    const [, docs] = entries[i]!;
    const sheet = workbook.addWorksheet(names[i]!, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    const title = sheet.addRow([`${sheetNameForGroup(docs)}  ·  ${docs.length} document(s)`]);
    styleSectionHeader(title, sheet);
    addSpacer(sheet);
    addDocumentSections(sheet, docs);
  }
}

function addSummarySheet(workbook: ExcelJS.Workbook, model: CustomerDocumentsReportModel): void {
  const sheet = workbook.addWorksheet("Summary", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ensureTableColumnWidths(sheet);

  const title = sheet.addRow(["Report summary"]);
  styleSectionHeader(title, sheet);

  const typeCounts = new Map<string, number>();
  for (const d of model.documents) {
    typeCounts.set(d.documentType, (typeCounts.get(d.documentType) ?? 0) + 1);
  }
  const folderKeys = new Set(model.documents.map((d) => d.folderSheetName));
  const dateKeys = new Set(model.documents.map((d) => d.sheetDateKey));

  const customerKeys = new Set(model.documents.map((d) => d.customerId));

  const rows: KeyValueEntry[] = [
    { label: "Customer", value: model.customerName },
    ...(model.allCustomers
      ? [
          { label: "Active customers scanned", value: model.customerCount },
          { label: "Customers with documents", value: customerKeys.size },
        ]
      : [{ label: "Customer ID", value: model.customerId ?? "" }]),
    { label: "Date from", value: model.from },
    { label: "Date to", value: model.to },
    { label: "Date basis", value: model.dateBasis },
    { label: "Layout", value: model.layoutMode },
    { label: "Generated at", value: formatDisplayDateTime(model.generatedAt, LIBRARY_TZ) },
    { label: "Document count", value: model.documents.length },
    { label: "Folder count", value: folderKeys.size },
    { label: "Date count", value: dateKeys.size },
  ];
  for (const [type, count] of [...typeCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    rows.push({ label: `Type: ${type}`, value: count });
  }
  const withJob = model.documents.filter((d) => d.job.kind === "job").length;
  const withExtraction = model.documents.filter(
    (d) => d.extraction.kind !== "none" || (d.job.kind === "job" && d.job.financialDocuments.length > 0),
  ).length;
  rows.push({ label: "Documents with extraction data", value: withExtraction });
  rows.push({ label: "Documents with extraction job", value: withJob });
  if (model.layoutMode === "invoice_register") {
    rows.push({ label: "Invoice register rows", value: collectInvoiceRegisterRows(model.documents).length });
  }
  if (model.layoutMode === "statement_register") {
    rows.push({
      label: "Statement register rows",
      value: collectStatementRegisterRows(model.documents).length,
    });
  }
  addKeyValueTable(sheet, rows);

  addSpacer(sheet);
  const noteText =
    model.layoutMode === "invoice_register"
      ? "Invoice register layout: one row per invoice (Inv No, Invoice date, Page, Store name, Customer address, Supplier, Details, Gross, VAT, Net). Amounts use invoice totals when available, otherwise the sum of line items. Details uses the job-generated summary. Documents without invoice extraction are omitted. Rows needing review are highlighted in yellow."
      : model.layoutMode === "statement_register"
        ? "Statement register layout: one row per transaction (Date, Description, Dr, Cr, Balance). Debit/credit amounts come from extracted statement lines. Documents without statement extraction are omitted. Rows needing review are highlighted in yellow."
        : "All layout modes include the same content per document: Document summary (invoice #, supplier, date, tax, total, line-item summary when available), then one Extraction result block per page. No line items table, file images, or download links.";
  const note = sheet.addRow([noteText]);
  sheet.mergeCells(note.number, 1, note.number, TABLE_COLS);
  note.getCell(1).font = { italic: true, color: { argb: COLORS.muted }, size: 9 };
  note.getCell(1).alignment = { wrapText: true, vertical: "top" };
}

function addPerDocumentSheets(
  workbook: ExcelJS.Workbook,
  documents: DocumentReportRow[],
  allCustomers: boolean,
): void {
  const names = uniqueSheetNames(
    documents.map((d) => {
      const shortId = d.id.replace(/-/g, "").slice(0, 6);
      const base = (d.name ?? "").trim() || "Document";
      return allCustomers
        ? `${customerSheetLabel(d)} — ${base} ${shortId}`
        : `${base} ${shortId}`;
    }),
  );
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i]!;
    const sheet = workbook.addWorksheet(names[i]!, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    ensureTableColumnWidths(sheet);
    const title = sheet.addRow([doc.name]);
    styleSectionHeader(title, sheet);
    addSpacer(sheet);
    addDocumentExtractionSummary(sheet, doc);
  }
}

export function customerDocumentsReportFilename(model: CustomerDocumentsReportModel): string {
  if (model.allCustomers || !model.customerId) {
    if (model.layoutMode === "invoice_register") {
      return `All_customers_invoices_${model.from}_${model.to}.xlsx`;
    }
    if (model.layoutMode === "statement_register") {
      return `All_customers_statements_${model.from}_${model.to}.xlsx`;
    }
    return `All_customers_documents_${model.from}_${model.to}.xlsx`;
  }
  const base = exportFilenameBase(model.customerName, model.customerId);
  if (model.layoutMode === "invoice_register") {
    return `${base}_invoices_${model.from}_${model.to}.xlsx`;
  }
  if (model.layoutMode === "statement_register") {
    return `${base}_statements_${model.from}_${model.to}.xlsx`;
  }
  return `${base}_documents_${model.from}_${model.to}.xlsx`;
}

export async function buildCustomerDocumentsReportXlsx(model: CustomerDocumentsReportModel): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "doc-parser";
  workbook.created = new Date();

  addSummarySheet(workbook, model);

  if (model.layoutMode === "invoice_register") {
    addInvoiceRegisterSheet(workbook, model.documents);
  } else if (model.layoutMode === "statement_register") {
    addStatementRegisterSheet(workbook, model.documents);
  } else if (model.layoutMode === "per_document") {
    addPerDocumentSheets(workbook, model.documents, model.allCustomers);
  } else if (model.layoutMode === "per_folder") {
    const groupKey = model.allCustomers
      ? (d: DocumentReportRow) =>
          `${d.customerId}::${d.folderPath ?? d.folderSheetName ?? "Unfiled"}`
      : (d: DocumentReportRow) => d.folderPath ?? d.folderSheetName ?? "Unfiled";
    const sheetTitle = (docs: DocumentReportRow[]) => {
      const first = docs[0]!;
      const folder = first.folderPath ?? first.folderSheetName ?? "Unfiled";
      return model.allCustomers ? `${customerSheetLabel(first)} / ${folder}` : folder;
    };
    addGroupedSheets(workbook, model.documents, groupKey, sheetTitle);
  } else {
    const groupKey = model.allCustomers
      ? (d: DocumentReportRow) => `${d.customerId}::${d.sheetDateKey ?? "Unknown date"}`
      : (d: DocumentReportRow) => d.sheetDateKey ?? "Unknown date";
    const sheetTitle = (docs: DocumentReportRow[]) => {
      const first = docs[0]!;
      const dateKey = first.sheetDateKey ?? "Unknown date";
      return model.allCustomers ? `${customerSheetLabel(first)} / ${dateKey}` : dateKey;
    };
    addGroupedSheets(workbook, model.documents, groupKey, sheetTitle);
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}

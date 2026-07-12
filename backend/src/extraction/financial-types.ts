import type { TenantId } from "../tenant/tenant-scope.js";

export type SegmentKind = "invoice" | "statement" | "other";

export type SegmentClassification = {
  segmentKind: SegmentKind;
  boundary: "new" | "continuation";
};

export type SegmentStatus =
  | "split"
  | "text_ok"
  | "classified"
  | "structured"
  | "merged"
  | "error";

export type Segment = {
  id: string;
  jobId: string;
  fileId: string;
  customerId: TenantId;
  pageNumber: number;
  text: string;
  textSource: "text" | "vision";
  type: SegmentKind | null;
  classification: SegmentClassification | null;
  classificationRaw: string | null;
  extractedData: unknown | null;
  extractedRaw: string | null;
  extractedParseError: string | null;
  status: SegmentStatus;
  financialDocumentId: string | null;
};

export type FinancialDocType = "invoice" | "statement";

export type FinancialDocumentStatus = "pending" | "success" | "error";

export type DocumentValidation = {
  errors: string[];
  warnings: string[];
  codes?: string[];
};

export type InvoiceLine = {
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  discount: number | null;
  taxAmount: number | null;
};

export type Invoice = {
  vendor: string | null;
  customer: string | null;
  storeName: string | null;
  customerAddress: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  notes: string | null;
  lineItemsDescription: string | null;
  lineItems: InvoiceLine[];
  status: FinancialDocumentStatus;
  validation: DocumentValidation;
};

export type StatementLine = {
  date: string | null;
  description: string | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
};

export type Statement = {
  accountHolder: string | null;
  bankName: string | null;
  accountNumber: string | null;
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
  currency: string | null;
  openingBalance: number | null;
  closingBalance: number | null;
  notes: string | null;
  transactions: StatementLine[];
  status: FinancialDocumentStatus;
  validation: DocumentValidation;
};

export type FinancialDocument = {
  id: string;
  type: FinancialDocType;
  metadata: {
    pageRange: { start: number; end: number };
    jobId: string;
    fileId: string;
    customerId: TenantId;
  };
  status: FinancialDocumentStatus;
  invoice: Invoice | null;
  statement: Statement | null;
};

export type PageTrace = {
  page: number;
  source: "text" | "vision";
  preview: string;
};

/** One line in `job.result.diagnosticLog` for tracing extraction + API usage. */
export type JobDiagnosticEntry = {
  at: string;
  phase: string;
  message: string;
  meta?: Record<string, unknown>;
};

/** Where the pipeline last persisted; used to resume after failure without redoing work. */
export type PipelineCheckpoint =
  | "text_layer_done"
  | "text_in_progress"
  | "text_extracted"
  | "llm_in_progress"
  | "structured"
  | "merged"
  | "complete";

/** Root shape stored on `Job.result` for multi-page financial extraction. */
export type FinancialJobResult = {
  customerId: TenantId;
  pipelineVersion: 1;
  /** Set after each persisted stage so workers can resume. */
  pipelineCheckpoint?: PipelineCheckpoint;
  /** Next PDF page index (0-based) for vision OCR when `pipelineCheckpoint === "text_in_progress"`. */
  textNextPageIndex?: number;
  /** Next segment index to process when `pipelineCheckpoint === "llm_in_progress"`. */
  llmNextSegmentIndex?: number;
  segments: Segment[];
  financialDocuments: FinancialDocument[];
  /** Immutable copy of automated pipeline output for reset/compare. */
  automatedSnapshot: {
    segments: Segment[];
    financialDocuments: FinancialDocument[];
  } | null;
  /** Set when user applies HITL edits via API. */
  manualOverride: { appliedAt: string; note?: string } | null;
  combinedText: string;
  pages: PageTrace[];
  /** Legacy single-object view: first invoice/statement payload for simple UIs. */
  structured: unknown | null;
  structuredRaw: string;
  structuredParseError: string | null;
  warnings: string[];
  /** Append-only trace: provider, models, checkpoints, LLM calls (also logged server-side). */
  diagnosticLog?: JobDiagnosticEntry[];
};

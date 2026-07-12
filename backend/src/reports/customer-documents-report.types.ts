export type CustomerDocumentsLayoutMode =
  | "per_document"
  | "per_folder"
  | "per_date"
  | "invoice_register"
  | "statement_register";
export type CustomerDocumentsDateBasis = "effective" | "uploaded";

export type DocumentReportInvoiceLine = {
  lineIndex: number;
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  discount: number | null;
  taxAmount: number | null;
};

export type DocumentReportStatementLine = {
  lineIndex: number;
  date: string | null;
  description: string | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
};

export type DocumentReportExtraction =
  | {
      kind: "invoice";
      vendor: string | null;
      storeName: string | null;
      customerAddress: string | null;
      invoiceNumber: string | null;
      invoiceDate: string | null;
      dueDate: string | null;
      subtotal: number | null;
      tax: number | null;
      total: number | null;
      currency: string | null;
      status: string;
      pageStart: number;
      pageEnd: number;
      lineItemsDescription: string | null;
      lines: DocumentReportInvoiceLine[];
    }
  | {
      kind: "statement";
      accountHolder: string | null;
      bankName: string | null;
      periodStart: string | null;
      periodEnd: string | null;
      openingBalance: number | null;
      closingBalance: number | null;
      currency: string | null;
      status: string;
      pageStart: number;
      pageEnd: number;
      lines: DocumentReportStatementLine[];
    }
  | { kind: "none" };

export type DocumentReportPreview =
  | {
      kind: "image";
      extension: "png" | "jpeg" | "gif";
      buffer: Buffer;
    }
  | {
      kind: "unavailable";
      note: string;
    };

export type DocumentReportJobFinancialDoc = {
  id: string;
  type: "invoice" | "statement";
  status: string;
  pageStart: number;
  pageEnd: number;
  extraction: Extract<DocumentReportExtraction, { kind: "invoice" } | { kind: "statement" }>;
};

export type DocumentReportJobResult =
  | {
      kind: "job";
      jobId: string;
      status: string;
      percentCompleted: number;
      error: string | null;
      createdAt: string;
      updatedAt: string;
      aiProvider: string | null;
      visionModel: string | null;
      structureModel: string | null;
      manualOverride: { appliedAt: string; note?: string } | null;
      warnings: string[];
      financialDocuments: DocumentReportJobFinancialDoc[];
    }
  | { kind: "none" };

export type DocumentReportRow = {
  id: string;
  customerId: string;
  customerName: string;
  name: string;
  documentType: string;
  folderId: string | null;
  /** `global` = platform folder; `customer` = customer-owned folder; `unfiled` = no folder. */
  folderScope: "global" | "customer" | "unfiled";
  /** Full folder path for display (e.g. `Global/Acme/files` or `invoices/2026/VLC`). */
  folderPath: string;
  /** Leaf folder name used as Excel sheet title in per-folder layout (e.g. `VLC`). */
  folderSheetName: string;
  /** Calendar date `YYYY-MM-DD` (Europe/London) for per-date sheet grouping. */
  sheetDateKey: string;
  supplierName: string | null;
  documentDate: string | null;
  uploadedAt: string;
  sizeBytes: string | null;
  mimeType: string | null;
  fileUrl: string | null;
  s3Key: string | null;
  /** Presigned S3 GET URL when `s3Key` is set (valid ~24h). */
  downloadUrl: string | null;
  /** Persisted extraction rows (invoices / statements). */
  extraction: DocumentReportExtraction;
  /** Latest extraction job result for this document (pipeline JSON). */
  job: DocumentReportJobResult;
  /** Embedded document image (photo, PDF page 1, etc.) when available. */
  preview: DocumentReportPreview;
};

export type CustomerDocumentsReportModel = {
  customerId: string | null;
  customerName: string;
  /** True when the export spans all active customers (no single customer filter). */
  allCustomers: boolean;
  customerCount: number;
  from: string;
  to: string;
  layoutMode: CustomerDocumentsLayoutMode;
  dateBasis: CustomerDocumentsDateBasis;
  generatedAt: string;
  documents: DocumentReportRow[];
};

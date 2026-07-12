/** Matches backend `DEFAULT_VISION_PROMPT` in extractPipeline.ts */
const DEFAULT_VISION =
  "Extract all visible text in reading order. Output plain text only, no commentary.";

/** Invoice / vendor bill — aligned with backend `DEFAULT_STRUCTURE_PROMPT`. */
const STRUCTURE_INVOICE = `You are helping an accounting firm. From the document text below, extract a single JSON object with these keys (use null when unknown):
documentType (e.g. "invoice", "receipt", "statement", "other"),
vendor, customer,
invoiceNumber, invoiceDate, dueDate,
currency,
lineItems: array of { description, quantity, unitPrice, amount },
subtotal, tax, total,
notes (string).

Rules: Output ONLY valid JSON, no markdown fences. Do not invent amounts; if unsure use null.

Your entire reply must be one JSON object and nothing else: no greeting, no "Certainly", no explanation, no markdown headings. Start your response with { and end with }.`;

const STRUCTURE_BANK_STATEMENT = `You are helping an accounting firm. From the document text below, extract a single JSON object with these keys (use null when unknown):
documentType (e.g. "bank_statement", "other"),
accountHolder, bankName, accountNumber (mask or partial if shown),
statementPeriodStart, statementPeriodEnd,
currency,
openingBalance, closingBalance,
transactions: array of { date, description, debit, credit, balance },
notes (string).

Rules: Output ONLY valid JSON, no markdown fences. Do not invent amounts; if unsure use null.

Your entire reply must be one JSON object and nothing else: no greeting, no "Certainly", no explanation, no markdown headings. Start your response with { and end with }.`;

export type ExtractDocumentKind = "invoice" | "bank_statement";

export const EXTRACT_DOCUMENT_OPTIONS: { value: ExtractDocumentKind; label: string }[] = [
  { value: "invoice", label: "Invoice / vendor bill" },
  { value: "bank_statement", label: "Bank statement" },
];

export function visionPromptFor(_kind: ExtractDocumentKind): string {
  return DEFAULT_VISION;
}

export function structurePromptFor(kind: ExtractDocumentKind): string {
  return kind === "bank_statement" ? STRUCTURE_BANK_STATEMENT : STRUCTURE_INVOICE;
}

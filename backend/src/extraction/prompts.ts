/** Stage 3 — classification (one JSON object). */
export const DEFAULT_CLASSIFICATION_PROMPT = `You classify ONE page of a financial document. Given the page text, reply with a single JSON object only:
{
  "segmentKind": "invoice" | "statement" | "other",
  "boundary": "new" | "continuation"
}
Rules:
- "invoice" if this page is mainly an invoice, bill, or tax invoice.
- "statement" if bank/credit card/account statement.
- "other" for cover letters, blanks, or unrelated.
- "new" if this page likely starts a new logical document (new invoice/statement with its own header, invoice number, or account details).
- "continuation" if this page continues the previous page of the same document — e.g. extra line items, VAT/tax summary, totals-only page, or any page with no invoice number / vendor / date that only adds amounts from the same invoice.
- When a page has no invoice number and no vendor header, prefer "continuation" over "new" unless it clearly starts a different document.
Output ONLY valid JSON, no markdown.`;

/** Stage 4 — partial structured extraction for one page (invoice-oriented). */
export function defaultPerPageInvoicePrompt(): string {
  return `Extract data visible on THIS PAGE ONLY into one JSON object (use null when unknown):
{
  "documentType": "invoice" | "receipt" | "statement" | "other",
  "vendor": string | null,
  "customer": string | null,
  "customerAddress": string | null,
  "invoiceNumber": string | null,
  "invoiceDate": string | null,
  "dueDate": string | null,
  "currency": string | null,
  "lineItems": array of { "description": string | null, "quantity": number | null, "unitPrice": number | null, "amount": number | null },
  "lineItemsDescription": string | null,
  "subtotal": number | null,
  "tax": number | null,
  "total": number | null,
  "notes": string | null
}
Rules: Output ONLY valid JSON. Do not invent amounts. Line items are only those shown on this page.
- Dates on UK invoices use **DD/MM/YYYY** on paper. Always output dates as **YYYY-MM-DD** (ISO). Example: invoice shows 04/03/2025 → "2025-03-04" (4 March 2025, not 3 April).
- customer ("Bill to"): the store, branch, or site on the document — e.g. Post Office branch name and location ("Springvale, Springvale Estate, Kingsworthy, Winchester…"). On standard invoices use the "Bill to" / "Sold to" party name (not their street address — that goes in customerAddress). Do NOT use payment labels like "FROM CUSTOMER" or "PAID CASH".
- customerAddress: the buyer's / recipient's postal address when printed as a separate block. Look for multi-line text under labels such as "Bill to", "Invoice to", "Sold to", "Deliver to", "Ship to", "Customer address", or the account holder mailing address on utility invoices. Join lines with ", " into one string. Examples: "12 High Street, London, SW1A 1AA" or "Acme Ltd, Unit 4, Industrial Estate, Manchester M1 2AB".
  Do NOT put the supplier/vendor letterhead address here.
  Do NOT put the store/branch location here (that belongs in customer / Bill to).
  Null only when the document has no buyer/recipient address block (common on anonymous till receipts).
If this page lists products or services, set lineItemsDescription to a short descriptive paragraph (3–5 sentences) summarizing what was purchased or charged on this page — mention key items, quantities or amounts where helpful, and the overall nature of the spend (null if no line items on this page).`;
}

/** Post-merge: summarize all line items for one invoice document. */
export function invoiceLineItemsDescriptionPrompt(inv: {
  vendor: string | null;
  invoiceNumber: string | null;
  customer: string | null;
  lineItems: Array<{
    description: string | null;
    quantity: number | null;
    unitPrice: number | null;
    amount: number | null;
  }>;
}, opts?: { omittedLineCount?: number }): { prefix: string; lineItemsJson: string } {
  const linesJson = JSON.stringify(
    inv.lineItems.map((li, i) => ({
      line: i + 1,
      description: li.description,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      amount: li.amount,
    })),
    null,
    2
  );
  const omittedNote =
    opts?.omittedLineCount && opts.omittedLineCount > 0
      ? `\nNote: ${opts.omittedLineCount} additional line items are omitted; summarize from those listed below.`
      : "";
  const prefix = `Write a clear, descriptive plain-English summary of these invoice line items (3–5 sentences, up to 1200 characters).
Cover: what was purchased or charged overall; group related items when sensible; mention notable quantities, unit prices, or line amounts where they add context; and the general category of expense (e.g. groceries, professional services, utilities).
Do not dump every line verbatim — synthesize into readable prose.
Reply with a single JSON object only:
{"lineItemsDescription": string | null}
${omittedNote}

Vendor: ${inv.vendor ?? "unknown"}
Invoice #: ${inv.invoiceNumber ?? "unknown"}
Bill to: ${inv.customer ?? "unknown"}
Line items:
`;
  return { prefix, lineItemsJson: linesJson };
}

export function defaultPerPageStatementPrompt(): string {
  return `Extract data visible on THIS PAGE ONLY into one JSON object (use null when unknown):
{
  "documentType": "bank_statement" | "other",
  "accountHolder": string | null,
  "bankName": string | null,
  "accountNumber": string | null,
  "statementPeriodStart": string | null,
  "statementPeriodEnd": string | null,
  "currency": string | null,
  "openingBalance": number | null,
  "closingBalance": number | null,
  "transactions": array of { "date": string | null, "description": string | null, "debit": number | null, "credit": number | null, "balance": number | null },
  "notes": string | null
}
Rules: Output ONLY valid JSON. Transactions are only those on this page.
- UK bank statements use **DD/MM/YYYY** for transaction and period dates. Output all dates as **YYYY-MM-DD**. Example: 15/01/2025 → "2025-01-15".`;
}

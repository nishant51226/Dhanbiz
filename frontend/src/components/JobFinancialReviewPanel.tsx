import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FinancialDocumentRow } from "../types/api";

function formatMoney(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  const cur = currency?.trim() || "";
  return cur ? `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${cur}` : String(amount);
}

function parseOptionalNumber(raw: string): number | null {
  const t = raw.trim().replace(/,/g, "");
  if (t === "") return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/** Label for switching between extracted financial documents. */
function financialDocLabel(d: FinancialDocumentRow, index: number): string {
  const start = d.metadata?.pageRange?.start;
  const end = d.metadata?.pageRange?.end;
  const pagePart =
    typeof start === "number" && typeof end === "number" && end !== start
      ? `pages ${start}–${end}`
      : typeof start === "number"
        ? `page ${start}`
        : "";

  if (d.type === "invoice" && d.invoice && typeof d.invoice === "object") {
    const inv = d.invoice as Record<string, unknown>;
    const num = typeof inv.invoiceNumber === "string" ? inv.invoiceNumber.trim() : "";
    const vendor = typeof inv.vendor === "string" ? inv.vendor.trim() : "";
    const title = num ? `Invoice ${num}` : vendor ? vendor : `Invoice ${index + 1}`;
    return pagePart ? `${title} (${pagePart})` : title;
  }

  if (d.type === "statement" && d.statement && typeof d.statement === "object") {
    const st = d.statement as Record<string, unknown>;
    const bank = typeof st.bankName === "string" ? st.bankName.trim() : "";
    const title = bank ? `Statement — ${bank}` : `Statement ${index + 1}`;
    return pagePart ? `${title} (${pagePart})` : title;
  }

  const kind = d.type === "statement" ? "Statement" : "Invoice";
  return pagePart ? `${kind} ${index + 1} (${pagePart})` : `${kind} ${index + 1}`;
}

type InvoiceLineDraft = {
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  discount: string;
  taxAmount: string;
};

type StatementLineDraft = {
  date: string;
  description: string;
  debit: string;
  credit: string;
  balance: string;
};

type InvoiceDraft = {
  vendor: string;
  customer: string;
  customerAddress: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  notes: string;
  lineItemsDescription: string;
  tax: string;
  lines: InvoiceLineDraft[];
};

type StatementDraft = {
  accountHolder: string;
  bankName: string;
  accountNumber: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  notes: string;
  openingBalance: string;
  closingBalance: string;
  lines: StatementLineDraft[];
};

function invoiceFromUnknown(inv: unknown): InvoiceDraft {
  const o = inv && typeof inv === "object" ? (inv as Record<string, unknown>) : {};
  const lineItems = Array.isArray(o.lineItems) ? o.lineItems : [];
  const lines: InvoiceLineDraft[] = lineItems.map((row) => {
    const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const num = (x: unknown) => (x == null || x === "" ? "" : String(x));
    return {
      description: typeof r.description === "string" ? r.description : "",
      quantity: num(r.quantity),
      unitPrice: num(r.unitPrice),
      amount: num(r.amount),
      discount: num(r.discount),
      taxAmount: num(r.taxAmount),
    };
  });
  if (lines.length === 0) {
    lines.push({ description: "", quantity: "", unitPrice: "", amount: "", discount: "", taxAmount: "" });
  }
  const str = (x: unknown) => (typeof x === "string" ? x : x == null ? "" : String(x));
  const billTo = str(o.customer) || str(o.storeName);
  let lineItemsDescription = str(o.lineItemsDescription);
  if (!lineItemsDescription.trim()) {
    const labels = lines.map((l) => l.description.trim()).filter(Boolean);
    if (labels.length > 0) {
      const unique = [...new Set(labels)];
      lineItemsDescription =
        unique.length <= 6
          ? unique.join("; ")
          : `${unique.slice(0, 6).join("; ")}; and ${unique.length - 6} other line items`;
    }
  }
  return {
    vendor: str(o.vendor),
    customer: billTo,
    customerAddress: str(o.customerAddress),
    invoiceNumber: str(o.invoiceNumber),
    invoiceDate: str(o.invoiceDate),
    dueDate: str(o.dueDate),
    currency: str(o.currency),
    notes: str(o.notes),
    lineItemsDescription,
    tax: str(o.tax),
    lines,
  };
}

function statementFromUnknown(st: unknown): StatementDraft {
  const o = st && typeof st === "object" ? (st as Record<string, unknown>) : {};
  const txs = Array.isArray(o.transactions) ? o.transactions : [];
  const lines: StatementLineDraft[] = txs.map((row) => {
    const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const num = (x: unknown) => (x == null || x === "" ? "" : String(x));
    return {
      date: typeof r.date === "string" ? r.date : "",
      description: typeof r.description === "string" ? r.description : "",
      debit: num(r.debit),
      credit: num(r.credit),
      balance: num(r.balance),
    };
  });
  if (lines.length === 0) {
    lines.push({ date: "", description: "", debit: "", credit: "", balance: "" });
  }
  const str = (x: unknown) => (typeof x === "string" ? x : x == null ? "" : String(x));
  return {
    accountHolder: str(o.accountHolder),
    bankName: str(o.bankName),
    accountNumber: str(o.accountNumber),
    periodStart: str(o.statementPeriodStart ?? o.periodStart),
    periodEnd: str(o.statementPeriodEnd ?? o.periodEnd),
    currency: str(o.currency),
    notes: str(o.notes),
    openingBalance: str(o.openingBalance),
    closingBalance: str(o.closingBalance),
    lines,
  };
}

function draftToInvoicePayload(d: InvoiceDraft): Record<string, unknown> {
  const lineItems = d.lines.map((l) => ({
    description: l.description.trim() || null,
    quantity: parseOptionalNumber(l.quantity),
    unitPrice: parseOptionalNumber(l.unitPrice),
    amount: parseOptionalNumber(l.amount),
    discount: parseOptionalNumber(l.discount),
    taxAmount: parseOptionalNumber(l.taxAmount),
  }));
  const subtotal = lineItems.reduce((s, li) => s + (typeof li.amount === "number" ? li.amount : 0), 0);
  const tax = parseOptionalNumber(d.tax);
  const total = subtotal + (tax ?? 0);
  const billTo = d.customer.trim() || null;
  return {
    vendor: d.vendor.trim() || null,
    customer: billTo,
    storeName: billTo,
    customerAddress: d.customerAddress.trim() || null,
    invoiceNumber: d.invoiceNumber.trim() || null,
    invoiceDate: d.invoiceDate.trim() || null,
    dueDate: d.dueDate.trim() || null,
    currency: d.currency.trim() || null,
    notes: d.notes.trim() || null,
    lineItemsDescription: d.lineItemsDescription.trim() || null,
    subtotal,
    tax,
    total,
    lineItems,
    status: "success",
    validation: { errors: [], warnings: [] },
  };
}

function draftToStatementPayload(d: StatementDraft): Record<string, unknown> {
  const transactions = d.lines.map((l) => ({
    date: l.date.trim() || null,
    description: l.description.trim() || null,
    debit: parseOptionalNumber(l.debit),
    credit: parseOptionalNumber(l.credit),
    balance: parseOptionalNumber(l.balance),
  }));
  return {
    accountHolder: d.accountHolder.trim() || null,
    bankName: d.bankName.trim() || null,
    accountNumber: d.accountNumber.trim() || null,
    statementPeriodStart: d.periodStart.trim() || null,
    statementPeriodEnd: d.periodEnd.trim() || null,
    currency: d.currency.trim() || null,
    notes: d.notes.trim() || null,
    openingBalance: parseOptionalNumber(d.openingBalance),
    closingBalance: parseOptionalNumber(d.closingBalance),
    transactions,
    status: "success",
    validation: { errors: [], warnings: [] },
  };
}

function rebuildFinancialDocuments(
  originals: FinancialDocumentRow[],
  drafts: { type: "invoice" | "statement"; invoice: InvoiceDraft | null; statement: StatementDraft | null }[]
): FinancialDocumentRow[] {
  return originals.map((orig, i) => {
    const d = drafts[i];
    if (!d) return orig;
    if (d.type === "invoice" && d.invoice) {
      return {
        ...orig,
        invoice: draftToInvoicePayload(d.invoice),
        statement: null,
      };
    }
    if (d.type === "statement" && d.statement) {
      return {
        ...orig,
        statement: draftToStatementPayload(d.statement),
        invoice: null,
      };
    }
    return orig;
  });
}

function inputCls(disabled: boolean) {
  return `w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm text-ink tabular-nums ${
    disabled ? "opacity-60" : ""
  }`;
}

type Props = {
  financialDocuments: FinancialDocumentRow[];
  disabled?: boolean;
  onSelectionPageRange: (range: { start: number; end: number } | null) => void;
  onDocumentsChange: (next: FinancialDocumentRow[]) => void;
};

export function JobFinancialReviewPanel({
  financialDocuments,
  disabled,
  onSelectionPageRange,
  onDocumentsChange,
}: Props) {
  const originalsRef = useRef(financialDocuments);
  originalsRef.current = financialDocuments;

  const [docIndex, setDocIndex] = useState(0);
  const serializedIn = useMemo(() => JSON.stringify(financialDocuments), [financialDocuments]);
  const [drafts, setDrafts] = useState<
    { type: "invoice" | "statement"; invoice: InvoiceDraft | null; statement: StatementDraft | null }[]
  >(() =>
    financialDocuments.map((fd) =>
      fd.type === "invoice"
        ? { type: "invoice" as const, invoice: invoiceFromUnknown(fd.invoice), statement: null }
        : { type: "statement" as const, invoice: null, statement: statementFromUnknown(fd.statement) }
    )
  );

  useEffect(() => {
    const next = financialDocuments.map((fd) =>
      fd.type === "invoice"
        ? { type: "invoice" as const, invoice: invoiceFromUnknown(fd.invoice), statement: null }
        : { type: "statement" as const, invoice: null, statement: statementFromUnknown(fd.statement) }
    );
    setDrafts(next);
    setDocIndex((prev) => (prev < next.length ? prev : 0));
  }, [serializedIn]);

  const fd = financialDocuments[docIndex];
  const draft = drafts[docIndex];

  useEffect(() => {
    if (!fd?.metadata?.pageRange) {
      onSelectionPageRange(null);
      return;
    }
    const { start, end } = fd.metadata.pageRange;
    if (typeof start === "number" && typeof end === "number" && start > 0 && end >= start) {
      onSelectionPageRange({ start, end });
    } else {
      onSelectionPageRange(null);
    }
  }, [docIndex, fd, onSelectionPageRange]);

  const pushDocs = useCallback(
    (nextDrafts: { type: "invoice" | "statement"; invoice: InvoiceDraft | null; statement: StatementDraft | null }[]) => {
      setDrafts(nextDrafts);
      const built = rebuildFinancialDocuments(originalsRef.current, nextDrafts);
      onDocumentsChange(built);
    },
    [onDocumentsChange]
  );

  const invoiceComputed = useMemo(() => {
    if (!draft?.invoice) return { subtotal: null as number | null, total: null as number | null };
    const inv = draft.invoice;
    let sub = 0;
    for (const l of inv.lines) {
      const amt = parseOptionalNumber(l.amount);
      if (amt != null) sub += amt;
      else {
        const q = parseOptionalNumber(l.quantity);
        const up = parseOptionalNumber(l.unitPrice);
        if (q != null && up != null) sub += q * up;
      }
    }
    const tax = parseOptionalNumber(inv.tax);
    const total = sub + (tax ?? 0);
    return { subtotal: sub, total };
  }, [draft]);

  const statementComputed = useMemo(() => {
    if (!draft?.statement) return { running: [] as number[], impliedClosing: null as number | null };
    const st = draft.statement;
    const opening = parseOptionalNumber(st.openingBalance) ?? 0;
    const running: number[] = [];
    let run = opening;
    for (const l of st.lines) {
      const debit = parseOptionalNumber(l.debit) ?? 0;
      const credit = parseOptionalNumber(l.credit) ?? 0;
      run = run + credit - debit;
      running.push(run);
    }
    return { running, impliedClosing: running.length ? running[running.length - 1]! : opening };
  }, [draft]);

  if (!financialDocuments.length) {
    return <p className="text-sm text-muted">No financial documents in this extraction.</p>;
  }

  if (!fd || !draft) {
    return <p className="text-sm text-muted">No financial documents in this extraction.</p>;
  }

  return (
    <div className="space-y-4">
      {financialDocuments.length > 1 ? (
        <label className="flex max-w-md flex-col gap-1">
          <span className="text-xs font-medium text-muted">
            Extracted document ({financialDocuments.length})
          </span>
          <select
            className="rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-sm text-ink"
            value={docIndex}
            onChange={(e) => setDocIndex(Number(e.target.value))}
          >
            {financialDocuments.map((d, i) => (
              <option key={d.id ?? i} value={i}>
                {financialDocLabel(d, i)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {draft.type === "invoice" && draft.invoice ? (
        <InvoiceFormBody
          inv={draft.invoice}
          collapseKey={docIndex}
          disabled={!!disabled}
          onChange={(nextInv) => {
            const copy = [...drafts];
            copy[docIndex] = { type: "invoice", invoice: nextInv, statement: null };
            pushDocs(copy);
          }}
          computedSubtotal={invoiceComputed.subtotal}
          computedTotal={invoiceComputed.total}
        />
      ) : null}

      {draft.type === "statement" && draft.statement ? (
        <StatementFormBody
          st={draft.statement}
          disabled={!!disabled}
          onChange={(nextSt) => {
            const copy = [...drafts];
            copy[docIndex] = { type: "statement", invoice: null, statement: nextSt };
            pushDocs(copy);
          }}
          runningBalances={statementComputed.running}
          impliedClosing={statementComputed.impliedClosing}
        />
      ) : null}
    </div>
  );
}

function InvoiceFormBody({
  inv,
  collapseKey,
  disabled,
  onChange,
  computedSubtotal,
  computedTotal,
}: {
  inv: InvoiceDraft;
  collapseKey: string | number;
  disabled: boolean;
  onChange: (v: InvoiceDraft) => void;
  computedSubtotal: number | null;
  computedTotal: number | null;
}) {
  const [linesExpanded, setLinesExpanded] = useState(false);

  useEffect(() => {
    setLinesExpanded(false);
  }, [collapseKey]);

  const setField = (patch: Partial<InvoiceDraft>) => onChange({ ...inv, ...patch });
  const setLine = (idx: number, patch: Partial<InvoiceLineDraft>) => {
    const lines = inv.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    const row = { ...lines[idx]!, ...patch };
    if ("quantity" in patch || "unitPrice" in patch) {
      const q = parseOptionalNumber(row.quantity);
      const up = parseOptionalNumber(row.unitPrice);
      if (q != null && up != null) {
        row.amount = (q * up).toFixed(2);
      }
    }
    lines[idx] = row;
    onChange({ ...inv, lines });
  };
  const addLine = () => onChange({ ...inv, lines: [...inv.lines, emptyInvoiceLine()] });
  const removeLine = (idx: number) => {
    if (inv.lines.length <= 1) return;
    onChange({ ...inv, lines: inv.lines.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2 block text-xs">
          <span className="font-medium text-muted">Vendor</span>
          <input
            className={`${inputCls(disabled)} mt-1`}
            value={inv.vendor}
            disabled={disabled}
            onChange={(e) => setField({ vendor: e.target.value })}
          />
        </label>
        <label className="block text-xs">
          <span className="font-medium text-muted">Invoice #</span>
          <input
            className={`${inputCls(disabled)} mt-1`}
            value={inv.invoiceNumber}
            disabled={disabled}
            onChange={(e) => setField({ invoiceNumber: e.target.value })}
          />
        </label>
        <label className="sm:col-span-2 block text-xs">
          <span className="font-medium text-muted">Bill to / store branch</span>
          <input
            className={`${inputCls(disabled)} mt-1`}
            value={inv.customer}
            disabled={disabled}
            onChange={(e) => setField({ customer: e.target.value })}
            placeholder="Store, branch, or Bill to party (e.g. Post Office branch location)"
          />
        </label>
        <label className="sm:col-span-2 block text-xs">
          <span className="font-medium text-muted">Customer address</span>
          <textarea
            className={`${inputCls(disabled)} mt-1 min-h-[64px] resize-y`}
            value={inv.customerAddress}
            disabled={disabled}
            onChange={(e) => setField({ customerAddress: e.target.value })}
            rows={2}
            placeholder="Buyer's billing or delivery address (if shown on invoice)"
          />
        </label>
        <label className="block text-xs">
          <span className="font-medium text-muted">Invoice date</span>
          <input
            className={`${inputCls(disabled)} mt-1`}
            value={inv.invoiceDate}
            disabled={disabled}
            onChange={(e) => setField({ invoiceDate: e.target.value })}
          />
        </label>
        <label className="block text-xs">
          <span className="font-medium text-muted">Due date</span>
          <input
            className={`${inputCls(disabled)} mt-1`}
            value={inv.dueDate}
            disabled={disabled}
            onChange={(e) => setField({ dueDate: e.target.value })}
          />
        </label>
        <label className="block text-xs">
          <span className="font-medium text-muted">Currency</span>
          <input
            className={`${inputCls(disabled)} mt-1`}
            value={inv.currency}
            disabled={disabled}
            onChange={(e) => setField({ currency: e.target.value })}
          />
        </label>
      </div>

      <label className="block text-xs">
        <span className="font-medium text-muted">Line items description</span>
        <textarea
          className={`${inputCls(disabled)} mt-1 min-h-[88px] resize-y`}
          value={inv.lineItemsDescription}
          disabled={disabled}
          onChange={(e) => setField({ lineItemsDescription: e.target.value })}
          rows={4}
          maxLength={1200}
          placeholder="Descriptive summary of what these line items cover (a short paragraph)"
        />
      </label>

      <div className="rounded-lg border border-border">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-surface-muted/60"
          onClick={() => setLinesExpanded((open) => !open)}
          aria-expanded={linesExpanded}
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Line items ({inv.lines.length})
          </span>
          <span className="text-xs text-muted" aria-hidden>
            {linesExpanded ? "▲" : "▼"}
          </span>
        </button>

        {linesExpanded ? (
          <div className="border-t border-border px-3 pb-3">
            <div className="mb-2 flex justify-end pt-2">
              <button
                type="button"
                disabled={disabled}
                onClick={addLine}
                className="text-xs font-semibold text-brand hover:underline disabled:opacity-50"
              >
                + Add line
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                <thead className="border-b border-border bg-surface-muted">
                  <tr>
                    <th className="px-2 py-2 text-xs font-semibold text-muted">#</th>
                    <th className="px-2 py-2 text-xs font-semibold text-muted">Description</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Qty</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Unit</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Amount</th>
                    <th className="w-8 px-1" />
                  </tr>
                </thead>
                <tbody>
                  {inv.lines.map((line, idx) => (
                    <tr key={idx} className="border-b border-border-subtle last:border-0">
                      <td className="px-2 py-1.5 text-xs text-muted">{idx + 1}</td>
                      <td className="px-2 py-1.5">
                        <input
                          className={`${inputCls(disabled)} !text-xs`}
                          value={line.description}
                          disabled={disabled}
                          onChange={(e) => setLine(idx, { description: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          className={`${inputCls(disabled)} !text-xs`}
                          value={line.quantity}
                          disabled={disabled}
                          inputMode="decimal"
                          onChange={(e) => setLine(idx, { quantity: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          className={`${inputCls(disabled)} !text-xs`}
                          value={line.unitPrice}
                          disabled={disabled}
                          inputMode="decimal"
                          onChange={(e) => setLine(idx, { unitPrice: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          className={`${inputCls(disabled)} !text-xs`}
                          value={line.amount}
                          disabled={disabled}
                          inputMode="decimal"
                          onChange={(e) => setLine(idx, { amount: e.target.value })}
                        />
                      </td>
                      <td className="px-1">
                        <button
                          type="button"
                          disabled={disabled || inv.lines.length <= 1}
                          onClick={() => removeLine(idx)}
                          className="text-xs text-red-400 hover:underline disabled:opacity-30"
                          title="Remove line"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 border-t border-border-subtle pt-4 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="font-medium text-muted">Tax (add to subtotal)</span>
          <input
            className={`${inputCls(disabled)} mt-1`}
            value={inv.tax}
            disabled={disabled}
            inputMode="decimal"
            onChange={(e) => setField({ tax: e.target.value })}
          />
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="font-medium text-muted">Notes</span>
          <textarea
            className={`${inputCls(disabled)} mt-1 min-h-[72px]`}
            value={inv.notes}
            disabled={disabled}
            onChange={(e) => setField({ notes: e.target.value })}
            rows={3}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-brand/20 bg-brand/5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-muted">Calculated subtotal</span>
          <p className="text-lg font-semibold tabular-nums text-ink">
            {formatMoney(computedSubtotal, inv.currency)}
          </p>
        </div>
        <div className="text-right">
          <span className="text-muted">Calculated total (subtotal + tax)</span>
          <p className="text-lg font-semibold tabular-nums text-brand">
            {formatMoney(computedTotal, inv.currency)}
          </p>
        </div>
      </div>
    </div>
  );
}

function emptyInvoiceLine(): InvoiceLineDraft {
  return { description: "", quantity: "", unitPrice: "", amount: "", discount: "", taxAmount: "" };
}

function StatementFormBody({
  st,
  disabled,
  onChange,
  runningBalances,
  impliedClosing,
}: {
  st: StatementDraft;
  disabled: boolean;
  onChange: (v: StatementDraft) => void;
  runningBalances: number[];
  impliedClosing: number | null;
}) {
  const setField = (patch: Partial<StatementDraft>) => onChange({ ...st, ...patch });
  const setLine = (idx: number, patch: Partial<StatementLineDraft>) => {
    const lines = st.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    onChange({ ...st, lines });
  };
  const addLine = () => onChange({ ...st, lines: [...st.lines, emptyStatementLine()] });
  const removeLine = (idx: number) => {
    if (st.lines.length <= 1) return;
    onChange({ ...st, lines: st.lines.filter((_, i) => i !== idx) });
  };

  const extractedClosing = parseOptionalNumber(st.closingBalance);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2 block text-xs">
          <span className="font-medium text-muted">Account holder</span>
          <input
            className={`${inputCls(disabled)} mt-1`}
            value={st.accountHolder}
            disabled={disabled}
            onChange={(e) => setField({ accountHolder: e.target.value })}
          />
        </label>
        <label className="block text-xs">
          <span className="font-medium text-muted">Bank</span>
          <input
            className={`${inputCls(disabled)} mt-1`}
            value={st.bankName}
            disabled={disabled}
            onChange={(e) => setField({ bankName: e.target.value })}
          />
        </label>
        <label className="block text-xs">
          <span className="font-medium text-muted">Account #</span>
          <input
            className={`${inputCls(disabled)} mt-1`}
            value={st.accountNumber}
            disabled={disabled}
            onChange={(e) => setField({ accountNumber: e.target.value })}
          />
        </label>
        <label className="block text-xs">
          <span className="font-medium text-muted">Period start</span>
          <input
            className={`${inputCls(disabled)} mt-1`}
            value={st.periodStart}
            disabled={disabled}
            onChange={(e) => setField({ periodStart: e.target.value })}
          />
        </label>
        <label className="block text-xs">
          <span className="font-medium text-muted">Period end</span>
          <input
            className={`${inputCls(disabled)} mt-1`}
            value={st.periodEnd}
            disabled={disabled}
            onChange={(e) => setField({ periodEnd: e.target.value })}
          />
        </label>
        <label className="block text-xs">
          <span className="font-medium text-muted">Currency</span>
          <input
            className={`${inputCls(disabled)} mt-1`}
            value={st.currency}
            disabled={disabled}
            onChange={(e) => setField({ currency: e.target.value })}
          />
        </label>
        <label className="block text-xs">
          <span className="font-medium text-muted">Opening balance</span>
          <input
            className={`${inputCls(disabled)} mt-1`}
            value={st.openingBalance}
            disabled={disabled}
            inputMode="decimal"
            onChange={(e) => setField({ openingBalance: e.target.value })}
          />
        </label>
        <label className="block text-xs">
          <span className="font-medium text-muted">Closing balance (extracted)</span>
          <input
            className={`${inputCls(disabled)} mt-1`}
            value={st.closingBalance}
            disabled={disabled}
            inputMode="decimal"
            onChange={(e) => setField({ closingBalance: e.target.value })}
          />
        </label>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Transactions</p>
          <button
            type="button"
            disabled={disabled}
            onClick={addLine}
            className="text-xs font-semibold text-brand hover:underline disabled:opacity-50"
          >
            + Add row
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead className="border-b border-border bg-surface-muted">
              <tr>
                <th className="px-2 py-2 text-xs font-semibold text-muted">#</th>
                <th className="px-2 py-2 text-xs font-semibold text-muted">Date</th>
                <th className="px-2 py-2 text-xs font-semibold text-muted">Description</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Debit</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Credit</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Balance</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-muted">Auto</th>
                <th className="w-8 px-1" />
              </tr>
            </thead>
            <tbody>
              {st.lines.map((line, idx) => (
                <tr key={idx} className="border-b border-border-subtle last:border-0">
                  <td className="px-2 py-1.5 text-xs text-muted">{idx + 1}</td>
                  <td className="px-2 py-1.5">
                    <input
                      className={`${inputCls(disabled)} !text-xs`}
                      value={line.date}
                      disabled={disabled}
                      onChange={(e) => setLine(idx, { date: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className={`${inputCls(disabled)} !text-xs`}
                      value={line.description}
                      disabled={disabled}
                      onChange={(e) => setLine(idx, { description: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className={`${inputCls(disabled)} !text-xs`}
                      value={line.debit}
                      disabled={disabled}
                      inputMode="decimal"
                      onChange={(e) => setLine(idx, { debit: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className={`${inputCls(disabled)} !text-xs`}
                      value={line.credit}
                      disabled={disabled}
                      inputMode="decimal"
                      onChange={(e) => setLine(idx, { credit: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className={`${inputCls(disabled)} !text-xs`}
                      value={line.balance}
                      disabled={disabled}
                      inputMode="decimal"
                      onChange={(e) => setLine(idx, { balance: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-muted">
                    {runningBalances[idx] != null && Number.isFinite(runningBalances[idx])
                      ? formatMoney(runningBalances[idx]!, st.currency)
                      : "—"}
                  </td>
                  <td className="px-1">
                    <button
                      type="button"
                      disabled={disabled || st.lines.length <= 1}
                      onClick={() => removeLine(idx)}
                      className="text-xs text-red-400 hover:underline disabled:opacity-30"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <label className="block text-xs">
        <span className="font-medium text-muted">Notes</span>
        <textarea
          className={`${inputCls(disabled)} mt-1 min-h-[64px]`}
          value={st.notes}
          disabled={disabled}
          onChange={(e) => setField({ notes: e.target.value })}
          rows={2}
        />
      </label>

      <div className="rounded-lg border border-brand/20 bg-brand/5 px-4 py-3 text-sm">
        <p className="text-xs text-muted">
          Running balance assumes <strong className="text-ink">opening + credits − debits</strong> per row.
        </p>
        <div className="mt-2 flex flex-wrap gap-6">
          <div>
            <span className="text-muted">Implied closing</span>
            <p className="text-base font-semibold tabular-nums text-brand">
              {formatMoney(impliedClosing, st.currency)}
            </p>
          </div>
          <div>
            <span className="text-muted">Extracted closing</span>
            <p className="text-base font-semibold tabular-nums text-ink">
              {formatMoney(extractedClosing, st.currency)}
            </p>
          </div>
          {extractedClosing != null &&
          impliedClosing != null &&
          Math.abs(extractedClosing - impliedClosing) > 0.005 ? (
            <p className="text-xs text-amber-200">Figures differ — adjust rows or opening balance.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function emptyStatementLine(): StatementLineDraft {
  return { date: "", description: "", debit: "", credit: "", balance: "" };
}

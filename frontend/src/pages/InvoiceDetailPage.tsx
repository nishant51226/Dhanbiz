import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchCustomer,
  fetchCustomerInvoiceDetail,
  fetchDocumentContentBlob,
  fetchFileById,
} from "../api/client";
import { OriginalFilePreview } from "../components/OriginalFilePreview";
import { useAuth } from "../auth/AuthContext";
import type { CustomerInvoiceDetail } from "../types/api";
import { formatDateDisplay } from "../utils/formatDate";

function formatMoney(amount: number | null, currency: string | null): string {
  if (amount === null || Number.isNaN(amount)) return "—";
  const cur = currency?.trim() || "";
  return cur ? `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${cur}` : String(amount);
}

export default function InvoiceDetailPage() {
  const { customerId, financialDocumentId } = useParams<{
    customerId: string;
    financialDocumentId: string;
  }>();
  const { apiBase, authHeaders, isAdmin } = useAuth();
  const [customerName, setCustomerName] = useState("");
  const [detail, setDetail] = useState<CustomerInvoiceDetail | null>(null);
  const [fileMime, setFileMime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!customerId || !financialDocumentId) return;
    setErr("");
    setFileMime(null);
    setLoading(true);
    try {
      const [c, inv] = await Promise.all([
        fetchCustomer(apiBase, authHeaders(), customerId),
        fetchCustomerInvoiceDetail(apiBase, authHeaders(), customerId, financialDocumentId),
      ]);
      setCustomerName(c.name);
      setDetail(inv);
      try {
        if (inv.documentId && customerId) {
          const blob = await fetchDocumentContentBlob(apiBase, authHeaders(), customerId, inv.documentId);
          setFileMime(blob.type || null);
        } else if (inv.fileId) {
          const f = await fetchFileById(apiBase, authHeaders(), inv.fileId);
          setFileMime(f.mimeType);
        } else {
          setFileMime(null);
        }
      } catch {
        setFileMime(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load invoice");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders, customerId, financialDocumentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const validation = detail?.validationJson as { errors?: string[]; warnings?: string[] } | null | undefined;

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link to={`/customers/${customerId ?? ""}/drive?tab=invoices`} className="text-brand hover:underline">
          ← {customerName || "Customer"} · Invoices
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : err ? (
        <p className="text-sm text-red-400">{err}</p>
      ) : detail ? (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised shadow-sm">
            <div className="border-b border-border-subtle px-6 py-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">From</p>
                  <h1 className="mt-1 text-xl font-semibold text-ink">{detail.vendor ?? "—"}</h1>
                  <p className="mt-0.5 text-sm text-muted">
                    Invoice {detail.invoiceNumber ? `#${detail.invoiceNumber}` : "—"}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <div>
                    <span className="text-muted">Invoice date: </span>
                    <span className="font-medium text-ink">{formatDateDisplay(detail.invoiceDate)}</span>
                  </div>
                  <div className="mt-1">
                    <span className="text-muted">Due date: </span>
                    <span className="font-medium text-ink">{formatDateDisplay(detail.dueDate)}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    Pages {detail.pageStart}–{detail.pageEnd} · {detail.status}
                  </div>
                </div>
              </div>

              <div className="mt-6 border-t border-border-subtle pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Bill to / store branch</p>
                <p className="mt-1 text-sm font-medium text-ink">{detail.customerName ?? "—"}</p>
                {detail.customerAddress?.trim() ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Customer address</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{detail.customerAddress.trim()}</p>
                  </div>
                ) : null}
              </div>
            </div>

            {validation?.errors?.length ? (
              <div className="alert-error-banner px-6 py-2 text-sm">
                <span className="font-semibold">Validation: </span>
                {validation.errors.join("; ")}
              </div>
            ) : null}
            {validation?.warnings?.length ? (
              <div className="border-b border-amber-800/40 bg-amber-950/25 px-6 py-2 text-sm text-amber-200">
                <span className="font-semibold">Warnings: </span>
                {validation.warnings.join("; ")}
              </div>
            ) : null}

            <div className="px-6 py-4">
              {detail.lineItemsDescription ? (
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Line items description</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{detail.lineItemsDescription}</p>
                </div>
              ) : null}
              {detail.lineItems.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="border-b border-border bg-surface-muted">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold">#</th>
                        <th className="px-3 py-2.5 font-semibold">Description</th>
                        <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Qty</th>
                        <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Unit price</th>
                        <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lineItems.map((line) => (
                        <tr key={line.lineIndex} className="border-b border-border-subtle last:border-0">
                          <td className="px-3 py-2 text-muted">{line.lineIndex + 1}</td>
                          <td className="px-3 py-2">{line.description ?? "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">{line.quantity ?? "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            {formatMoney(line.unitPrice, detail.currency)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
                            {formatMoney(line.amount, detail.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted">No line items.</p>
              )}

              <div className="mt-6 flex justify-end border-t border-border-subtle pt-4">
                <div className="w-full max-w-xs space-y-2 text-sm">
                  <div className="flex justify-between gap-8">
                    <span className="text-muted">Subtotal</span>
                    <span className="tabular-nums text-ink">{formatMoney(detail.subtotal, detail.currency)}</span>
                  </div>
                  <div className="flex justify-between gap-8">
                    <span className="text-muted">Tax</span>
                    <span className="tabular-nums text-ink">{formatMoney(detail.tax, detail.currency)}</span>
                  </div>
                  <div className="flex justify-between gap-8 border-t border-border pt-2 text-base font-semibold">
                    <span className="text-ink">Total</span>
                    <span className="tabular-nums text-ink">{formatMoney(detail.total, detail.currency)}</span>
                  </div>
                </div>
              </div>

              {detail.notes ? (
                <div className="mt-6 border-t border-border-subtle pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{detail.notes}</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            {isAdmin ? (
              <Link className="font-medium text-brand hover:underline" to={`/jobs/${detail.jobId}`}>
                Open extraction job
              </Link>
            ) : null}
            {customerId ? (
              <Link
                className="font-medium text-brand hover:underline"
                to={`/customers/${customerId}/files/${detail.fileId}`}
              >
                File in drive
              </Link>
            ) : null}
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-ink">Source document</h2>
            <p className="text-xs text-muted">{detail.fileName || detail.fileId || detail.documentId}</p>
            <OriginalFilePreview
              fileId={detail.fileId ?? undefined}
              loadBlob={
                detail.documentId != null && customerId
                  ? () =>
                      fetchDocumentContentBlob(
                        apiBase,
                        authHeaders(),
                        customerId,
                        detail.documentId!
                      )
                  : undefined
              }
              mimeType={fileMime}
              pdfPageRange={{ start: detail.pageStart, end: detail.pageEnd }}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

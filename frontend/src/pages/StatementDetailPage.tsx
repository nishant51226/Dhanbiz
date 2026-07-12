import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchCustomer,
  fetchCustomerStatementDetail,
  fetchDocumentContentBlob,
  fetchFileById,
} from "../api/client";
import { OriginalFilePreview } from "../components/OriginalFilePreview";
import { useAuth } from "../auth/AuthContext";
import type { CustomerStatementDetail } from "../types/api";

function formatMoney(amount: number | null, currency: string | null): string {
  if (amount === null || Number.isNaN(amount)) return "—";
  const cur = currency?.trim() || "";
  return cur ? `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${cur}` : String(amount);
}

export default function StatementDetailPage() {
  const { customerId, financialDocumentId } = useParams<{
    customerId: string;
    financialDocumentId: string;
  }>();
  const { apiBase, authHeaders, isAdmin } = useAuth();
  const [customerName, setCustomerName] = useState("");
  const [detail, setDetail] = useState<CustomerStatementDetail | null>(null);
  const [fileMime, setFileMime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!customerId || !financialDocumentId) return;
    setErr("");
    setFileMime(null);
    setLoading(true);
    try {
      const [c, st] = await Promise.all([
        fetchCustomer(apiBase, authHeaders(), customerId),
        fetchCustomerStatementDetail(apiBase, authHeaders(), customerId, financialDocumentId),
      ]);
      setCustomerName(c.name);
      setDetail(st);
      try {
        if (st.documentId && customerId) {
          const blob = await fetchDocumentContentBlob(apiBase, authHeaders(), customerId, st.documentId);
          setFileMime(blob.type || null);
        } else if (st.fileId) {
          const f = await fetchFileById(apiBase, authHeaders(), st.fileId);
          setFileMime(f.mimeType);
        } else {
          setFileMime(null);
        }
      } catch {
        setFileMime(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load statement");
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
        <Link to={`/customers/${customerId ?? ""}/drive?tab=statements`} className="text-brand hover:underline">
          ← {customerName || "Customer"} · Statements
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
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Account</p>
                  <h1 className="mt-1 text-xl font-semibold text-ink">{detail.accountHolder ?? "—"}</h1>
                  <p className="mt-0.5 text-sm text-muted">
                    {detail.bankName ?? "—"}
                    {detail.accountNumber ? ` · ${detail.accountNumber}` : ""}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <div>
                    <span className="text-muted">Period: </span>
                    <span className="font-medium text-ink">
                      {detail.periodStart ?? "—"} — {detail.periodEnd ?? "—"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    Pages {detail.pageStart}–{detail.pageEnd} · {detail.status}
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 border-t border-border-subtle pt-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Opening balance</p>
                  <p className="mt-1 text-sm font-medium text-ink">
                    {formatMoney(detail.openingBalance, detail.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Closing balance</p>
                  <p className="mt-1 text-sm font-medium text-ink">
                    {formatMoney(detail.closingBalance, detail.currency)}
                  </p>
                </div>
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
              {detail.lineItems.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="border-b border-border bg-surface-muted">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold">#</th>
                        <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Date</th>
                        <th className="px-3 py-2.5 font-semibold">Description</th>
                        <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Debit</th>
                        <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Credit</th>
                        <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lineItems.map((line) => (
                        <tr key={line.lineIndex} className="border-b border-border-subtle last:border-0">
                          <td className="px-3 py-2 text-muted">{line.lineIndex + 1}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-muted">{line.date ?? "—"}</td>
                          <td className="px-3 py-2">{line.description ?? "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            {formatMoney(line.debit, detail.currency)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            {formatMoney(line.credit, detail.currency)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
                            {formatMoney(line.balance, detail.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted">No transactions.</p>
              )}

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
            {customerId && detail.fileId ? (
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

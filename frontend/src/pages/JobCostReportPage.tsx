import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchReportScopeCustomers } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { AiPricingManageSection } from "../components/AiPricingManageSection";
import { TokenBurnPageTable } from "../components/reports/TokenBurnPageTable";
import { TokenBurnReportFilters } from "../components/reports/TokenBurnReportFilters";
import { TokenBurnPricingDialog } from "../components/TokenBurnPricingDialog";
import { useTokenBurnReport } from "../hooks/useTokenBurnReport";
import type { Customer } from "../types/api";

type JobCostView = "summary" | "by-page";

function formatInt(n: number): string {
  return n.toLocaleString();
}

function formatCost(amount: number | null, currency: string | null, partial?: boolean): string {
  if (amount == null) return "—";
  const cur = currency ?? "USD";
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cur,
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(amount);
  } catch {
    formatted = `${amount.toFixed(4)} ${cur}`;
  }
  return partial ? `${formatted} (partial)` : formatted;
}

function fileLabel(row: { fileName: string | null; jobId: string }): string {
  if (row.fileName?.trim()) return row.fileName.trim();
  return `Job ${row.jobId.slice(0, 8)}…`;
}

const VIEW_TABS: { key: JobCostView; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "by-page", label: "By page" },
];

export default function JobCostReportPage() {
  const { apiBase, authHeaders, isAdmin, hasPermission } = useAuth();
  const canReadCustomers = isAdmin || hasPermission("customer:read");
  const canReadFiles = hasPermission("file:read");
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [pricingOpen, setPricingOpen] = useState(false);
  const promptedForKeys = useRef<string>("");

  const view: JobCostView = searchParams.get("view") === "by-page" ? "by-page" : "summary";

  const setView = (next: JobCostView) => {
    if (next === "summary") {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ view: "by-page" }, { replace: true });
    }
  };

  const {
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    customerId,
    setCustomerId,
    report,
    loading,
    error,
    loadReport,
  } = useTokenBurnReport(apiBase, authHeaders);

  useEffect(() => {
    let cancelled = false;
    setCustomersLoading(true);
    void fetchReportScopeCustomers(apiBase, authHeaders(), {
      canReadCustomers,
      canReadFiles,
    })
      .then((list) => {
        if (!cancelled) setCustomers(list);
      })
      .catch(() => {
        if (!cancelled) setCustomers([]);
      })
      .finally(() => {
        if (!cancelled) setCustomersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, authHeaders, canReadCustomers, canReadFiles]);

  useEffect(() => {
    if (!report || loading) return;
    if (report.unpricedModels.length === 0) return;
    const key = report.unpricedModelKeys.slice().sort().join("|");
    if (promptedForKeys.current === key) return;
    promptedForKeys.current = key;
    setPricingOpen(true);
  }, [report, loading]);

  const partial = report?.costIncomplete ?? false;

  return (
    <div className="flex flex-col gap-6">
      <TokenBurnPricingDialog
        open={pricingOpen}
        apiBase={apiBase}
        getAuthHeaders={authHeaders}
        models={report?.unpricedModels ?? []}
        onClose={() => setPricingOpen(false)}
        onSaved={() => {
          promptedForKeys.current = "";
          void loadReport();
        }}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Job Cost</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Input and output tokens are always shown. Estimated cost appears when model pricing is
            configured in the global AI pricing table.
          </p>
        </div>
        {report && report.unpricedModels.length > 0 ? (
          <button
            type="button"
            onClick={() => setPricingOpen(true)}
            className="btn btn-accent btn-md-fixed shrink-0"
          >
            Set missing pricing ({report.unpricedModels.length})
          </button>
        ) : null}
      </div>

      <TokenBurnReportFilters
        fromDate={fromDate}
        toDate={toDate}
        customerId={customerId}
        customers={customers}
        loading={loading}
        customersLoading={customersLoading}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
        onCustomerIdChange={setCustomerId}
        onApply={() => {
          promptedForKeys.current = "";
          void loadReport();
        }}
      />

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <AiPricingManageSection
        apiBase={apiBase}
        getAuthHeaders={authHeaders}
        onPricingChanged={() => {
          promptedForKeys.current = "";
          void loadReport();
        }}
      />

      {report && !loading ? (
        <>
          <div
            role="tablist"
            aria-label="Job Cost views"
            className="flex flex-wrap gap-1 border-b border-border pb-2"
          >
            {VIEW_TABS.map(({ key, label }) => {
              const active = view === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setView(key)}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    active
                      ? "border border-brand/30 bg-brand/10 text-brand"
                      : "text-muted hover:bg-surface-muted hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {view === "summary" ? (
            <>
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border bg-surface-raised p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Total tokens</p>
                  <p className="mt-1 text-2xl font-bold text-ink">{formatInt(report.totals.totalTokens)}</p>
                  <p className="mt-1 text-xs text-muted">
                    In {formatInt(report.totals.inputTokens)} · Out {formatInt(report.totals.outputTokens)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface-raised p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">API calls</p>
                  <p className="mt-1 text-2xl font-bold text-ink">{formatInt(report.totals.executionCount)}</p>
                </div>
                <div className="rounded-xl border border-border bg-surface-raised p-4 sm:col-span-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Estimated cost</p>
                  <p className="mt-1 text-2xl font-bold text-ink">
                    {formatCost(report.totals.estimatedCost, report.totals.currency, partial)}
                  </p>
                  {partial ? (
                    <p className="mt-1 text-xs text-muted">
                      Only models with pricing are included. Set pricing for the rest to complete the total.
                    </p>
                  ) : null}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-ink">By file</h3>
                {(report.byFile ?? []).length === 0 ? (
                  <p className="text-sm text-muted">No AI executions in this period.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-border bg-surface-muted text-[11px] font-bold uppercase tracking-wider text-muted">
                        <tr>
                          <th className="px-3 py-2">File</th>
                          <th className="px-3 py-2">Customer</th>
                          <th className="px-3 py-2 text-right">Input</th>
                          <th className="px-3 py-2 text-right">Output</th>
                          <th className="px-3 py-2 text-right">Total</th>
                          <th className="px-3 py-2 text-right">Calls</th>
                          <th className="px-3 py-2 text-right">Est. cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(report.byFile ?? []).map((row) => (
                          <tr
                            key={`${row.jobId}:${row.fileId ?? "none"}`}
                            className="border-b border-border/60 last:border-0"
                          >
                            <td className="px-3 py-2">
                              {row.fileId ? (
                                <Link
                                  to={`/customers/${row.customerId}/files/${row.fileId}`}
                                  className="font-medium text-brand hover:underline"
                                >
                                  {fileLabel(row)}
                                </Link>
                              ) : (
                                <Link
                                  to={`/jobs/${row.jobId}`}
                                  className="font-medium text-brand hover:underline"
                                >
                                  {fileLabel(row)}
                                </Link>
                              )}
                            </td>
                            <td className="px-3 py-2 text-ink">{row.customerName}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatInt(row.inputTokens)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatInt(row.outputTokens)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatInt(row.totalTokens)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatInt(row.executionCount)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatCost(row.estimatedCost, row.currency ?? report.totals.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-ink">By model</h3>
                {report.byModel.length === 0 ? (
                  <p className="text-sm text-muted">No AI executions in this period.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-border bg-surface-muted text-[11px] font-bold uppercase tracking-wider text-muted">
                        <tr>
                          <th className="px-3 py-2">Provider</th>
                          <th className="px-3 py-2">Model</th>
                          <th className="px-3 py-2 text-right">Input</th>
                          <th className="px-3 py-2 text-right">Output</th>
                          <th className="px-3 py-2 text-right">Total</th>
                          <th className="px-3 py-2 text-right">Calls</th>
                          <th className="px-3 py-2 text-right">Est. cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.byModel.map((row) => (
                          <tr key={`${row.provider}:${row.model}`} className="border-b border-border/60 last:border-0">
                            <td className="px-3 py-2 text-ink">{row.provider}</td>
                            <td className="px-3 py-2 font-mono text-xs text-ink">{row.model}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatInt(row.inputTokens)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatInt(row.outputTokens)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatInt(row.totalTokens)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatInt(row.executionCount)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatCost(row.estimatedCost, row.currency ?? report.totals.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-ink">By customer</h3>
                {report.byCustomer.length === 0 ? (
                  <p className="text-sm text-muted">No customer breakdown for this period.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-border bg-surface-muted text-[11px] font-bold uppercase tracking-wider text-muted">
                        <tr>
                          <th className="px-3 py-2">Customer</th>
                          <th className="px-3 py-2 text-right">Input</th>
                          <th className="px-3 py-2 text-right">Output</th>
                          <th className="px-3 py-2 text-right">Total</th>
                          <th className="px-3 py-2 text-right">Calls</th>
                          <th className="px-3 py-2 text-right">Est. cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.byCustomer.map((row) => (
                          <tr key={row.customerId} className="border-b border-border/60 last:border-0">
                            <td className="px-3 py-2">
                              <Link
                                to={`/customers/${row.customerId}/jobs`}
                                className="font-medium text-brand hover:underline"
                              >
                                {row.customerName}
                              </Link>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatInt(row.inputTokens)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatInt(row.outputTokens)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatInt(row.totalTokens)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatInt(row.executionCount)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatCost(row.estimatedCost, row.currency ?? report.totals.currency, partial)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          ) : (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-ink">
                Pages ({report.byPage?.length ?? 0})
              </h3>
              {partial ? (
                <p className="mb-2 text-xs text-muted">
                  Cost columns may be partial where model pricing is missing.
                </p>
              ) : null}
              <TokenBurnPageTable rows={report.byPage ?? []} report={report} />
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}

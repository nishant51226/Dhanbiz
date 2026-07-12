import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  downloadFileActivityDocumentCsv,
  downloadFileActivityReportCsv,
  fetchDocumentsList,
  fetchFileActivityDocumentSummary,
  fetchFileActivityDocumentTimeline,
  fetchFileActivityReport,
  fetchReportScopeCustomers,
  type FileActivityAction,
  type FileActivityListItem,
} from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { DateRangePickerField } from "../components/DateRangePickerField";
import { SearchableCustomerSelect } from "../components/SearchableCustomerSelect";
import type { Customer } from "../types/api";
import { reportCustomerOptionLabel } from "../utils/reportCustomerSelect";
import { formatDateTime } from "../utils/formatDate";

const ACTION_OPTIONS: { value: "" | FileActivityAction; label: string }[] = [
  { value: "", label: "All actions" },
  { value: "uploaded", label: "Uploaded" },
  { value: "viewed", label: "Viewed" },
  { value: "downloaded", label: "Downloaded" },
  { value: "deleted", label: "Deleted" },
  { value: "assignees_updated", label: "Assignees updated" },
  { value: "job_created", label: "Job created" },
  { value: "job_processing", label: "Job processing" },
  { value: "job_completed", label: "Job completed" },
  { value: "job_failed", label: "Job failed" },
  { value: "job_cancelled", label: "Job cancelled" },
];

type FileFilterOption = {
  id: string;
  name: string;
  customerName: string | null;
};

function actionLabel(action: FileActivityAction): string {
  return ACTION_OPTIONS.find((o) => o.value === action)?.label ?? action;
}

function defaultFromDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 30);
  return d.toISOString().slice(0, 10);
}

function defaultToDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function fileOptionLabel(option: FileFilterOption): string {
  const name = option.name.trim() || option.id;
  if (option.customerName?.trim()) {
    return `${name} (${option.customerName.trim()})`;
  }
  return name;
}

export default function FileActivityReportPage() {
  const { documentId: routeDocumentId } = useParams<{ documentId?: string }>();
  const { apiBase, authHeaders, isAdmin, hasPermission } = useAuth();
  const canReadCustomers = isAdmin || hasPermission("customer:read");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customerId, setCustomerId] = useState("");
  const [documentId, setDocumentId] = useState(routeDocumentId ?? "");
  const [fileOptions, setFileOptions] = useState<FileFilterOption[]>([]);
  const [fileOptionsLoading, setFileOptionsLoading] = useState(false);
  const [fileSearch, setFileSearch] = useState("");
  const [action, setAction] = useState<"" | FileActivityAction>("");
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<FileActivityListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [limit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingTimeline, setExportingTimeline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [timelineDocId, setTimelineDocId] = useState<string | null>(routeDocumentId ?? null);
  const [timeline, setTimeline] = useState<FileActivityListItem[]>([]);
  const [timelineSummary, setTimelineSummary] = useState<Awaited<
    ReturnType<typeof fetchFileActivityDocumentSummary>
  > | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const selectedFile = useMemo(
    () => fileOptions.find((f) => f.id === documentId) ?? null,
    [fileOptions, documentId],
  );

  const exportQuery = useMemo(
    () => ({
      customerId: customerId || undefined,
      documentId: documentId || undefined,
      action: action || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
      search: search.trim() || undefined,
    }),
    [customerId, documentId, action, fromDate, toDate, search],
  );

  useEffect(() => {
    const id = routeDocumentId ?? "";
    setDocumentId(id);
    setTimelineDocId(id || null);
  }, [routeDocumentId]);

  useEffect(() => {
    let cancelled = false;
    setCustomersLoading(true);
    void fetchReportScopeCustomers(apiBase, authHeaders(), {
      canReadCustomers,
      canReadFiles: hasPermission("file:read"),
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
  }, [apiBase, authHeaders, canReadCustomers, hasPermission]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setFileOptionsLoading(true);
      void fetchDocumentsList(apiBase, authHeaders(), {
        page: 1,
        limit: 50,
        sort: "name,ASC",
        libraryKind: "files",
        customerId: customerId.trim() || undefined,
        searchText: fileSearch.trim() || documentId.trim() || undefined,
      })
        .then((res) => {
          if (cancelled) return;
          const opts: FileFilterOption[] = res.data.map((d) => ({
            id: d.id,
            name: d.name,
            customerName: d.customer?.name ?? null,
          }));
          if (documentId && !opts.some((o) => o.id === documentId)) {
            const fromRow = res.data.find((d) => d.id === documentId);
            if (fromRow) {
              opts.unshift({
                id: fromRow.id,
                name: fromRow.name,
                customerName: fromRow.customer?.name ?? null,
              });
            }
          }
          setFileOptions(opts);
        })
        .catch(() => {
          if (!cancelled) setFileOptions([]);
        })
        .finally(() => {
          if (!cancelled) setFileOptionsLoading(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [apiBase, authHeaders, customerId, fileSearch, documentId]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchFileActivityReport(apiBase, authHeaders(), {
        page,
        limit,
        ...exportQuery,
      });
      setRows(res.data);
      setTotal(res.total);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load report");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders, page, limit, exportQuery]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  useEffect(() => {
    if (!timelineDocId) {
      setTimeline([]);
      setTimelineSummary(null);
      return;
    }
    let cancelled = false;
    setTimelineLoading(true);
    void Promise.all([
      fetchFileActivityDocumentTimeline(apiBase, authHeaders(), timelineDocId),
      fetchFileActivityDocumentSummary(apiBase, authHeaders(), timelineDocId),
    ])
      .then(([events, summary]) => {
        if (!cancelled) {
          setTimeline(events);
          setTimelineSummary(summary);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load timeline");
          setTimeline([]);
          setTimelineSummary(null);
        }
      })
      .finally(() => {
        if (!cancelled) setTimelineLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, authHeaders, timelineDocId]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const onExportCsv = async () => {
    setExporting(true);
    setError(null);
    try {
      await downloadFileActivityReportCsv(apiBase, authHeaders(), exportQuery);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const onExportTimelineCsv = async () => {
    if (!timelineDocId) return;
    setExportingTimeline(true);
    setError(null);
    try {
      await downloadFileActivityDocumentCsv(apiBase, authHeaders(), timelineDocId, {
        action: action || undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportingTimeline(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">File activity</h2>
          <p className="mt-1 text-sm text-muted">
            Audit log for Files library uploads: upload, view, download, delete, assignees, and extraction
            job lifecycle. Superadmin only.
          </p>
        </div>
        <button
          type="button"
          className="h-10 shrink-0 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-fg disabled:opacity-50"
          disabled={exporting || loading}
          onClick={() => void onExportCsv()}
        >
          {exporting ? "Exporting…" : "Download CSV"}
        </button>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SearchableCustomerSelect
            customers={customers}
            value={customerId}
            onChange={(id) => {
              setCustomerId(id);
              setDocumentId("");
              setTimelineDocId(null);
              setPage(1);
            }}
            label="Customer"
            allowEmpty
            emptyLabel="All customers"
            size="small"
            disabled={customersLoading || exporting}
            getOptionLabel={reportCustomerOptionLabel}
            placeholder={customersLoading ? "Loading customers…" : "Search customers…"}
          />

          <Autocomplete
            className="sm:col-span-2 lg:col-span-1"
            options={fileOptions}
            value={selectedFile}
            loading={fileOptionsLoading}
            disabled={exporting}
            onChange={(_, option) => {
              const nextId = option?.id ?? "";
              setDocumentId(nextId);
              setTimelineDocId(nextId || null);
              setPage(1);
            }}
            onInputChange={(_, value, reason) => {
              if (reason === "input") setFileSearch(value);
            }}
            getOptionLabel={fileOptionLabel}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            filterOptions={(x) => x}
            noOptionsText={fileOptionsLoading ? "Loading…" : "No matching files"}
            renderInput={(params) => (
              <TextField
                {...params}
                label="File"
                placeholder={customerId ? "Search files for customer…" : "Search all Files library…"}
                size="small"
              />
            )}
          />

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Action</span>
            <select
              className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"
              value={action}
              onChange={(e) => {
                setAction(e.target.value as "" | FileActivityAction);
                setPage(1);
              }}
            >
              {ACTION_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block sm:col-span-2 lg:col-span-1">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Search</span>
            <input
              type="search"
              className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink"
              placeholder="Filename or summary…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Date range</span>
            <DateRangePickerField
              from={fromDate}
              to={toDate}
              onChange={(from, to) => {
                setFromDate(from);
                setToDate(to);
                setPage(1);
              }}
            />
          </label>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(280px,360px)]">
        <div className="overflow-hidden rounded-xl border border-border bg-surface-raised shadow-sm">
          <div className="border-b border-border px-4 py-3 text-sm font-medium text-ink">
            {loading ? "Loading…" : `${total.toLocaleString()} events`}
            {documentId ? (
              <button
                type="button"
                className="ml-3 text-xs font-normal text-accent hover:underline"
                onClick={() => {
                  setDocumentId("");
                  setTimelineDocId(null);
                  setPage(1);
                }}
              >
                Clear file filter
              </button>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">File</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Actor</th>
                  <th className="px-3 py-2">Job</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`cursor-pointer hover:bg-surface ${timelineDocId === row.documentId ? "bg-surface" : ""}`}
                    onClick={() => row.documentId && setTimelineDocId(row.documentId)}
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-muted">{formatDateTime(row.createdAt)}</td>
                    <td className="px-3 py-2">{row.customerName ?? row.customerId.slice(0, 8)}</td>
                    <td className="max-w-[200px] truncate px-3 py-2" title={row.documentName ?? row.summary}>
                      {row.documentName ?? row.summary}
                    </td>
                    <td className="px-3 py-2">{actionLabel(row.action)}</td>
                    <td className="px-3 py-2 text-muted">
                      {row.actorDisplayName ?? row.actorKind}
                    </td>
                    <td className="px-3 py-2">
                      {row.jobId ? (
                        <Link
                          to={`/jobs/${row.jobId}`}
                          className="text-accent hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.jobId.slice(0, 8)}…
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted">
                      No activity found for these filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {pageCount > 1 ? (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-1 disabled:opacity-40"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="text-muted">
                Page {page} of {pageCount}
              </span>
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-1 disabled:opacity-40"
                disabled={page >= pageCount || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>

        <aside className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
          {!timelineDocId ? (
            <p className="text-sm text-muted">Select a row or pick a file above to view its full timeline.</p>
          ) : timelineLoading ? (
            <p className="text-sm text-muted">Loading timeline…</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-ink">
                    {timelineSummary?.document.name ?? "Document timeline"}
                  </h3>
                  {timelineSummary?.customer ? (
                    <p className="text-sm text-muted">{timelineSummary.customer.name}</p>
                  ) : null}
                  {timelineSummary?.latestJob ? (
                    <p className="mt-1 text-xs text-muted">
                      Latest job: {timelineSummary.latestJob.status} (
                      {timelineSummary.latestJob.percentCompleted}%)
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <button
                    type="button"
                    className="text-xs text-accent hover:underline"
                    onClick={() => {
                      setDocumentId("");
                      setTimelineDocId(null);
                      setPage(1);
                    }}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-ink hover:bg-surface disabled:opacity-50"
                    disabled={exportingTimeline || timeline.length === 0}
                    onClick={() => void onExportTimelineCsv()}
                  >
                    {exportingTimeline ? "Exporting…" : "Download CSV"}
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted">
                Full timeline for this file{action || fromDate || toDate ? " (respects action and date filters)" : ""}.
              </p>
              <ol className="space-y-3 border-l-2 border-border pl-4">
                {timeline.map((ev) => (
                  <li key={ev.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent" />
                    <p className="text-xs text-muted">{formatDateTime(ev.createdAt)}</p>
                    <p className="text-sm font-medium text-ink">{actionLabel(ev.action)}</p>
                    <p className="text-sm text-muted">{ev.summary}</p>
                    {ev.actorDisplayName ? (
                      <p className="text-xs text-muted">by {ev.actorDisplayName}</p>
                    ) : null}
                  </li>
                ))}
                {timeline.length === 0 ? (
                  <li className="text-sm text-muted">No events for this document.</li>
                ) : null}
              </ol>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  fetchCustomerDocumentUploadDashboard,
  fetchDocumentsFileAccessLatest,
  fetchDocumentsList,
  fetchLibraryCustomerFilterOptions,
} from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { shouldShowStaffAssigneeFilter } from "../utils/canDeleteDriveFiles";
import { useLibraryZipExport } from "../hooks/useLibraryZipExport";
import { SearchableCustomerSelect } from "./SearchableCustomerSelect";
import { DatePickerField } from "./DatePickerField";
import type {
  AdminLibraryDocumentRow,
  Customer,
  CustomerDocumentUploadDashboardResponse,
  FileDocumentAccessSummary,
} from "../types/api";
import {
  formatLibraryCalendarDateKeyLabel,
  formatLibraryDocumentUploadDateTime,
  normalizeLibraryCalendarDateKey,
} from "../utils/libraryDocumentDate";
import { formatFileAccessActor, normalizeFileAccess, fileAccessActorTitle } from "../utils/fileDocumentAccess";
import { TablePagination } from "./ui/TablePagination";
import { ToolbarButton } from "./ui/ToolbarButton";

type PeriodPreset = "7d" | "30d" | "90d" | "all" | "custom";

const DRILL_EXPORT_PAGE_SIZE = 100;
const SUMMARY_PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
const DRILL_PAGE_SIZE_OPTIONS = [15, 30, 50] as const;

function parseUploadDateKeyParts(dateKey: string): { year: number; month: number; day: number } | null {
  const normalized = normalizeLibraryCalendarDateKey(dateKey);
  if (normalized === "Undated") return null;
  const [y, m, d] = normalized.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m, day: d };
}

function libraryKindLabel(kind: string): string {
  if (kind === "invoices") return "Invoices";
  if (kind === "statements") return "Statements";
  if (kind === "files") return "Files";
  if (kind === "unfiled") return "Unfiled";
  return kind;
}

function uploadRangeForPeriod(
  period: PeriodPreset,
  customFrom: string,
  customTo: string,
): { uploadedAfter?: string; uploadedBefore?: string } {
  if (period === "all") return {};
  if (period === "custom") {
    const out: { uploadedAfter?: string; uploadedBefore?: string } = {};
    if (customFrom.trim()) {
      out.uploadedAfter = new Date(`${customFrom.trim()}T00:00:00.000Z`).toISOString();
    }
    if (customTo.trim()) {
      out.uploadedBefore = new Date(`${customTo.trim()}T23:59:59.999Z`).toISOString();
    }
    return out;
  }
  const days = periodDaysForPreset(period);
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - days);
  from.setUTCHours(0, 0, 0, 0);
  return { uploadedAfter: from.toISOString() };
}

function periodDaysForPreset(period: "7d" | "30d" | "90d"): number {
  if (period === "7d") return 7;
  if (period === "90d") return 90;
  return 30;
}

function drillScopeKey(customerId: string, uploadDateKey: string): string {
  return `${customerId}:${normalizeLibraryCalendarDateKey(uploadDateKey)}`;
}

function drillExportDateFilters(uploadDateKey: string | null | undefined) {
  const parts = uploadDateKey ? parseUploadDateKeyParts(uploadDateKey) : null;
  if (!parts) return {};
  return { year: parts.year, month: parts.month, day: parts.day };
}

type DrillDocumentsPanelProps = {
  drillLoading: boolean;
  drillDocs: AdminLibraryDocumentRow[];
  allDrillPageSelected: boolean;
  someDrillPageSelected: boolean;
  selectedDocIds: ReadonlySet<string>;
  drillPage: number;
  drillPageCount: number;
  drillTotal: number;
  drillPageSize: number;
  onToggleDrillPageSelection: () => void;
  onToggleDrillDocSelection: (id: string, checked: boolean) => void;
  onDrillPageChange: (page: number) => void;
  onDrillPageSizeChange: (size: number) => void;
  onOpenDocument?: (documentId: string) => void;
};

function DrillDocumentsPanel({
  drillLoading,
  drillDocs,
  allDrillPageSelected,
  someDrillPageSelected,
  selectedDocIds,
  drillPage,
  drillPageCount,
  drillTotal,
  drillPageSize,
  onToggleDrillPageSelection,
  onToggleDrillDocSelection,
  onDrillPageChange,
  onDrillPageSizeChange,
  onOpenDocument,
}: Readonly<DrillDocumentsPanelProps>) {
  if (drillLoading) {
    return <p className="mt-3 text-sm text-muted">Loading documents…</p>;
  }
  if (drillDocs.length === 0) {
    return <p className="mt-3 text-sm text-muted">No documents for this customer on the selected day.</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-border-subtle bg-surface-raised/80">
      <table className="w-full min-w-[880px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-border bg-surface-muted/80">
            <th className="w-10 px-2 py-2.5">
              <input
                type="checkbox"
                className="rounded border-border"
                checked={allDrillPageSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someDrillPageSelected && !allDrillPageSelected;
                }}
                aria-label="Select all documents on this page"
                onChange={onToggleDrillPageSelection}
              />
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold text-ink">Document</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold text-ink">Library</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold text-ink">Folder</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold text-ink">Uploaded by</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold text-ink">Downloaded by</th>
            <th className="whitespace-nowrap px-3 py-2.5 font-semibold text-ink">Uploaded</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {drillDocs.map((doc) => {
            const uploaded = doc.uploadedAt ?? doc.createdAt;
            const label = doc.name?.trim() || "Document";
            const fileAccess = normalizeFileAccess(doc);
            const uploadedBy = formatFileAccessActor(fileAccess?.uploadedBy);
            const downloadedBy = formatFileAccessActor(fileAccess?.lastDownloadedBy);
            return (
              <tr key={doc.id} className="bg-surface-raised/80 hover:bg-surface-muted/20">
                <td className="px-2 py-2.5">
                  <input
                    type="checkbox"
                    className="rounded border-border"
                    checked={selectedDocIds.has(doc.id)}
                    aria-label={`Select ${label}`}
                    onChange={(e) => onToggleDrillDocSelection(doc.id, e.target.checked)}
                  />
                </td>
                <td className="max-w-[240px] px-3 py-2.5 font-medium text-ink">
                  {onOpenDocument ? (
                    <button
                      type="button"
                      onClick={() => onOpenDocument(doc.id)}
                      className="truncate text-left text-brand hover:underline"
                      title={label}
                    >
                      {label}
                    </button>
                  ) : (
                    <span className="truncate" title={label}>
                      {label}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-ink-soft">
                  {libraryKindLabel(doc.folder?.type ?? "")}
                </td>
                <td className="max-w-[180px] truncate px-3 py-2.5 text-ink-soft" title={doc.folder?.name ?? ""}>
                  {doc.folder?.name?.trim() || "—"}
                </td>
                <td
                  className="max-w-[160px] truncate whitespace-nowrap px-3 py-2.5 text-ink-soft"
                  title={fileAccessActorTitle(uploadedBy.label, uploadedBy.tooltip, "Uploaded")}
                >
                  {uploadedBy.label}
                </td>
                <td
                  className="max-w-[160px] truncate whitespace-nowrap px-3 py-2.5 text-ink-soft"
                  title={fileAccessActorTitle(downloadedBy.label, downloadedBy.tooltip, "Downloaded")}
                >
                  {downloadedBy.label}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-muted">
                  {uploaded ? formatLibraryDocumentUploadDateTime(uploaded) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <TablePagination
        page={drillPage}
        pageCount={drillPageCount}
        total={drillTotal}
        pageSize={drillPageSize}
        onPageChange={onDrillPageChange}
        pageSizeOptions={[...DRILL_PAGE_SIZE_OPTIONS]}
        onPageSizeChange={(size) => {
          onDrillPageSizeChange(size);
          onDrillPageChange(1);
        }}
      />
    </div>
  );
}

export function CustomerDocumentUploadsDashboardCard({
  apiBase,
  authHeaders,
  onOpenDocument,
}: Readonly<{
  apiBase: string;
  authHeaders: () => HeadersInit;
  onOpenDocument?: (documentId: string) => void;
}>) {
  const navigate = useNavigate();
  const { hasPermission, isAdmin } = useAuth();
  const showAssignedFilter = shouldShowStaffAssigneeFilter({
    isPortal: false,
    isAdmin,
    hasPermission,
  });
  const showCustomerFilter = hasPermission("customer:read") || hasPermission("file:read");

  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [filterCustomerId, setFilterCustomerId] = useState("");
  const [assignedToMeOnly, setAssignedToMeOnly] = useState(false);
  const [drillCustomerId, setDrillCustomerId] = useState<string | null>(null);
  const [drillUploadDateKey, setDrillUploadDateKey] = useState<string | null>(null);
  const [summaryPage, setSummaryPage] = useState(1);
  const [summaryPageSize, setSummaryPageSize] = useState<number>(SUMMARY_PAGE_SIZE_OPTIONS[0]);
  const [drillPage, setDrillPage] = useState(1);
  const [drillPageSize, setDrillPageSize] = useState<number>(DRILL_PAGE_SIZE_OPTIONS[0]);
  const [drillPageCount, setDrillPageCount] = useState(1);
  const [drillTotal, setDrillTotal] = useState(0);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [data, setData] = useState<CustomerDocumentUploadDashboardResponse | null>(null);
  const [drillDocs, setDrillDocs] = useState<AdminLibraryDocumentRow[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [drillLoading, setDrillLoading] = useState(false);
  const [err, setErr] = useState("");

  const drillScopeRef = useRef("");
  const pendingExportScopeRef = useRef<string | null>(null);
  const drillFetchGenerationRef = useRef(0);

  const clearDrill = useCallback(() => {
    setDrillCustomerId(null);
    setDrillUploadDateKey(null);
    setDrillPage(1);
    setDrillPageCount(1);
    setDrillTotal(0);
    setSelectedDocIds(new Set());
  }, []);

  const { exporting, exportNotice, setExportNotice, startLibraryZipExport } = useLibraryZipExport(
    apiBase,
    authHeaders,
  );

  const resetSummaryPage = useCallback(() => {
    setSummaryPage(1);
    clearDrill();
  }, [clearDrill]);

  const uploadRange = useMemo(
    () => uploadRangeForPeriod(period, customFrom, customTo),
    [period, customFrom, customTo],
  );

  const queryBase = useMemo(
    () => ({
      ...uploadRange,
      customerId: filterCustomerId || undefined,
      assignedOnly: assignedToMeOnly ? true : undefined,
      page: summaryPage,
      limit: summaryPageSize,
    }),
    [uploadRange, filterCustomerId, assignedToMeOnly, summaryPage, summaryPageSize],
  );

  useEffect(() => {
    if (!showCustomerFilter) return;
    let cancelled = false;
    void (async () => {
      try {
        const opts = await fetchLibraryCustomerFilterOptions(apiBase, authHeaders());
        if (!cancelled) {
          setCustomers(
            opts.map(
              (o): Customer => ({
                id: o.id,
                name: o.name,
              }),
            ),
          );
        }
      } catch {
        if (!cancelled) setCustomers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, authHeaders, showCustomerFilter]);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetchCustomerDocumentUploadDashboard(apiBase, authHeaders(), queryBase);
      const maxPage = Math.max(1, res.byCustomerDatePageCount ?? 1);
      if (summaryPage > maxPage) {
        setSummaryPage(maxPage);
        return;
      }
      setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load upload counts");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders, queryBase, summaryPage]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const loadDrillDocs = useCallback(async () => {
    if (!drillCustomerId || !drillUploadDateKey) {
      setDrillDocs([]);
      setDrillPageCount(1);
      setDrillTotal(0);
      return;
    }
    const generation = drillFetchGenerationRef.current + 1;
    drillFetchGenerationRef.current = generation;
    setDrillLoading(true);
    try {
      const res = await fetchDocumentsList(apiBase, authHeaders(), {
        page: drillPage,
        limit: drillPageSize,
        sort: "uploadedAt,DESC",
        customerId: drillCustomerId,
        assignedOnly: assignedToMeOnly ? true : undefined,
        uploadDateKey: drillUploadDateKey,
      });
      if (generation !== drillFetchGenerationRef.current) return;
      let rows = res.data;
      if (rows.length > 0) {
        try {
          const accessById = await fetchDocumentsFileAccessLatest(
            apiBase,
            authHeaders(),
            rows.map((row) => row.id),
          );
          if (generation !== drillFetchGenerationRef.current) return;
          rows = rows.map((row) => ({
            ...row,
            fileAccess:
              accessById[row.id] ??
              row.fileAccess ??
              ({
                uploadedBy: null,
                lastViewedBy: null,
                lastDownloadedBy: null,
              } satisfies FileDocumentAccessSummary),
          }));
        } catch {
          /* drill-down still usable without access enrichment */
        }
      }
      if (generation !== drillFetchGenerationRef.current) return;
      setDrillDocs(rows);
      setDrillPageCount(Math.max(1, res.pageCount));
      setDrillTotal(res.total);
    } catch {
      if (generation !== drillFetchGenerationRef.current) return;
      setDrillDocs([]);
      setDrillPageCount(1);
      setDrillTotal(0);
    } finally {
      if (generation === drillFetchGenerationRef.current) {
        setDrillLoading(false);
      }
    }
  }, [apiBase, authHeaders, drillCustomerId, drillUploadDateKey, drillPage, drillPageSize, assignedToMeOnly]);

  const refreshDrillForExportScope = useCallback(
    (scope: string) => {
      if (!scope || scope !== drillScopeRef.current) return;
      void loadDrillDocs();
      window.setTimeout(() => void loadDrillDocs(), 2500);
    },
    [loadDrillDocs],
  );

  const beginDrillExport = useCallback(
    (scope: string, run: () => void | Promise<void>) => {
      pendingExportScopeRef.current = scope;
      void run();
    },
    [],
  );

  useEffect(() => {
    drillScopeRef.current =
      drillCustomerId && drillUploadDateKey
        ? drillScopeKey(drillCustomerId, drillUploadDateKey)
        : "";
  }, [drillCustomerId, drillUploadDateKey]);

  useEffect(() => {
    void loadDrillDocs();
  }, [loadDrillDocs]);

  useEffect(() => {
    if (!drillCustomerId || !drillUploadDateKey) return;
    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") void loadDrillDocs();
    };
    const refreshAfterExport = () => {
      const scope = pendingExportScopeRef.current;
      if (scope) refreshDrillForExportScope(scope);
    };
    const refreshAfterExportDownload = () => {
      const scope = pendingExportScopeRef.current;
      if (scope && scope === drillScopeRef.current) {
        refreshDrillForExportScope(scope);
        return;
      }
      if (drillScopeRef.current) {
        void loadDrillDocs();
        window.setTimeout(() => void loadDrillDocs(), 2500);
      }
    };
    document.addEventListener("visibilitychange", refreshOnVisible);
    window.addEventListener("focus", refreshOnVisible);
    window.addEventListener("library-export-downloaded", refreshAfterExportDownload);
    window.addEventListener("library-export-completed", refreshAfterExport);
    return () => {
      document.removeEventListener("visibilitychange", refreshOnVisible);
      window.removeEventListener("focus", refreshOnVisible);
      window.removeEventListener("library-export-downloaded", refreshAfterExportDownload);
      window.removeEventListener("library-export-completed", refreshAfterExport);
    };
  }, [drillCustomerId, drillUploadDateKey, loadDrillDocs, refreshDrillForExportScope]);

  const drillCustomerName = useMemo(() => {
    if (!drillCustomerId) return null;
    const dateKey = drillUploadDateKey ? normalizeLibraryCalendarDateKey(drillUploadDateKey) : null;
    return (
      data?.byCustomerDate.find(
        (c) =>
          c.customerId === drillCustomerId &&
          (!dateKey || normalizeLibraryCalendarDateKey(c.uploadDateKey) === dateKey),
      )?.customerName ??
      data?.byCustomer.find((c) => c.customerId === drillCustomerId)?.customerName ??
      customers.find((c) => c.id === drillCustomerId)?.name ??
      drillCustomerId
    );
  }, [drillCustomerId, drillUploadDateKey, data?.byCustomerDate, data?.byCustomer, customers]);

  const customerDateRows = data?.byCustomerDate ?? [];
  const summaryPageCount = data?.byCustomerDatePageCount ?? 1;
  const summaryTotal = data?.byCustomerDateTotal ?? customerDateRows.length;

  const filesHref = useMemo(() => {
    const params = new URLSearchParams();
    const cid = drillCustomerId || filterCustomerId;
    if (cid) params.set("customerId", cid);
    const q = params.toString();
    return q ? `/files?${q}` : "/files";
  }, [drillCustomerId, filterCustomerId]);

  const drillPageDocIds = useMemo(() => drillDocs.map((doc) => doc.id), [drillDocs]);
  const allDrillPageSelected =
    drillPageDocIds.length > 0 && drillPageDocIds.every((id) => selectedDocIds.has(id));
  const someDrillPageSelected = drillPageDocIds.some((id) => selectedDocIds.has(id));

  const toggleDrillDocSelection = useCallback((documentId: string, checked: boolean) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(documentId);
      else next.delete(documentId);
      return next;
    });
  }, []);

  const toggleDrillPageSelection = useCallback(() => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (allDrillPageSelected) {
        for (const id of drillPageDocIds) next.delete(id);
      } else {
        for (const id of drillPageDocIds) next.add(id);
      }
      return next;
    });
  }, [allDrillPageSelected, drillPageDocIds]);

  const fetchAllDrillDocumentIds = useCallback(async (): Promise<string[]> => {
    if (!drillCustomerId || !drillUploadDateKey) return [];
    const ids: string[] = [];
    let page = 1;
    let pageCount = 1;
    while (page <= pageCount) {
      const res = await fetchDocumentsList(apiBase, authHeaders(), {
        page,
        limit: DRILL_EXPORT_PAGE_SIZE,
        sort: "uploadedAt,DESC",
        customerId: drillCustomerId,
        assignedOnly: assignedToMeOnly ? true : undefined,
        uploadDateKey: drillUploadDateKey,
      });
      ids.push(...res.data.map((doc) => doc.id));
      pageCount = Math.max(1, res.pageCount);
      page += 1;
    }
    return ids;
  }, [apiBase, authHeaders, drillCustomerId, drillUploadDateKey, assignedToMeOnly]);

  const drillExportScopeLabel = useMemo(() => {
    if (!drillCustomerName || !drillUploadDateKey) return "drill-down";
    return `${drillCustomerName} · ${formatLibraryCalendarDateKeyLabel(drillUploadDateKey)}`;
  }, [drillCustomerName, drillUploadDateKey]);

  const handleDownloadSelectedZip = useCallback(() => {
    const ids = [...selectedDocIds];
    if (ids.length === 0 || !drillCustomerId || !drillUploadDateKey) return;
    const scope = drillScopeKey(drillCustomerId, drillUploadDateKey);
    beginDrillExport(scope, () =>
      startLibraryZipExport(
        {
          customerId: drillCustomerId,
          viewMode: "dateView",
          assignedOnly: assignedToMeOnly ? true : undefined,
          documentIds: ids,
          ...drillExportDateFilters(drillUploadDateKey),
        },
        `${ids.length} selected file${ids.length === 1 ? "" : "s"}`,
        { onExportCompleted: () => refreshDrillForExportScope(scope) },
      ),
    );
  }, [
    selectedDocIds,
    drillCustomerId,
    drillUploadDateKey,
    assignedToMeOnly,
    beginDrillExport,
    startLibraryZipExport,
    refreshDrillForExportScope,
  ]);

  const handleDownloadAllDrillZip = useCallback(() => {
    if (!drillCustomerId || !drillUploadDateKey || drillTotal <= 0) return;
    const scope = drillScopeKey(drillCustomerId, drillUploadDateKey);
    beginDrillExport(scope, () =>
      void (async () => {
        const dateParts = parseUploadDateKeyParts(drillUploadDateKey);
        if (dateParts) {
          await startLibraryZipExport(
            {
              customerId: drillCustomerId,
              viewMode: "dateView",
              assignedOnly: assignedToMeOnly ? true : undefined,
              year: dateParts.year,
              month: dateParts.month,
              day: dateParts.day,
            },
            drillExportScopeLabel,
            { onExportCompleted: () => refreshDrillForExportScope(scope) },
          );
          return;
        }
        try {
          const ids = await fetchAllDrillDocumentIds();
          if (ids.length === 0) return;
          await startLibraryZipExport(
            {
              customerId: drillCustomerId,
              viewMode: "dateView",
              assignedOnly: assignedToMeOnly ? true : undefined,
              documentIds: ids,
              ...drillExportDateFilters(drillUploadDateKey),
            },
            drillExportScopeLabel,
            { onExportCompleted: () => refreshDrillForExportScope(scope) },
          );
        } catch (e) {
          setExportNotice({
            severity: "error",
            message: e instanceof Error ? e.message : "Failed to prepare ZIP export",
          });
        }
      })(),
    );
  }, [
    drillCustomerId,
    drillUploadDateKey,
    drillTotal,
    assignedToMeOnly,
    beginDrillExport,
    startLibraryZipExport,
    drillExportScopeLabel,
    fetchAllDrillDocumentIds,
    setExportNotice,
    refreshDrillForExportScope,
  ]);

  return (
    <section className="rounded-xl border border-border bg-surface-raised p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Client document uploads</h2>
          <p className="mt-1 max-w-3xl text-xs text-muted">
            Documents uploaded to customer libraries in the selected period. Click a row to see the files uploaded
            that day.
          </p>
        </div>
        <ToolbarButton onClick={() => void loadSummary()}>Refresh</ToolbarButton>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface-muted/30 p-3">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">Period</span>
          <select
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value as PeriodPreset);
              resetSummaryPage();
            }}
            className="rounded-lg border border-border bg-surface-input px-2.5 py-1.5 text-sm text-ink"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
            <option value="custom">Custom range</option>
          </select>
        </label>
        {period === "custom" ? (
          <>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">From</span>
              <DatePickerField
                value={customFrom}
                onChange={(v) => {
                  setCustomFrom(v);
                  resetSummaryPage();
                }}
                aria-label="From date"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">To</span>
              <DatePickerField
                value={customTo}
                onChange={(v) => {
                  setCustomTo(v);
                  resetSummaryPage();
                }}
                aria-label="To date"
              />
            </label>
          </>
        ) : null}
        {showCustomerFilter ? (
          <div className="min-w-[160px] max-w-[220px] flex-1">
            <SearchableCustomerSelect
              customers={customers}
              value={filterCustomerId}
              onChange={(id) => {
                setFilterCustomerId(id);
                resetSummaryPage();
              }}
              label="Customer"
              allowEmpty
              emptyLabel="All customers"
              size="small"
              className="w-full"
            />
          </div>
        ) : null}
        {showAssignedFilter ? (
          <label className="flex items-center gap-2 pb-1.5 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={assignedToMeOnly}
              onChange={(e) => {
                setAssignedToMeOnly(e.target.checked);
                resetSummaryPage();
              }}
              className="rounded border-border"
            />
            {" "}
            Assigned to me
          </label>
        ) : null}
      </div>

      {err ? <p className="mt-3 text-xs text-feedback-error">{err}</p> : null}

      {loading ? <p className="mt-4 text-sm text-muted">Loading upload counts…</p> : null}
      {!loading && data ? (
        <>
          <div className="mt-4 flex flex-wrap items-baseline gap-3">
            <p className="text-3xl font-bold tabular-nums text-brand">{data.total.toLocaleString()}</p>
            <p className="text-sm text-muted">documents uploaded in period</p>
            <Link to={filesHref} className="text-xs font-semibold text-brand hover:underline">
              Open in Files
            </Link>
          </div>

          <div className="mt-6 overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full min-w-[560px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-muted/80">
                  <th className="whitespace-nowrap px-3 py-2.5 font-semibold text-ink">Customer</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-semibold text-ink">Upload date</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-ink">
                    Documents uploaded
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {customerDateRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-8 text-center text-sm text-muted">
                      No uploads in this period.
                    </td>
                  </tr>
                ) : (
                  customerDateRows.map((row) => {
                    const dateKey = normalizeLibraryCalendarDateKey(row.uploadDateKey);
                    const rowKey = `${row.customerId}:${dateKey}`;
                    const active = drillCustomerId === row.customerId && drillUploadDateKey === dateKey;
                    return (
                      <tr
                        key={rowKey}
                        className={`cursor-pointer bg-surface-raised/80 transition hover:bg-surface-muted/25 ${
                          active ? "bg-brand/10" : ""
                        }`}
                        onClick={() => {
                          if (active) {
                            clearDrill();
                            return;
                          }
                          drillFetchGenerationRef.current += 1;
                          setDrillCustomerId(row.customerId);
                          setDrillUploadDateKey(dateKey);
                          setDrillPage(1);
                          setSelectedDocIds(new Set());
                        }}
                      >
                        <td className="px-3 py-2.5 font-medium text-ink">
                          <span className={active ? "text-brand" : ""}>{row.customerName}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-ink-soft">
                          {formatLibraryCalendarDateKeyLabel(dateKey)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                          {row.count.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            <TablePagination
              page={summaryPage}
              pageCount={summaryPageCount}
              total={summaryTotal}
              pageSize={summaryPageSize}
              onPageChange={setSummaryPage}
              pageSizeOptions={[...SUMMARY_PAGE_SIZE_OPTIONS]}
              onPageSizeChange={(size) => {
                setSummaryPageSize(size);
                setSummaryPage(1);
              }}
            />
          </div>

          {drillCustomerId && drillUploadDateKey ? (
            <div className="mt-6 rounded-lg border border-brand/25 bg-brand/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Drill-down</p>
                  <h3 className="text-sm font-semibold text-ink">
                    {drillCustomerName} · {formatLibraryCalendarDateKeyLabel(drillUploadDateKey)}
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ToolbarButton onClick={clearDrill}>Clear</ToolbarButton>
                  {drillTotal > 0 ? (
                    <ToolbarButton disabled={exporting} onClick={() => handleDownloadAllDrillZip()}>
                      {exporting ? "Starting export…" : `Download all (${drillTotal.toLocaleString()})`}
                    </ToolbarButton>
                  ) : null}
                  {selectedDocIds.size > 0 ? (
                    <ToolbarButton
                      variant="accent"
                      disabled={exporting}
                      onClick={handleDownloadSelectedZip}
                    >
                      {exporting ? "Starting export…" : `Download selected (${selectedDocIds.size})`}
                    </ToolbarButton>
                  ) : null}
                  <ToolbarButton
                    variant="ghost"
                    className="text-brand hover:bg-surface-muted"
                    onClick={() => navigate(`/files?customerId=${encodeURIComponent(drillCustomerId)}`)}
                  >
                    View in Files
                  </ToolbarButton>
                </div>
              </div>
              {exportNotice ? (
                <output
                  className={`mt-3 block text-xs ${
                    exportNotice.severity === "error" ? "text-feedback-error" : "text-brand"
                  }`}
                >
                  {exportNotice.message}
                  <button
                    type="button"
                    className="ml-2 font-semibold underline"
                    onClick={() => setExportNotice(null)}
                  >
                    Dismiss
                  </button>
                </output>
              ) : null}
              <DrillDocumentsPanel
                drillLoading={drillLoading}
                drillDocs={drillDocs}
                allDrillPageSelected={allDrillPageSelected}
                someDrillPageSelected={someDrillPageSelected}
                selectedDocIds={selectedDocIds}
                drillPage={drillPage}
                drillPageCount={drillPageCount}
                drillTotal={drillTotal}
                drillPageSize={drillPageSize}
                onToggleDrillPageSelection={toggleDrillPageSelection}
                onToggleDrillDocSelection={toggleDrillDocSelection}
                onDrillPageChange={setDrillPage}
                onDrillPageSizeChange={setDrillPageSize}
                onOpenDocument={onOpenDocument}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

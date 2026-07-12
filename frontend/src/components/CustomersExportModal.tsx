import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  downloadCustomersListExport,
  fetchCustomerSummaryExportCatalog,
  fetchCustomersListExportPreview,
  type CustomerSummaryExportCatalogColumn,
  type CustomersListExportFilters,
  type CustomersListExportPreviewResponse,
} from "../api/client";
import type { CustomersListFilters } from "../utils/customersListFilters";
import { DatePickerField } from "./DatePickerField";
import { ModalBackdrop } from "./ui/ModalBackdrop";

type FormStatusFilter = "all" | "draft" | "completed";

export type CustomersExportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
  authHeaders: () => HeadersInit;
  /** Seed search from the list page search box. */
  initialSearch?: string;
  /** Seed filters from the customers list page. */
  initialFilters?: Partial<CustomersListFilters>;
  mode?: "modal" | "page";
};

function buildFilters(
  search: string,
  createdFrom: string,
  createdTo: string,
  updatedFrom: string,
  updatedTo: string,
  formStatus: FormStatusFilter,
  accountStatus: CustomersListFilters["accountStatus"],
): CustomersListExportFilters {
  const filters: CustomersListExportFilters = {};
  const t = search.trim();
  if (t) filters.search = t;
  if (createdFrom.trim()) filters.createdFrom = createdFrom.trim();
  if (createdTo.trim()) filters.createdTo = createdTo.trim();
  if (updatedFrom.trim()) filters.updatedFrom = updatedFrom.trim();
  if (updatedTo.trim()) filters.updatedTo = updatedTo.trim();
  if (formStatus !== "all") filters.formStatus = formStatus;
  if (accountStatus !== "all") filters.accountStatus = accountStatus;
  return filters;
}

function exportCsvButtonTitle(
  exportReady: boolean,
  preview: CustomersListExportPreviewResponse | null,
): string | undefined {
  if (exportReady) return undefined;
  if (preview?.exceedsExportCap) return "Too many rows — narrow filters";
  return "Wait for preview or adjust filters/columns";
}

function previewStatusBadge(
  previewLoading: boolean,
  preview: CustomersListExportPreviewResponse | null,
  columnsOrderedLength: number,
): ReactNode {
  if (previewLoading) {
    return <span className="text-xs text-muted">Updating…</span>;
  }
  if (preview) {
    const capSuffix = preview.exceedsExportCap ? ` (export limit ${preview.exportCap})` : "";
    return (
      <span className="text-xs text-muted">
        {preview.total} customer{preview.total === 1 ? "" : "s"} match{capSuffix}
      </span>
    );
  }
  if (columnsOrderedLength === 0) {
    return <span className="text-xs text-feedback-warning">Select at least one column</span>;
  }
  return null;
}

function previewTableRowKey(headers: string[], row: string[], rowIndex: number): string {
  const idCell = row[0]?.trim();
  if (idCell) return `${rowIndex}-${idCell}`;
  return headers.map((header, index) => `${header}:${row[index] ?? ""}`).join("|");
}

export function CustomersExportModal({
  isOpen,
  onClose,
  apiBase,
  authHeaders,
  initialSearch = "",
  initialFilters,
  mode = "modal",
}: Readonly<CustomersExportModalProps>) {
  const isPageMode = mode === "page";
  const [search, setSearch] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [updatedFrom, setUpdatedFrom] = useState("");
  const [updatedTo, setUpdatedTo] = useState("");
  const [formStatus, setFormStatus] = useState<FormStatusFilter>("all");
  const [accountStatus, setAccountStatus] = useState<CustomersListFilters["accountStatus"]>("all");
  const [catalog, setCatalog] = useState<CustomerSummaryExportCatalogColumn[]>([]);
  const [catalogErr, setCatalogErr] = useState("");
  const [selectedCols, setSelectedCols] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<CustomersListExportPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErr, setPreviewErr] = useState("");
  const previewReq = useRef(0);

  const columnsOrdered = useMemo(
    () => catalog.filter((c) => selectedCols.has(c.id)).map((c) => c.id),
    [catalog, selectedCols],
  );

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setSearch(initialSearch.trim() || initialFilters?.search?.trim() || "");
    setCreatedFrom(initialFilters?.createdFrom?.trim() ?? "");
    setCreatedTo(initialFilters?.createdTo?.trim() ?? "");
    setUpdatedFrom(initialFilters?.updatedFrom?.trim() ?? "");
    setUpdatedTo(initialFilters?.updatedTo?.trim() ?? "");
    setFormStatus(initialFilters?.formStatus ?? "all");
    setAccountStatus(initialFilters?.accountStatus ?? "all");
    setErr("");
    setPreview(null);
    setPreviewErr("");
    setCatalogErr("");
    setCatalog([]);
    void (async () => {
      try {
        const { columns } = await fetchCustomerSummaryExportCatalog(apiBase, authHeaders());
        if (cancelled) return;
        setCatalog(columns);
        setSelectedCols(new Set(columns.map((c) => c.id)));
      } catch (e) {
        if (!cancelled) {
          setCatalogErr(e instanceof Error ? e.message : "Failed to load columns");
          setCatalog([]);
          setSelectedCols(new Set());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, initialSearch, initialFilters, apiBase, authHeaders]);

  useEffect(() => {
    if (isPageMode) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose, busy, isPageMode]);

  useEffect(() => {
    if (!isOpen) return;

    const cols = catalog.filter((c) => selectedCols.has(c.id)).map((c) => c.id);
    if (cols.length === 0) {
      setPreview(null);
      setPreviewErr("");
      setPreviewLoading(false);
      return;
    }

    const filters = buildFilters(search, createdFrom, createdTo, updatedFrom, updatedTo, formStatus, accountStatus);
    const handle = globalThis.setTimeout(() => {
      const my = ++previewReq.current;
      setPreviewLoading(true);
      setPreviewErr("");
      void (async () => {
        try {
          const data = await fetchCustomersListExportPreview(apiBase, authHeaders(), {
            columns: cols,
            filters,
            previewRowLimit: 50,
            matchingNameLimit: 150,
          });
          if (previewReq.current !== my) return;
          setPreview(data);
        } catch (e) {
          if (previewReq.current !== my) return;
          setPreview(null);
          setPreviewErr(e instanceof Error ? e.message : "Preview failed");
        } finally {
          if (previewReq.current === my) setPreviewLoading(false);
        }
      })();
    }, 420);

    return () => {
      globalThis.clearTimeout(handle);
    };
  }, [
    isOpen,
    apiBase,
    authHeaders,
    search,
    createdFrom,
    createdTo,
    updatedFrom,
    updatedTo,
    formStatus,
    accountStatus,
    selectedCols,
    catalog,
  ]);

  const toggleCol = (id: string) => {
    setSelectedCols((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllCols = () => {
    setSelectedCols(new Set(catalog.map((c) => c.id)));
  };

  const clearCols = () => {
    setSelectedCols(new Set());
  };

  const exportReady = Boolean(
    preview &&
      preview.total > 0 &&
      !preview.exceedsExportCap &&
      columnsOrdered.length > 0 &&
      !previewLoading &&
      !previewErr,
  );

  const runExport = async (format: "csv" | "xlsx") => {
    if (!exportReady) return;
    setErr("");
    setBusy(true);
    try {
      await downloadCustomersListExport(apiBase, authHeaders(), {
        format,
        columns: columnsOrdered,
        filters: buildFilters(search, createdFrom, createdTo, updatedFrom, updatedTo, formStatus, accountStatus),
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  const content = (
    <div
      className={`relative w-full transform overflow-hidden rounded-2xl border border-border bg-surface-raised p-6 shadow-xl ${
        isPageMode ? "max-w-none rounded-xl shadow-none" : "max-w-4xl"
      }`}
    >
      {isPageMode ? null : (
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-soft hover:text-muted disabled:opacity-50"
        >
          ✕
        </button>
      )}

      <h3 className="text-lg font-semibold text-ink">Export customers</h3>
      <p className="mt-1 text-sm text-muted">
        Filters use the same rules as the customers list. Columns match each customer&apos;s detail export
        (turnover, VAT, agent, bank, etc.). All columns are selected by default — turn off any you don&apos;t
        need. Review the preview, then export.
      </p>
      {catalogErr ? <p className="mt-2 text-sm text-red-400">{catalogErr}</p> : null}

      <div className={isPageMode ? "mt-6 grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]" : "mt-6 space-y-6"}>
        <div className="space-y-6">
        <section>
          <h4 className="text-sm font-semibold text-ink">Filters</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label htmlFor="customers-export-search" className="block sm:col-span-2">
                    <span className="text-xs font-medium text-muted">Search by client name</span>
                    <input
                      id="customers-export-search"
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-ink"
                      placeholder="Substring match on name"
                      disabled={busy}
                    />
                  </label>
                  <div className="block">
                    <span className="text-xs font-medium text-muted">Created from</span>
                    <div className="mt-1">
                      <DatePickerField
                        value={createdFrom}
                        onChange={setCreatedFrom}
                        disabled={busy}
                        aria-label="Created from"
                      />
                    </div>
                  </div>
                  <div className="block">
                    <span className="text-xs font-medium text-muted">Created to</span>
                    <div className="mt-1">
                      <DatePickerField
                        value={createdTo}
                        onChange={setCreatedTo}
                        disabled={busy}
                        aria-label="Created to"
                      />
                    </div>
                  </div>
                  <div className="block">
                    <span className="text-xs font-medium text-muted">Updated from</span>
                    <div className="mt-1">
                      <DatePickerField
                        value={updatedFrom}
                        onChange={setUpdatedFrom}
                        disabled={busy}
                        aria-label="Updated from"
                      />
                    </div>
                  </div>
                  <div className="block">
                    <span className="text-xs font-medium text-muted">Updated to</span>
                    <div className="mt-1">
                      <DatePickerField
                        value={updatedTo}
                        onChange={setUpdatedTo}
                        disabled={busy}
                        aria-label="Updated to"
                      />
                    </div>
                  </div>
                  <label htmlFor="customers-export-account-status" className="block">
                    <span className="text-xs font-medium text-muted">Account status</span>
                    <select
                      id="customers-export-account-status"
                      value={accountStatus}
                      onChange={(e) => setAccountStatus(e.target.value as CustomersListFilters["accountStatus"])}
                      className="mt-1 w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-ink"
                      disabled={busy}
                    >
                      <option value="all">All</option>
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="proposed">Proposed</option>
                    </select>
                  </label>
                  <label htmlFor="customers-export-form-status" className="block">
                    <span className="text-xs font-medium text-muted">Onboarding form</span>
                    <select
                      id="customers-export-form-status"
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as FormStatusFilter)}
                      className="mt-1 w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-ink"
                      disabled={busy}
                    >
                      <option value="all">All</option>
                      <option value="draft">In progress (draft)</option>
                      <option value="completed">Completed</option>
                    </select>
                  </label>
          </div>
        </section>

              <section>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-ink">Columns</h4>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy || catalog.length === 0}
                      onClick={selectAllCols}
                      className="text-xs font-semibold text-brand hover:underline disabled:opacity-50"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={clearCols}
                      className="text-xs font-semibold text-muted hover:underline disabled:opacity-50"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div
                  className={`mt-3 grid grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 ${
                    isPageMode ? "max-h-[40vh]" : "max-h-52"
                  }`}
                >
                  {catalog.map((col) => (
                    <label
                      key={col.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-border-subtle px-2 py-1.5 text-sm hover:bg-surface-muted/60"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCols.has(col.id)}
                        onChange={() => toggleCol(col.id)}
                        disabled={busy}
                        className="rounded border-border"
                      />
                      <span className="text-ink">{col.label}</span>
                    </label>
                  ))}
                </div>
              </section>
        </div>

              <section className={`rounded-xl border border-border bg-surface-muted/40 p-4 ${isPageMode ? "min-h-[65vh]" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-ink">Preview</h4>
                  {previewStatusBadge(previewLoading, preview, columnsOrdered.length)}
                </div>

                {previewErr ? <p className="mt-2 text-sm text-red-400">{previewErr}</p> : null}

                {preview && preview.matchingCustomers.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-muted">Matching client names</p>
                    <ul className={`mt-2 flex flex-wrap gap-1.5 overflow-y-auto text-xs ${isPageMode ? "max-h-40" : "max-h-28"}`}>
                      {preview.matchingCustomers.map((m) => (
                        <li
                          key={m.id}
                          className="max-w-full truncate rounded-md border border-border-subtle bg-surface-raised px-2 py-0.5 text-ink"
                          title={m.name}
                        >
                          {m.name}
                        </li>
                      ))}
                    </ul>
                    {preview.matchingCustomersTruncated ? (
                      <p className="mt-1 text-xs text-muted">
                        Showing first {preview.matchingCustomers.length} names — more match your filters.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {preview && preview.total > 0 && preview.rows.length > 0 ? (
                  <div className={`mt-4 overflow-auto rounded-lg border border-border-subtle ${isPageMode ? "max-h-[48vh]" : "overflow-x-auto"}`}>
                    <table className="w-full min-w-[32rem] text-left text-xs">
                      <thead className="border-b border-border bg-surface-muted">
                        <tr>
                          {preview.headers.map((h) => (
                            <th key={h} className="whitespace-normal px-2 py-2 text-left text-[11px] font-semibold text-ink">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((row, ri) => (
                          <tr key={previewTableRowKey(preview.headers, row, ri)} className="border-b border-border-subtle last:border-0">
                            {row.map((cell, ci) => (
                              <td
                                key={`${preview.headers[ci] ?? ci}-${cell}`}
                                className="max-w-[14rem] truncate px-2 py-1.5 text-muted"
                                title={cell}
                              >
                                {cell || "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {preview.previewTruncated ? (
                      <p className="border-t border-border-subtle px-2 py-1.5 text-xs text-muted">
                        Table shows first {preview.previewRowLimit} rows only. Export includes all {preview.total}{" "}
                        matching customers.
                      </p>
                    ) : (
                      <p className="border-t border-border-subtle px-2 py-1.5 text-xs text-muted">
                        Export file will match this table for all {preview.total} row{preview.total === 1 ? "" : "s"}.
                      </p>
                    )}
                  </div>
                ) : null}

                {preview && preview.total === 0 && !previewLoading ? (
                  <p className="mt-3 text-sm text-muted">No customers match these filters.</p>
                ) : null}

                {preview?.exceedsExportCap ? (
                  <p className="mt-3 text-sm text-amber-200">
                    Too many rows for a single export ({preview.total} exceeds {preview.exportCap}). Narrow your
                    filters, then export.
                  </p>
                ) : null}
              </section>
      </div>

      {err ? <p className="mt-4 text-sm text-red-400">{err}</p> : null}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
        >
          {isPageMode ? "Back" : "Cancel"}
        </button>
              <button
                type="button"
                disabled={busy || !exportReady}
                title={exportCsvButtonTitle(exportReady, preview)}
                onClick={() => void runExport("csv")}
                className="rounded-lg border border-border bg-surface-muted px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted/80 disabled:opacity-50"
              >
                {busy ? "Working…" : "Export CSV"}
              </button>
        <button
          type="button"
          disabled={busy || !exportReady}
          onClick={() => void runExport("xlsx")}
          className="btn btn-primary btn-md"
        >
          {busy ? "Working…" : "Export Excel"}
        </button>
      </div>
    </div>
  );

  if (isPageMode) {
    return <div className="w-full">{content}</div>;
  }

  return (
    <>
      <ModalBackdrop disabled={busy} onClose={onClose} />
      <div className="fixed inset-0 z-50 overflow-y-auto pointer-events-none">
        <div className="flex min-h-full items-center justify-center p-4 pointer-events-auto">{content}</div>
      </div>
    </>
  );
}

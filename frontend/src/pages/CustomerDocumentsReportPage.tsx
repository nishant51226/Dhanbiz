import { useEffect, useMemo, useState } from "react";
import {
  createCustomerDocumentsExport,
  fetchCustomerDocumentsExportCandidates,
  fetchReportScopeCustomers,
  type CustomerDocumentsExportCandidate,
} from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Customer } from "../types/api";
import { DatePickerField } from "../components/DatePickerField";
import { SearchableCustomerSelect } from "../components/SearchableCustomerSelect";
import { reportCustomerOptionLabel } from "../utils/reportCustomerSelect";
import { formatLibraryDocumentUploadDateTime } from "../utils/libraryDocumentDate";

export type CustomerDocumentsLayoutMode =
  | "per_document"
  | "per_folder"
  | "per_date"
  | "invoice_register"
  | "statement_register";
export type CustomerDocumentsDateBasis = "effective" | "uploaded";

function defaultFromDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 30);
  return d.toISOString().slice(0, 10);
}

function defaultToDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function layoutRequiresDocumentSelection(layoutMode: CustomerDocumentsLayoutMode): boolean {
  return (
    layoutMode === "invoice_register" ||
    layoutMode === "statement_register" ||
    layoutMode === "per_document"
  );
}

function defaultSelectionForLayout(
  layoutMode: CustomerDocumentsLayoutMode,
  candidates: CustomerDocumentsExportCandidate[],
): Set<string> {
  if (layoutMode === "invoice_register") {
    return new Set(candidates.filter((c) => c.invoiceEligible).map((c) => c.id));
  }
  if (layoutMode === "statement_register") {
    return new Set(candidates.filter((c) => c.statementEligible).map((c) => c.id));
  }
  if (layoutMode === "per_document") {
    return new Set(candidates.map((c) => c.id));
  }
  return new Set();
}

export default function CustomerDocumentsReportPage() {
  const { apiBase, authHeaders, isAdmin, hasPermission } = useAuth();
  const canReadCustomers = isAdmin || hasPermission("customer:read");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customerId, setCustomerId] = useState("");
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [layoutMode, setLayoutMode] = useState<CustomerDocumentsLayoutMode>("invoice_register");
  const [dateBasis, setDateBasis] = useState<CustomerDocumentsDateBasis>("effective");
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<{ message: string; severity: "success" | "error" } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CustomerDocumentsExportCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set());

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
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load customers");
      })
      .finally(() => {
        if (!cancelled) setCustomersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, authHeaders, canReadCustomers, hasPermission]);

  const needsDocumentSelection = layoutRequiresDocumentSelection(layoutMode);
  const canLoadCandidates = Boolean(customerId.trim() && fromDate && toDate && needsDocumentSelection);

  useEffect(() => {
    if (!canLoadCandidates) {
      setCandidates([]);
      setCandidatesError(null);
      setSelectedDocumentIds(new Set());
      return;
    }

    let cancelled = false;
    setCandidatesLoading(true);
    setCandidatesError(null);

    void fetchCustomerDocumentsExportCandidates(apiBase, authHeaders(), {
      customerId: customerId.trim(),
      from: fromDate,
      to: toDate,
      layoutMode,
      dateBasis,
    })
      .then((list) => {
        if (cancelled) return;
        setCandidates(list);
        setSelectedDocumentIds(defaultSelectionForLayout(layoutMode, list));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setCandidates([]);
        setSelectedDocumentIds(new Set());
        setCandidatesError(e instanceof Error ? e.message : "Failed to load documents");
      })
      .finally(() => {
        if (!cancelled) setCandidatesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [apiBase, authHeaders, canLoadCandidates, customerId, fromDate, toDate, layoutMode, dateBasis]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId),
    [customers, customerId],
  );

  const visibleCandidates = useMemo(() => {
    if (layoutMode === "invoice_register") {
      return candidates.filter((c) => c.invoiceEligible);
    }
    if (layoutMode === "statement_register") {
      return candidates.filter((c) => c.statementEligible);
    }
    return candidates;
  }, [candidates, layoutMode]);

  const allVisibleSelected =
    visibleCandidates.length > 0 && visibleCandidates.every((c) => selectedDocumentIds.has(c.id));
  const someVisibleSelected =
    visibleCandidates.some((c) => selectedDocumentIds.has(c.id)) && !allVisibleSelected;

  const canExport =
    Boolean(customerId.trim() && fromDate && toDate && !exporting && !candidatesLoading) &&
    (!needsDocumentSelection || selectedDocumentIds.size > 0);

  const onToggleDocument = (id: string, checked: boolean) => {
    setSelectedDocumentIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const onToggleAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedDocumentIds((prev) => {
        const next = new Set(prev);
        for (const doc of visibleCandidates) next.delete(doc.id);
        return next;
      });
      return;
    }
    setSelectedDocumentIds((prev) => {
      const next = new Set(prev);
      for (const doc of visibleCandidates) next.add(doc.id);
      return next;
    });
  };

  const onExport = async () => {
    if (!canExport) return;
    setExporting(true);
    setError(null);
    setExportNotice(null);
    try {
      await createCustomerDocumentsExport(apiBase, authHeaders(), {
        customerId: customerId.trim(),
        from: fromDate,
        to: toDate,
        layoutMode,
        dateBasis,
        documentIds:
          needsDocumentSelection ? [...selectedDocumentIds] : undefined,
      });
      setExportNotice({
        severity: "success",
        message:
          "Excel export started. You will get a notification when the file is ready to download.",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Export failed";
      setError(msg);
      setExportNotice({ severity: "error", message: msg });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">Extraction Reports</h2>
        <p className="mt-1 text-sm text-muted">
          Download an Excel workbook for one customer and date range. Choose a detailed document layout, or an
          invoice register with columns Inv No, Invoice date, Page, Store name, Customer address, Supplier, Details, Gross, VAT, and Net (one row per invoice).
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <SearchableCustomerSelect
              customers={customers}
              value={customerId}
              onChange={setCustomerId}
              label="Customer"
              required
              size="small"
              disabled={customersLoading || exporting}
              getOptionLabel={reportCustomerOptionLabel}
              placeholder={customersLoading ? "Loading customers…" : "Search customers…"}
            />
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">From</span>
            <DatePickerField
              value={fromDate}
              onChange={setFromDate}
              disabled={exporting}
              aria-label="From date"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">To</span>
            <DatePickerField
              value={toDate}
              onChange={setToDate}
              disabled={exporting}
              aria-label="To date"
            />
          </label>

          <fieldset className="block sm:col-span-2">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Sheet layout</legend>
            <div className="flex flex-col gap-2 sm:flex-col sm:gap-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name="layoutMode"
                  checked={layoutMode === "invoice_register"}
                  onChange={() => setLayoutMode("invoice_register")}
                  disabled={exporting}
                />
                Invoice register (Inv No, Date, Page, Store, Customer address, Supplier, Details, Gross, VAT, Net)
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name="layoutMode"
                  checked={layoutMode === "statement_register"}
                  onChange={() => setLayoutMode("statement_register")}
                  disabled={exporting}
                />
                Statement register (Date, Description, Dr, Cr, Balance)
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name="layoutMode"
                  checked={layoutMode === "per_folder"}
                  onChange={() => setLayoutMode("per_folder")}
                  disabled={exporting}
                />
                One sheet per folder (multiple documents per folder)
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name="layoutMode"
                  checked={layoutMode === "per_date"}
                  onChange={() => setLayoutMode("per_date")}
                  disabled={exporting}
                />
                One sheet per date (multiple documents per day)
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name="layoutMode"
                  checked={layoutMode === "per_document"}
                  onChange={() => setLayoutMode("per_document")}
                  disabled={exporting}
                />
                One sheet per document (summary + per-page detail)
              </label>
            </div>
            <p className="mt-2 text-xs text-muted">
              {layoutMode === "invoice_register"
                ? "Flat invoice table: one row per invoice number with total Gross, VAT, and Net, sorted by date. Select invoice documents to include — newly uploaded files appear while extraction is still running."
                : layoutMode === "statement_register"
                  ? "Flat statement ledger: one row per transaction with Date, Description, Dr, Cr, and Balance. Select statement documents to include."
                : layoutMode === "per_document"
                  ? "One sheet per selected document with summary and per-page extraction detail."
                  : "Layout only changes how sheets are grouped. Content is always summary plus per-page extraction detail — never file images or line items."}
            </p>
          </fieldset>

          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Date basis</span>
            <select
              className="w-full max-w-md rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
              value={dateBasis}
              onChange={(e) => setDateBasis(e.target.value as CustomerDocumentsDateBasis)}
              disabled={exporting}
            >
              <option value="effective">Effective (document date, else upload)</option>
              <option value="uploaded">Uploaded at</option>
            </select>
          </label>
        </div>

        {needsDocumentSelection && canLoadCandidates ? (
          <div className="mt-4 rounded-lg border border-border-subtle bg-surface/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">Documents to include</h3>
              <span className="text-xs text-muted">
                {selectedDocumentIds.size} selected
                {visibleCandidates.length > 0 ? ` of ${visibleCandidates.length}` : ""}
              </span>
            </div>
            {candidatesLoading ? (
              <p className="mt-2 text-sm text-muted">Loading documents…</p>
            ) : candidatesError ? (
              <p className="mt-2 text-sm text-danger" role="alert">
                {candidatesError}
              </p>
            ) : visibleCandidates.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                {layoutMode === "invoice_register" && candidates.length > 0
                  ? "No invoice documents in this date range. Try One sheet per document to include other files."
                  : layoutMode === "invoice_register"
                    ? "No invoice documents found in this date range."
                    : layoutMode === "statement_register" && candidates.length > 0
                      ? "No statement documents in this date range. Try One sheet per document to include other files."
                      : layoutMode === "statement_register"
                        ? "No statement documents found in this date range."
                    : "No documents found in this date range."}
              </p>
            ) : (
              <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-border-subtle">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 bg-surface-muted/90">
                    <tr className="border-b border-border">
                      <th className="w-10 px-2 py-2">
                        <input
                          type="checkbox"
                          className="rounded border-border"
                          checked={allVisibleSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someVisibleSelected;
                          }}
                          aria-label="Select all documents"
                          disabled={exporting}
                          onChange={onToggleAllVisible}
                        />
                      </th>
                      <th className="px-2 py-2 font-semibold text-ink">Document</th>
                      <th className="px-2 py-2 font-semibold text-ink">Folder</th>
                      <th className="px-2 py-2 font-semibold text-ink">Type</th>
                      {layoutMode === "invoice_register" || layoutMode === "statement_register" ? (
                        <th className="px-2 py-2 font-semibold text-ink">Extraction</th>
                      ) : null}
                      <th className="px-2 py-2 font-semibold text-ink">Uploaded</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {visibleCandidates.map((doc) => {
                      const label = doc.name?.trim() || "Document";
                      return (
                        <tr key={doc.id} className="hover:bg-surface-muted/30">
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              className="rounded border-border"
                              checked={selectedDocumentIds.has(doc.id)}
                              aria-label={`Select ${label}`}
                              disabled={exporting}
                              onChange={(e) => onToggleDocument(doc.id, e.target.checked)}
                            />
                          </td>
                          <td className="max-w-[220px] truncate px-2 py-2 font-medium text-ink" title={label}>
                            {label}
                          </td>
                          <td className="max-w-[180px] truncate px-2 py-2 text-muted" title={doc.folderPath}>
                            {doc.folderPath || "—"}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-muted">{doc.documentType || "—"}</td>
                          {layoutMode === "invoice_register" || layoutMode === "statement_register" ? (
                            <td className="whitespace-nowrap px-2 py-2 text-muted">
                              {doc.extractionReady ? (
                                <span className="text-green-700">Ready</span>
                              ) : (
                                <span className="text-amber-700">Pending</span>
                              )}
                            </td>
                          ) : null}
                          <td className="whitespace-nowrap px-2 py-2 text-muted">
                            {doc.uploadedAt ? formatLibraryDocumentUploadDateTime(doc.uploadedAt) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {needsDocumentSelection && !candidatesLoading && visibleCandidates.length > 0 && selectedDocumentIds.size === 0 ? (
              <p className="mt-2 text-xs text-danger">Select at least one document to export.</p>
            ) : null}
          </div>
        ) : null}

        {selectedCustomer ? (
          <p className="mt-3 text-xs text-muted">
            Exporting documents for <span className="font-medium text-ink">{selectedCustomer.name}</span>.
          </p>
        ) : null}

        {exportNotice ? (
          <p
            className={`mt-3 text-sm ${exportNotice.severity === "success" ? "text-green-700" : "text-danger"}`}
            role="status"
          >
            {exportNotice.message}
          </p>
        ) : null}
        {error && !exportNotice ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
            disabled={!canExport}
            onClick={() => void onExport()}
          >
            {exporting ? "Starting export…" : "Start Excel export"}
          </button>
        </div>
      </div>
    </div>
  );
}

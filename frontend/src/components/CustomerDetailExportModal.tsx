import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  downloadCustomerSummaryExport,
  fetchCustomerSummaryExportCatalog,
  postCustomerSummaryExportPreview,
  type CustomerSummaryExportPreview,
} from "../api/client";
import { CustomerDetailExportColumnGroups } from "./customer-export/CustomerDetailExportColumnGroups";
import { ExportModalDialog } from "./ui/ExportModalDialog";

export type CustomerDetailExportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
  authHeaders: () => HeadersInit;
  customerId: string;
  customer: { id: string; name: string } | null;
};

type ExportCatalogColumn = Awaited<ReturnType<typeof fetchCustomerSummaryExportCatalog>>["columns"][number];

async function loadCustomerExportCatalog(
  apiBase: string,
  authHeaders: () => HeadersInit,
): Promise<ExportCatalogColumn[]> {
  const { columns } = await fetchCustomerSummaryExportCatalog(apiBase, authHeaders());
  return columns;
}

function CustomerDetailExportPreviewTable({ preview }: Readonly<{ preview: CustomerSummaryExportPreview }>) {
  if (preview.headers.length === 0) return null;

  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-border-subtle">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-muted">
            {preview.headers.map((h) => (
              <th
                key={h}
                className="whitespace-normal px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {preview.values.map((cell, i) => (
              <td
                key={preview.headers[i] ?? `col-${i}`}
                className="max-w-[12rem] border-b border-border-subtle px-3 py-2.5 align-top text-muted"
                title={cell}
              >
                <span className="line-clamp-4 break-words">{cell || "—"}</span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function CustomerDetailExportModal({
  isOpen,
  onClose,
  apiBase,
  authHeaders,
  customerId,
  customer,
}: Readonly<CustomerDetailExportModalProps>) {
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof fetchCustomerSummaryExportCatalog>>["columns"]>([]);
  const [catalogErr, setCatalogErr] = useState("");
  const [filter, setFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [preview, setPreview] = useState<CustomerSummaryExportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErr, setPreviewErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const previewReq = useRef(0);

  const columnsOrdered = useMemo(() => catalog.filter((c) => selectedIds.has(c.id)).map((c) => c.id), [catalog, selectedIds]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setCatalogErr("");
    void loadCustomerExportCatalog(apiBase, authHeaders)
      .then((columns) => {
        if (cancelled) return;
        setCatalog(columns);
        setSelectedIds(new Set(columns.filter((c) => c.defaultOn).map((c) => c.id)));
        setFilter("");
        setPreview(null);
        setPreviewErr("");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setCatalog([]);
        setCatalogErr(e instanceof Error ? e.message : "Failed to load columns");
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, apiBase, authHeaders]);

  useEffect(() => {
    if (!isOpen || !customerId || columnsOrdered.length === 0) {
      setPreview(null);
      setPreviewErr("");
      setPreviewLoading(false);
      return;
    }
    const handle = globalThis.setTimeout(() => {
      const my = ++previewReq.current;
      setPreviewLoading(true);
      setPreviewErr("");
      void (async () => {
        try {
          const data = await postCustomerSummaryExportPreview(apiBase, authHeaders(), customerId, columnsOrdered);
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
    }, 320);
    return () => globalThis.clearTimeout(handle);
  }, [isOpen, apiBase, authHeaders, customerId, columnsOrdered]);

  useEffect(() => {
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
  }, [isOpen, onClose, busy]);

  const visibleCatalog = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((c) => c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
  }, [catalog, filter]);

  const toggleId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const selectAll = useCallback(() => setSelectedIds(new Set(catalog.map((c) => c.id))), [catalog]);
  const clearAll = useCallback(() => setSelectedIds(new Set()), []);

  const runDownload = useCallback(
    async (format: "csv" | "xlsx") => {
      if (!customerId || columnsOrdered.length === 0) return;
      setErr("");
      setBusy(true);
      try {
        await downloadCustomerSummaryExport(apiBase, authHeaders(), customerId, format, columnsOrdered);
        onClose();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Export failed");
      } finally {
        setBusy(false);
      }
    },
    [apiBase, authHeaders, customerId, columnsOrdered, onClose],
  );

  const exportReady = columnsOrdered.length > 0 && !previewLoading && !previewErr && !!preview;

  if (!isOpen || !customer) return null;

  return (
    <ExportModalDialog open={isOpen} onClose={onClose} disabled={busy} titleId="customer-detail-export-title">
      <button
        type="button"
        disabled={busy}
        onClick={onClose}
        className="absolute right-4 top-4 text-muted-soft hover:text-muted disabled:opacity-50"
      >
        ✕
      </button>

      <h3 id="customer-detail-export-title" className="text-lg font-semibold text-ink">
        Export data
      </h3>
      <p className="mt-1 text-sm text-muted">
        Tick the fields you need (same kinds of values as on Customer Details). The preview matches the CSV/Excel layout:
        one header row and one data row.
      </p>

      {catalogErr ? <p className="mt-3 text-sm text-red-400">{catalogErr}</p> : null}

      <CustomerDetailExportColumnGroups
        catalog={catalog}
        visibleCatalog={visibleCatalog}
        selectedIds={selectedIds}
        filter={filter}
        busy={busy}
        onFilterChange={setFilter}
        onToggleId={toggleId}
        onSelectAll={selectAll}
        onClearAll={clearAll}
      />

      {catalog.length > 0 ? (
        <section className="mt-6 rounded-xl border border-border bg-surface-muted/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-ink">Preview</h4>
            {previewLoading ? <span className="text-xs text-muted">Updating…</span> : null}
            {columnsOrdered.length === 0 ? (
              <span className="text-xs text-feedback-warning">Select at least one column</span>
            ) : null}
          </div>
          {previewErr ? <p className="mt-2 text-sm text-red-400">{previewErr}</p> : null}
          {preview ? <CustomerDetailExportPreviewTable preview={preview} /> : null}
        </section>
      ) : null}

      {err ? <p className="mt-4 text-sm text-red-400">{err}</p> : null}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !exportReady}
          title={exportReady ? undefined : "Select columns and wait for preview"}
          onClick={() => void runDownload("csv")}
          className="rounded-lg border border-border bg-surface-muted px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted/80 disabled:opacity-50"
        >
          {busy ? "Working…" : "Export CSV"}
        </button>
        <button
          type="button"
          disabled={busy || !exportReady}
          onClick={() => void runDownload("xlsx")}
          className="btn btn-primary btn-md"
        >
          {busy ? "Working…" : "Export Excel"}
        </button>
      </div>
    </ExportModalDialog>
  );
}

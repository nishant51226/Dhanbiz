import { useCallback, useEffect, useState } from "react";
import { fetchPortalSuppliersAll, uploadFilesForSupplierMany } from "../api/client";
import { SelectedFilesList } from "./SelectedFilesList";
import type { PortalSupplierOption } from "../types/api";
import {
  describeRejectedUploadFiles,
  formatUploadFailureSummary,
  MAX_UPLOAD_FILE_MB,
  pickUploadableFiles,
  UPLOAD_FILE_ACCEPT,
  UPLOAD_FILE_TYPES_HINT,
  type UploadProgress,
} from "../utils/uploadableFiles";

type Props = {
  open: boolean;
  onClose: () => void;
  apiBase: string;
  headers: HeadersInit;
  customerId: string;
  runExtraction: boolean;
  onUploaded: () => void;
};

export function PortalSupplierUploadModal({
  open,
  onClose,
  apiBase,
  headers,
  customerId,
  runExtraction,
  onUploaded,
}: Props) {
  const [supplierFolderId, setSupplierFolderId] = useState("");
  const [pickedFiles, setPickedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [suppliers, setSuppliers] = useState<PortalSupplierOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const selectedRow = suppliers.find((s) => s.folderId === supplierFolderId);
  const globalFolderOptions = suppliers.filter((s) => s.disambiguation === "Global");
  const customerFolderOptions = suppliers.filter((s) => s.disambiguation !== "Global");

  const reloadSuppliers = useCallback(async () => {
    try {
      const list = await fetchPortalSuppliersAll(apiBase, headers, { customerId });
      setSuppliers(list);
    } catch {
      setSuppliers([]);
    }
  }, [apiBase, headers, customerId]);

  useEffect(() => {
    if (!open) return;
    void reloadSuppliers();
    setErr("");
    setSupplierFolderId("");
    setPickedFiles([]);
    setUploadProgress(null);
  }, [open, reloadSuppliers]);

  useEffect(() => {
    if (!open || suppliers.length === 0) return;
    const defaultFolder = suppliers.find((s) => s.isDefault);
    if (!defaultFolder) return;
    setSupplierFolderId((id) => {
      const cur = id.trim();
      if (cur && suppliers.some((s) => s.folderId === cur)) return id;
      return defaultFolder.folderId;
    });
  }, [open, suppliers]);

  const onSelectExisting = (id: string) => {
    setSupplierFolderId(id);
    setErr("");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (pickedFiles.length === 0) {
      setErr(`Choose one or more files (${UPLOAD_FILE_TYPES_HINT}).`);
      return;
    }
    const folderId = supplierFolderId.trim();
    const row = suppliers.find((s) => s.folderId === folderId);
    if (!row?.libraryKind) {
      setErr("Select a destination folder.");
      return;
    }
    setBusy(true);
    setUploadProgress(null);
    try {
      const { results, failures } = await uploadFilesForSupplierMany(apiBase, headers, {
        files: pickedFiles,
        customerId,
        librarySection: row.libraryKind,
        supplierFolderId: folderId,
        runExtraction,
        onProgress: setUploadProgress,
      });

      if (results.length > 0) onUploaded();
      if (failures.length > 0) {
        const summary = formatUploadFailureSummary(failures);
        if (results.length === 0) {
          setErr(summary);
          return;
        }
        setErr(`${results.length} uploaded; ${summary}`);
        return;
      }
      onClose();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Upload failed");
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-ink">Upload files</h3>
        <p className="mt-1 text-xs text-muted">Pick a global or customer-specific folder for your upload.</p>
        <form className="mt-4 space-y-3" onSubmit={(e) => void onSubmit(e)}>
          {err ? <p className="text-xs text-red-400">{err}</p> : null}

          <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
            Destination folder
            <select
              value={supplierFolderId}
              onChange={(e) => onSelectExisting(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface-input px-3 py-2 text-sm text-ink"
            >
              <option value="">Select folder</option>
              {globalFolderOptions.length > 0 ? (
                <optgroup label="Global folders">
                  {globalFolderOptions.map((s) => (
                    <option key={s.folderId} value={s.folderId}>
                      {s.label}
                      {s.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {customerFolderOptions.length > 0 ? (
                <optgroup label="Customer-specific folders">
                  {customerFolderOptions.map((s) => (
                    <option key={s.folderId} value={s.folderId}>
                      {s.label}
                      {s.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>

          {supplierFolderId.trim() && selectedRow ? (
            <div className="rounded-lg border border-border bg-surface-muted/60 px-3 py-2">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted">Selected folder</span>
              <p className="mt-1 text-sm font-medium text-ink">
                {selectedRow.label}
                <span className="ml-2 text-xs font-normal text-muted">
                  ({selectedRow.disambiguation === "Global" ? "Global" : "Customer-specific"}
                  {selectedRow.isDefault ? " · default" : ""})
                </span>
              </p>
            </div>
          ) : null}

          <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
            Files
            <input
              type="file"
              multiple
              accept={UPLOAD_FILE_ACCEPT}
              onChange={(e) => {
                const { files, rejectedType, rejectedSize } = pickUploadableFiles(e.target.files);
                setPickedFiles(files);
                const rejectMsg = describeRejectedUploadFiles(rejectedType, rejectedSize);
                if (rejectMsg) {
                  setErr(rejectMsg);
                } else {
                  setErr("");
                }
                e.target.value = "";
              }}
              className="mt-1 block w-full text-sm text-ink-soft file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-brand-foreground"
            />
            <SelectedFilesList
              files={pickedFiles}
              onRemove={(index) => setPickedFiles((prev) => prev.filter((_, i) => i !== index))}
            />
            <span className="mt-1 block text-[10px] font-normal normal-case tracking-normal text-muted">
              {UPLOAD_FILE_TYPES_HINT}, max {MAX_UPLOAD_FILE_MB} MB each
              {pickedFiles.length > 1 ? ` · ${pickedFiles.length} selected` : ""}
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-muted"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !customerId || pickedFiles.length === 0 || !supplierFolderId.trim()}
              className="btn btn-primary btn-sm"
            >
              {busy && uploadProgress
                ? `Uploading ${uploadProgress.completed}/${uploadProgress.total}…`
                : busy
                  ? "Uploading..."
                  : pickedFiles.length > 1
                    ? `Upload ${pickedFiles.length} files`
                    : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

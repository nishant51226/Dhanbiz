import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  fetchPortalSuppliers,
  fetchPortalSuppliersAll,
  uploadFile,
  uploadLibraryDocuments,
} from "../api/client";
import { SelectedFilesList } from "./SelectedFilesList";
import { SearchableCustomerSelect } from "./SearchableCustomerSelect";
import {
  DEFAULT_UPLOAD_CONCURRENCY,
  describeRejectedUploadFiles,
  formatUploadFailureSummary,
  MAX_UPLOAD_FILE_MB,
  pickUploadableFiles,
  shouldLeadSequentialFolderUpload,
  UPLOAD_FILE_ACCEPT,
  UPLOAD_FILE_TYPES_HINT,
  uploadFilesWithConcurrency,
  type UploadProgress,
} from "../utils/uploadableFiles";
import { customerFolderNameExists } from "../utils/libraryFolderDisplayName";
import {
  EXTRACT_DOCUMENT_OPTIONS,
  type ExtractDocumentKind,
  structurePromptFor,
  visionPromptFor,
} from "../constants/extractDocumentPresets";
import type {
  DriveFile,
  JobRow,
  PortalLibrarySection,
  PortalSupplierOption,
} from "../types/api";

export type FileUploadCategory = "files" | "invoices" | "statements";

export type UploadDialogResult = {
  file?: DriveFile;
  document?: { id: string; name?: string };
  job: JobRow | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  apiBase: string;
  headers: HeadersInit;
  /** Tenant for drive uploads, or fallback when no `customers` picker. May be empty when using picker only. */
  customerId: string;
  parentId: string | null;
  onUploaded: (payload: UploadDialogResult) => void;
  /**
   * `drive` = POST /files/upload (drive tree). `library` = presigned S3 only (`upload-s3/init` → PUT → `complete`; requires API `S3_AWS_BUCKET`).
   */
  uploadTarget?: "drive" | "library";
  /**
   * When true, show Files / Statement / Invoices before the file picker.
   * For `drive`, paths use the supplier-style **files** tree. For `library`, paths use **folders/documents**.
   */
  showUploadCategory?: boolean;
  /**
   * With `uploadTarget: "library"`, show a customer dropdown. Pre-filled from `customerPickerInitialId` or `customerId` when valid.
   */
  customers?: Array<{ id: string; name: string }>;
  /** Preferred customer id when opening the picker (e.g. Files page table filter). */
  customerPickerInitialId?: string;
  /**
   * When true (e.g. customer-portal JWT or staff customer workspace), never show the library
   * customer dropdown; uploads use `customerId` from props only.
   */
  hideLibraryCustomerPicker?: boolean;
};

export function UploadDialog({
  open,
  onClose,
  apiBase,
  headers,
  customerId,
  parentId,
  onUploaded,
  uploadTarget = "drive",
  showUploadCategory = false,
  customers,
  customerPickerInitialId,
  hideLibraryCustomerPicker = false,
}: Props) {
  const categorised = showUploadCategory || uploadTarget === "library";
  const unifiedLibraryUpload = uploadTarget === "library";
  const showLibraryCustomerPicker =
    uploadTarget === "library" &&
    !hideLibraryCustomerPicker &&
    Boolean(customers && customers.length > 0);
  const showLibraryCustomerSection = showLibraryCustomerPicker;
  const [libraryCustomerId, setLibraryCustomerId] = useState("");
  const [files, setFiles] = useState<globalThis.File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadCategory, setUploadCategory] = useState<FileUploadCategory>("invoices");
  const [runExtraction, setRunExtraction] = useState(true);
  const [documentKind, setDocumentKind] = useState<ExtractDocumentKind>("invoice");
  const [visionPrompt, setVisionPrompt] = useState("");
  const [structurePrompt, setStructurePrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /** Supplier folder label (drive / non-unified library); new supplier name for invoices & statements. */
  const [supplierLabel, setSupplierLabel] = useState("");
  /** Unified library upload: optional new customer-specific folder under Files (mutually exclusive with picking a folder). */
  const [newFilesFolderName, setNewFilesFolderName] = useState("");
  const [supplierFolderId, setSupplierFolderId] = useState("");
  const [supplierOptions, setSupplierOptions] = useState<PortalSupplierOption[]>([]);
  const isFilesCategory = !unifiedLibraryUpload && uploadCategory === "files";
  const customerScopedLibrarySession = uploadTarget === "library" && hideLibraryCustomerPicker;
  const allowNewFilesFolderFromUpload = !customerScopedLibrarySession;
  const globalFolderOptions = supplierOptions.filter((s) => s.disambiguation === "Global" && !s.isRestricted);
  const restrictedFolderOptions = supplierOptions.filter((s) => s.isRestricted);
  const customerFolderOptions = supplierOptions.filter((s) => s.disambiguation !== "Global" && !s.isRestricted);
  const showUnifiedNewFilesFolderInput = unifiedLibraryUpload && allowNewFilesFolderFromUpload;

  useEffect(() => {
    if (!open) {
      setFiles([]);
      setUploadProgress(null);
      setErr("");
      setRunExtraction(true);
      setDocumentKind("invoice");
      setUploadCategory("invoices");
      setSupplierLabel("");
      setNewFilesFolderName("");
      setSupplierFolderId("");
      setSupplierOptions([]);
      setLibraryCustomerId("");
    }
  }, [open]);

  useEffect(() => {
    if (!open || uploadTarget !== "library") return;
    if (customers && customers.length > 0) {
      const valid = (id: string | undefined) =>
        Boolean(id?.trim() && customers.some((c) => c.id === id));
      const pick =
        (valid(customerPickerInitialId) && customerPickerInitialId) ||
        (valid(customerId) && customerId) ||
        "";
      setLibraryCustomerId(pick);
    } else {
      setLibraryCustomerId(customerId.trim());
    }
  }, [open, uploadTarget, customers, customerPickerInitialId, customerId]);

  useEffect(() => {
    if (!open || !categorised) return;
    const cid =
      uploadTarget === "library" && showLibraryCustomerPicker
        ? libraryCustomerId.trim()
        : customerId.trim();
    if (!cid) {
      setSupplierOptions([]);
      setSupplierFolderId("");
      setNewFilesFolderName("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = unifiedLibraryUpload
          ? await fetchPortalSuppliersAll(apiBase, headers, { customerId: cid })
          : await fetchPortalSuppliers(apiBase, headers, {
              customerId: cid,
              librarySection: uploadCategory,
            });
        if (cancelled) return;
        setSupplierOptions(list);
      } catch {
        if (cancelled) return;
        setSupplierOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    categorised,
    unifiedLibraryUpload,
    uploadTarget,
    showLibraryCustomerPicker,
    libraryCustomerId,
    customerId,
    uploadCategory,
    apiBase,
    headers,
  ]);

  /** Pre-select the configured default folder (`folder_defaults`), not the first list item. */
  useEffect(() => {
    if (!open || !categorised) return;
    if (newFilesFolderName.trim()) return;
    if (supplierOptions.length === 0) return;
    const defaultFolder = supplierOptions.find((s) => s.isDefault);
    if (!defaultFolder) return;
    setSupplierFolderId((id) => {
      const cur = id.trim();
      if (cur && supplierOptions.some((s) => s.folderId === cur)) return id;
      return defaultFolder.folderId;
    });
  }, [open, categorised, supplierOptions, newFilesFolderName]);

  useEffect(() => {
    if (!open || !categorised || unifiedLibraryUpload) return;
    if (uploadCategory === "files") {
      setRunExtraction(true);
      setDocumentKind("invoice");
    } else if (uploadCategory === "invoices") {
      setRunExtraction(true);
      setDocumentKind("invoice");
    } else {
      setRunExtraction(true);
      setDocumentKind("bank_statement");
    }
    setSupplierFolderId("");
    setSupplierLabel("");
  }, [open, categorised, unifiedLibraryUpload, uploadCategory]);

  useEffect(() => {
    if (!open || !categorised || !unifiedLibraryUpload) return;
    const row = supplierOptions.find((s) => s.folderId === supplierFolderId.trim());
    const lk = row?.libraryKind;
    if (!lk) return;
    if (lk === "statements") {
      setRunExtraction(true);
      setDocumentKind("bank_statement");
    } else {
      setRunExtraction(true);
      setDocumentKind("invoice");
    }
  }, [open, categorised, unifiedLibraryUpload, supplierFolderId, supplierOptions]);

  useEffect(() => {
    setVisionPrompt(visionPromptFor(documentKind));
    setStructurePrompt(structurePromptFor(documentKind));
  }, [documentKind]);

  if (!open) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    if (files.length === 0) {
      setErr("Choose one or more files.");
      return;
    }
    const effectiveCustomerId =
      uploadTarget === "library" && showLibraryCustomerPicker
        ? libraryCustomerId.trim()
        : customerId.trim();
    if (!effectiveCustomerId) {
      setErr(
        showLibraryCustomerPicker
          ? "Select a customer."
          : uploadTarget === "library"
            ? "Customer is required. Check that customers loaded, or pick one from the list."
            : "Missing customer.",
      );
      return;
    }
    if (uploadTarget === "library" && unifiedLibraryUpload) {
      const folderId = supplierFolderId.trim();
      const row = supplierOptions.find((s) => s.folderId === folderId);
      const newFiles =
        allowNewFilesFolderFromUpload && newFilesFolderName.trim() && !folderId;
      if (!row && !newFiles) {
        setErr(
          allowNewFilesFolderFromUpload
            ? "Select a destination folder, or enter a new Files folder name."
            : "Select a destination folder.",
        );
        return;
      }
      if (newFiles && customerFolderNameExists(newFilesFolderName, supplierOptions)) {
        setErr("Folder name already exists");
        return;
      }
    }
    setBusy(true);
    setUploadProgress(null);
    try {
      const commonParams = {
        customerId: effectiveCustomerId,
        runExtraction,
        visionPrompt: runExtraction ? visionPrompt : undefined,
        structurePrompt: runExtraction ? structurePrompt : undefined,
      };

      if (uploadTarget === "library") {
        const row = supplierOptions.find((s) => s.folderId === supplierFolderId.trim());
        const libraryKind: PortalLibrarySection = unifiedLibraryUpload
          ? row?.libraryKind ?? "files"
          : uploadCategory;
        const isTargetFilesLibrary = libraryKind === "files";
        const supplierFolderIdOpt = supplierFolderId.trim() || undefined;
        const supplierNameOpt = isTargetFilesLibrary
          ? !allowNewFilesFolderFromUpload
            ? undefined
            : supplierFolderIdOpt
              ? undefined
              : newFilesFolderName.trim() || undefined
          : supplierFolderIdOpt
            ? undefined
            : supplierLabel.trim() || undefined;

        const { results, failures } = await uploadLibraryDocuments(apiBase, headers, {
          files,
          libraryKind,
          supplierFolderId: supplierFolderIdOpt,
          supplierName: supplierNameOpt,
          ...commonParams,
          onProgress: setUploadProgress,
        });

        if (results.length > 0) {
          const last = results[results.length - 1]!;
          onUploaded({
            document: { id: last.document.id, name: last.document.name },
            job: last.job,
          });
        }
        if (failures.length > 0) {
          const summary = formatUploadFailureSummary(failures);
          if (results.length === 0) {
            setErr(summary);
            return;
          }
          setErr(`${results.length} uploaded; ${summary}`);
          return;
        }
      } else {
        const librarySection: PortalLibrarySection | undefined = categorised
          ? uploadCategory
          : undefined;
        const supplierFolderIdOpt = categorised ? supplierFolderId.trim() || undefined : undefined;
        const supplierNameOpt = categorised
          ? isFilesCategory
            ? supplierFolderIdOpt
              ? undefined
              : supplierLabel.trim() || undefined
            : supplierFolderIdOpt
              ? undefined
              : supplierLabel.trim() || undefined
          : undefined;

        const { results, failures } = await uploadFilesWithConcurrency(
          files,
          (oneFile) =>
            uploadFile(apiBase, headers, {
              file: oneFile,
              parentId: categorised ? undefined : parentId ?? undefined,
              librarySection: librarySection ?? undefined,
              supplierFolderId: supplierFolderIdOpt,
              supplierName: supplierNameOpt,
              ...commonParams,
            }),
          {
            onProgress: setUploadProgress,
            leadSequential: shouldLeadSequentialFolderUpload({
              supplierFolderId: supplierFolderIdOpt,
              supplierName: supplierNameOpt,
            }),
          },
        );

        if (results.length > 0) {
          const last = results[results.length - 1]!;
          onUploaded({ file: last.file, job: last.job });
        }
        if (failures.length > 0) {
          const summary = formatUploadFailureSummary(failures);
          if (results.length === 0) {
            setErr(summary);
            return;
          }
          setErr(`${results.length} uploaded; ${summary}`);
          return;
        }
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface-raised p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-ink">{uploadTarget === "library" ? "Add files" : "Add file"}</h2>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          {showLibraryCustomerPicker ? (
            <div className="rounded-lg border border-border bg-surface-muted/50 p-3">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted">1. Customer</span>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink">Who is this upload for?</span>
                <SearchableCustomerSelect
                  customers={customers!}
                  value={libraryCustomerId}
                  onChange={setLibraryCustomerId}
                  placeholder="Search customers…"
                  required
                />
              </label>
            </div>
          ) : null}
          {categorised ? (
            <div className="rounded-lg border border-border bg-surface-muted/50 p-3">
              {!unifiedLibraryUpload ? (
                <>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted">
                    {showLibraryCustomerSection ? "2. Library type" : "Upload as"}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        {
                          id: "files" as const,
                          label: "Files",
                          hint: "Folder path under Files · queue extraction",
                        },
                        { id: "invoices" as const, label: "Invoice", hint: "Supplier path · invoice extraction" },
                        { id: "statements" as const, label: "Statement", hint: "Supplier path · statement extraction" },
                      ] as const
                    ).map((opt) => {
                      const active = uploadCategory === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setUploadCategory(opt.id)}
                          className={`min-w-[5.5rem] flex-1 rounded-lg border px-3 py-2 text-left text-sm font-semibold transition ${
                            active
                              ? "border-brand bg-brand/15 text-brand ring-1 ring-brand/40"
                              : "border-border bg-surface-raised text-ink hover:bg-surface-muted"
                          }`}
                        >
                          {opt.label}
                          <span className="mt-0.5 block text-[10px] font-normal leading-tight text-muted">{opt.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted">
                  {showLibraryCustomerSection ? "2. Folder" : "Folder"}
                </span>
              )}
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-medium text-muted">
                  {showLibraryCustomerSection ? "3. " : ""}
                  {unifiedLibraryUpload ? "Destination folder" : `Existing ${isFilesCategory ? "folder" : "supplier"}`}
                </span>
                {unifiedLibraryUpload || isFilesCategory ? (
                  <select
                    value={supplierFolderId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSupplierFolderId(id);
                      setNewFilesFolderName("");
                      if (!unifiedLibraryUpload) {
                        const hit = supplierOptions.find((s) => s.folderId === id);
                        setSupplierLabel(hit?.label ?? "");
                      }
                    }}
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
                    {restrictedFolderOptions.length > 0 ? (
                      <optgroup label="Restricted folders">
                        {restrictedFolderOptions.map((s) => (
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
                ) : (
                  <select
                    value={supplierFolderId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSupplierFolderId(id);
                      setNewFilesFolderName("");
                      const hit = supplierOptions.find((s) => s.folderId === id);
                      setSupplierLabel(hit?.label ?? "");
                    }}
                    className="w-full rounded-lg border border-border bg-surface-input px-3 py-2 text-sm text-ink"
                  >
                    <option value="">New supplier (use name below)</option>
                    {supplierOptions.map((s) => (
                      <option key={s.folderId} value={s.folderId}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              {((isFilesCategory && allowNewFilesFolderFromUpload) || showUnifiedNewFilesFolderInput) &&
              !supplierFolderId.trim() ? (
                <label className="mt-2 block">
                  <span className="mb-1 block text-xs font-medium text-muted">New folder name (customer-specific)</span>
                  <input
                    value={unifiedLibraryUpload ? newFilesFolderName : supplierLabel}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (unifiedLibraryUpload) {
                        setNewFilesFolderName(v);
                        if (v.trim()) {
                          setSupplierFolderId("");
                          setSupplierLabel("");
                        }
                      } else {
                        setSupplierLabel(v);
                        if (v.trim()) setSupplierFolderId("");
                      }
                    }}
                    placeholder="Create a new customer folder"
                    className="w-full rounded-lg border border-border bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-muted"
                  />
                </label>
              ) : null}
              {!unifiedLibraryUpload && !isFilesCategory ? (
                <label className="mt-2 block">
                  <span className="mb-1 block text-xs font-medium text-muted">Supplier name (new supplier)</span>
                  <input
                    value={supplierLabel}
                    onChange={(e) => {
                      setSupplierLabel(e.target.value);
                      if (e.target.value.trim()) setSupplierFolderId("");
                    }}
                    placeholder="Defaults to “Upload”"
                    className="w-full rounded-lg border border-border bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-muted"
                  />
                </label>
              ) : null}
              <p className="mt-1 block text-[10px] text-muted-soft">
                {unifiedLibraryUpload ? (
                  <>File is stored in the selected folder, or in a new customer-specific folder you create below.</>
                ) : (
                  <>
                    File is stored under{" "}
                    <span className="font-medium text-ink-soft">
                      {uploadCategory === "invoices" ? "Invoices / selected supplier folder" : ""}
                      {uploadCategory === "statements" ? "Statements / selected supplier folder" : ""}
                      {uploadCategory === "files"
                        ? allowNewFilesFolderFromUpload
                          ? "Files / selected folder or new folder name"
                          : "Files / default library folder if none selected"
                        : ""}
                    </span>
                    .
                  </>
                )}
              </p>
            </div>
          ) : null}
          <label className="block">
            <span className="mb-1 block text-sm font-medium">
              {showLibraryCustomerSection && categorised ? "4. " : ""}Files
            </span>
            <input
              type="file"
              multiple
              accept={UPLOAD_FILE_ACCEPT}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand"
              onChange={(e) => {
                const { files: picked, rejectedType, rejectedSize } = pickUploadableFiles(e.target.files);
                setFiles(picked);
                const rejectMsg = describeRejectedUploadFiles(rejectedType, rejectedSize);
                if (rejectMsg) {
                  setErr(rejectMsg);
                } else {
                  setErr("");
                }
                e.target.value = "";
              }}
            />
            <SelectedFilesList
              files={files}
              onRemove={(index) => setFiles((prev) => prev.filter((_, i) => i !== index))}
            />
            <p className="mt-1 text-xs text-muted">
              {UPLOAD_FILE_TYPES_HINT}, max {MAX_UPLOAD_FILE_MB} MB each.
              {files.length > 1
                ? ` ${files.length} selected — one batch API request, up to ${DEFAULT_UPLOAD_CONCURRENCY} S3 uploads at a time.`
                : null}
            </p>
          </label>
          {!categorised ? (
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                className="mt-1 shrink-0"
                checked={runExtraction}
                onChange={(e) => setRunExtraction(e.target.checked)}
              />
              <span>
                <span className="text-sm font-medium">Queue extraction file task</span>
                <span className="mt-0.5 block text-xs font-normal text-muted">
                  On by default. Turn off to upload and store the file only (no file task). Extraction
                  applies to PDF and images only.
                </span>
              </span>
            </label>
          ) : null}
          {runExtraction ? (
            <>
              {!categorised ? (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Document type</span>
                  <select
                    value={documentKind}
                    onChange={(e) => setDocumentKind(e.target.value as ExtractDocumentKind)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    {EXTRACT_DOCUMENT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          ) : null}
          {err ? <p className="text-sm text-red-400">{err}</p> : null}
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-soft hover:bg-surface-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || files.length === 0}
              className="btn btn-primary btn-md"
            >
              {busy && uploadProgress
                ? `Uploading ${uploadProgress.completed}/${uploadProgress.total}…`
                : busy
                  ? "Uploading…"
                  : files.length > 1
                    ? `Upload ${files.length} files`
                    : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  fetchExtractConfig,
  fetchPortalSuppliersAll,
  fetchStaffScopedActiveCustomers,
  uploadFilesForSupplierMany,
} from "../api/client";
import { SelectedFilesList } from "../components/SelectedFilesList";
import { SearchableCustomerSelect } from "../components/SearchableCustomerSelect";
import {
  describeRejectedUploadFiles,
  formatUploadFailureSummary,
  MAX_UPLOAD_FILE_MB,
  pickUploadableFiles,
  type UploadProgress,
} from "../utils/uploadableFiles";
import { customerFolderNameExists } from "../utils/libraryFolderDisplayName";
import {
  type ExtractDocumentKind,
  structurePromptFor,
  visionPromptFor,
} from "../constants/extractDocumentPresets";
import { useAuth } from "../auth/AuthContext";
import type { AiProviderId, Customer, ExtractConfig, PortalLibrarySection, PortalSupplierOption } from "../types/api";

function promptKindForLibrary(section: PortalLibrarySection): ExtractDocumentKind {
  if (section === "statements") return "bank_statement";
  return "invoice";
}

export type NewJobPageStaffEmbed = {
  customerId: string;
  customerName?: string;
};

type NewJobPageProps = {
  staffEmbed?: NewJobPageStaffEmbed;
};

export default function NewJobPage({ staffEmbed }: NewJobPageProps = {}) {
  const { apiBase, authHeaders, isAdmin, hasPermission } = useAuth();
  const canReadCustomers = isAdmin || hasPermission("customer:read");
  const canReadFiles = hasPermission("file:read");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedCustomerId =
    staffEmbed?.customerId ?? searchParams.get("customerId")?.trim() ?? "";
  const lockCustomer = Boolean(staffEmbed) || Boolean(preselectedCustomerId);
  const preselectedCustomerName =
    staffEmbed?.customerName ?? searchParams.get("customerName")?.trim() ?? "";
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [defaults, setDefaults] = useState<ExtractConfig | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [suppliers, setSuppliers] = useState<PortalSupplierOption[]>([]);
  const [supplierFolderId, setSupplierFolderId] = useState("");
  const [newFilesFolderName, setNewFilesFolderName] = useState("");
  const selectedSupplierRow = suppliers.find((s) => s.folderId === supplierFolderId);
  const globalFolderOptions = suppliers.filter((s) => s.disambiguation === "Global");
  const customerFolderOptions = suppliers.filter((s) => s.disambiguation !== "Global");
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [documentKind, setDocumentKind] = useState<ExtractDocumentKind>("invoice");
  const [advanced, setAdvanced] = useState(false);
  const [visionPrompt, setVisionPrompt] = useState("");
  const [structurePrompt, setStructurePrompt] = useState("");
  const [aiProvider, setAiProvider] = useState<AiProviderId>("ollama");
  const [visionModel, setVisionModel] = useState("");
  const [structureModel, setStructureModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const effectiveLibrarySection: PortalLibrarySection | undefined =
    selectedSupplierRow?.libraryKind ??
    (newFilesFolderName.trim() && !supplierFolderId.trim() ? "files" : undefined);

  const lockedCustomerLabel =
    preselectedCustomerName ||
    customers.find((c) => c.id === customerId)?.name ||
    customerId;

  const jobsListPath =
    staffEmbed || (lockCustomer && preselectedCustomerId)
      ? `/customers/${staffEmbed?.customerId ?? preselectedCustomerId}/jobs`
      : "/jobs";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [customerRows, cfg] = await Promise.all([
          lockCustomer
            ? Promise.resolve([] as Customer[])
            : fetchStaffScopedActiveCustomers(apiBase, authHeaders(), {
                canReadCustomers,
                canReadFiles,
              }),
          fetchExtractConfig(apiBase, authHeaders()),
        ]);
        if (cancelled) return;
        setCustomers(customerRows);
        if (lockCustomer && preselectedCustomerId) {
          setCustomerId(preselectedCustomerId);
        } else {
          const preOk =
            Boolean(preselectedCustomerId) &&
            customerRows.some((c) => c.id === preselectedCustomerId);
          setCustomerId(preOk ? preselectedCustomerId : customerRows[0]?.id || "");
        }
        setDefaults(cfg);
        const k = promptKindForLibrary("invoices");
        setDocumentKind(k);
        setVisionPrompt(visionPromptFor(k));
        setStructurePrompt(structurePromptFor(k));
        setAiProvider(
          cfg.defaultProvider ?? (cfg.providers?.[0]?.id as AiProviderId | undefined) ?? "ollama"
        );
        setVisionModel(cfg.visionModel);
        setStructureModel(cfg.structureModel);
      } catch (error) {
        if (cancelled) return;
        setErr(error instanceof Error ? error.message : "Failed to load form");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, authHeaders, lockCustomer, preselectedCustomerId, canReadCustomers, canReadFiles]);

  useEffect(() => {
    if (!effectiveLibrarySection) return;
    const k = promptKindForLibrary(effectiveLibrarySection);
    setDocumentKind(k);
    if (!advanced) {
      setVisionPrompt(visionPromptFor(k));
      setStructurePrompt(structurePromptFor(k));
    }
  }, [effectiveLibrarySection, advanced]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!customerId) {
        setSuppliers([]);
        setSupplierFolderId("");
        setNewFilesFolderName("");
        return;
      }
      try {
        const list = await fetchPortalSuppliersAll(apiBase, authHeaders(), { customerId });
        if (cancelled) return;
        setSuppliers(list);
        setNewFilesFolderName("");
      } catch {
        if (cancelled) return;
        setSuppliers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, authHeaders, customerId]);

  useEffect(() => {
    if (suppliers.length === 0) return;
    if (newFilesFolderName.trim()) return;
    const defaultFolder = suppliers.find((s) => s.isDefault);
    if (!defaultFolder) return;
    setSupplierFolderId((id) => {
      const cur = id.trim();
      if (cur && suppliers.some((s) => s.folderId === cur)) return id;
      return defaultFolder.folderId;
    });
  }, [suppliers, newFilesFolderName]);

  useEffect(() => {
    if (!advanced) {
      setVisionPrompt(visionPromptFor(documentKind));
      setStructurePrompt(structurePromptFor(documentKind));
    }
  }, [advanced, documentKind]);

  const onSelectSupplier = (id: string) => {
    setSupplierFolderId(id);
    setNewFilesFolderName("");
    setErr("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || files.length === 0 || !effectiveLibrarySection) return;
    setErr("");
    const targetFiles = effectiveLibrarySection === "files";
    const creatingCustomerFolder =
      targetFiles && !supplierFolderId.trim() && Boolean(newFilesFolderName.trim());
    if (creatingCustomerFolder && customerFolderNameExists(newFilesFolderName, suppliers)) {
      setErr("Folder name already exists");
      return;
    }
    setSaving(true);
    setUploadProgress(null);
    const supplierNameOpt = targetFiles
      ? supplierFolderId.trim()
        ? undefined
        : newFilesFolderName.trim() || undefined
      : supplierFolderId.trim()
        ? undefined
        : undefined;
    try {
      const { results, failures } = await uploadFilesForSupplierMany(apiBase, authHeaders(), {
        files,
        customerId,
        librarySection: effectiveLibrarySection,
        supplierFolderId: supplierFolderId.trim() || null,
        supplierName: supplierNameOpt,
        runExtraction: true,
        visionPrompt,
        structurePrompt,
        visionModel: advanced ? visionModel : undefined,
        structureModel: advanced ? structureModel : undefined,
        aiProvider: advanced ? aiProvider : undefined,
        onProgress: setUploadProgress,
      });

      if (failures.length > 0) {
        const summary = formatUploadFailureSummary(failures);
        if (results.length === 0) {
          setErr(summary);
          return;
        }
        setErr(`${results.length} job(s) created; ${summary}`);
      }

      const firstJob = results.find((r) => r.job)?.job;
      if (firstJob) {
        navigate(`/jobs/${firstJob.id}`);
      } else if (results.length > 0) {
        navigate(`/jobs`);
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Failed to create job");
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  };

  const canSubmit =
    Boolean(customerId && files.length > 0 && effectiveLibrarySection) &&
    (effectiveLibrarySection === "files"
      ? Boolean(supplierFolderId.trim()) || Boolean(newFilesFolderName.trim())
      : Boolean(supplierFolderId.trim()));

  return (
    <div className="w-full min-w-0 space-y-4">
      <div className="flex items-center gap-3">
        <Link to={jobsListPath} className="text-sm text-brand hover:underline">
          ← File Tasks
        </Link>
        <h1 className="text-xl font-semibold text-ink">New job</h1>
      </div>
      <p className="text-sm text-muted">
        Uploads go into the customer&apos;s library and then queue for extraction — same flow as the customer portal.
      </p>
      <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-soft">Customer</span>
          {lockCustomer ? (
            <input
              type="text"
              readOnly
              value={lockedCustomerLabel}
              className="w-full cursor-default rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-ink"
            />
          ) : (
            <SearchableCustomerSelect
              customers={customers}
              value={customerId}
              onChange={setCustomerId}
              placeholder="Search customers…"
              required
            />
          )}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-soft">Destination folder</span>
          <select
            value={supplierFolderId}
            onChange={(e) => onSelectSupplier(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
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
        {supplierFolderId.trim() && selectedSupplierRow ? (
          <div className="rounded-lg border border-border bg-surface-muted/60 px-3 py-2">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted">Selected folder</span>
            <p className="mt-1 text-sm font-medium text-ink">
              {selectedSupplierRow.label}
              <span className="ml-2 text-xs font-normal text-muted">
                ({selectedSupplierRow.disambiguation === "Global" ? "Global" : "Customer-specific"}
                {selectedSupplierRow.isDefault ? " · default" : ""})
              </span>
            </p>
          </div>
        ) : null}
        {!supplierFolderId.trim() ? (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">New folder name (customer-specific)</span>
            <input
              type="text"
              value={newFilesFolderName}
              onChange={(e) => {
                const v = e.target.value;
                setNewFilesFolderName(v);
                if (v.trim()) {
                  setSupplierFolderId("");
                }
              }}
              placeholder="Optional — creates a new customer folder when none is selected above"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
          </label>
        ) : null}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-soft">Files</span>
          <input
            type="file"
            multiple
            accept="image/*,.pdf,application/pdf"
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
            PDF or images, max {MAX_UPLOAD_FILE_MB} MB each
            {files.length > 1 ? ` · ${files.length} files — one extraction job per file` : ""}
          </p>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
          <span className="text-sm">Advanced (models & prompts)</span>
        </label>
        {advanced ? (
          <div className="space-y-2 rounded-lg border border-border bg-surface-muted/80 p-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">AI provider</span>
              <select
                value={aiProvider}
                onChange={(e) => {
                  const id = e.target.value as AiProviderId;
                  setAiProvider(id);
                  const p = defaults?.providers?.find((x) => x.id === id);
                  if (p) {
                    setVisionModel(p.visionModelDefault);
                    setStructureModel(p.structureModelDefault);
                  }
                }}
                className="w-full rounded border border-border px-2 py-1.5 text-sm"
              >
                {(defaults?.providers ?? [{ id: "ollama" as const, visionModelDefault: "", structureModelDefault: "" }]).map(
                  (p) => (
                    <option key={p.id} value={p.id}>
                      {p.id === "ollama" ? "Ollama" : p.id === "openai" ? "OpenAI" : "Amazon Bedrock"}
                    </option>
                  )
                )}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Vision model</span>
              <input
                value={visionModel}
                onChange={(e) => setVisionModel(e.target.value)}
                className="w-full rounded border border-border px-2 py-1.5 text-sm"
                placeholder={defaults?.visionModel}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Structure model</span>
              <input
                value={structureModel}
                onChange={(e) => setStructureModel(e.target.value)}
                className="w-full rounded border border-border px-2 py-1.5 text-sm"
                placeholder={defaults?.structureModel}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Vision prompt</span>
              <textarea
                value={visionPrompt}
                onChange={(e) => setVisionPrompt(e.target.value)}
                rows={2}
                className="w-full rounded border border-border px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Structure prompt</span>
              <textarea
                value={structurePrompt}
                onChange={(e) => setStructurePrompt(e.target.value)}
                rows={3}
                className="w-full rounded border border-border px-2 py-1.5 text-sm"
              />
            </label>
          </div>
        ) : null}
        {err ? <p className="text-sm text-red-400">{err}</p> : null}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !canSubmit}
            className="btn btn-primary btn-md"
          >
            {saving && uploadProgress
              ? `Creating ${uploadProgress.completed}/${uploadProgress.total}…`
              : saving
                ? "Creating…"
                : files.length > 1
                  ? `Create ${files.length} jobs`
                  : "Create job"}
          </button>
        </div>
      </form>
    </div>
  );
}

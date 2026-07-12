import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  deleteDriveFile,
  fetchCustomer,
  fetchFileById,
  fetchFilesForCustomer,
  fetchJob,
  fetchJobsByFileId,
  patchJobExtractionResult,
} from "../api/client";
import { JobFinancialReviewPanel } from "../components/JobFinancialReviewPanel";
import { OriginalFilePreview } from "../components/OriginalFilePreview";
import { ResultsTabs } from "../components/ResultsTabs";
import { UploadDialog } from "../components/UploadDialog";
import { useAuth } from "../auth/AuthContext";
import { canDeleteDriveFiles } from "../utils/canDeleteDriveFiles";
import { formatDateTime } from "../utils/formatDate";
import type { DriveFile, ExtractResponse, FinancialDocumentRow, JobRow, JobStatus } from "../types/api";

function buildPathStrings(files: DriveFile[]): Map<string, string> {
  const byId = new Map(files.map((f) => [f.id, f] as const));
  const memo = new Map<string, string>();
  function pathFor(id: string): string {
    const hit = memo.get(id);
    if (hit !== undefined) return hit;
    const f = byId.get(id);
    if (!f) {
      memo.set(id, id);
      return id;
    }
    if (!f.parentId) {
      memo.set(id, f.name);
      return f.name;
    }
    const p = pathFor(f.parentId);
    const s = `${p}/${f.name}`;
    memo.set(id, s);
    return s;
  }
  for (const f of files) {
    pathFor(f.id);
  }
  return memo;
}

function jobCreatedMs(j: JobRow): number {
  const t = Date.parse(j.createdAt ?? "");
  return Number.isNaN(t) ? 0 : t;
}

function hasFinancialDocuments(result: Record<string, unknown> | null | undefined): boolean {
  if (!result) return false;
  const fd = result.financialDocuments;
  return Array.isArray(fd) && fd.length > 0;
}

/** Prefer a completed job with financial docs, else latest completed, else newest job. */
function pickPrimaryJobId(jobs: JobRow[]): string | null {
  if (!jobs.length) return null;
  const sorted = [...jobs].sort((a, b) => jobCreatedMs(b) - jobCreatedMs(a));
  const completedRich = sorted.find((j) => j.status === "completed" && hasFinancialDocuments(j.result));
  if (completedRich) return completedRich.id;
  const completed = sorted.find((j) => j.status === "completed");
  if (completed) return completed.id;
  return sorted[0].id;
}

export default function FileDetailPage() {
  const { customerId, fileId } = useParams<{ customerId: string; fileId: string }>();
  const navigate = useNavigate();
  const { apiBase, authHeaders, isAdmin, authRequired, hasPermission, customerId: jwtCustomerId } = useAuth();
  const isPortalUser = Boolean(authRequired && jwtCustomerId && !isAdmin);
  const canDeleteFiles = canDeleteDriveFiles({ authRequired, isAdmin, hasPermission });
  const [file, setFile] = useState<DriveFile | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [primaryJob, setPrimaryJob] = useState<JobRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [previewPageRange, setPreviewPageRange] = useState<{ start: number; end: number } | null>(null);
  const [editedFinancialJson, setEditedFinancialJson] = useState<string | null>(null);
  const [reviewRemountKey, setReviewRemountKey] = useState(0);
  const [hitlSaving, setHitlSaving] = useState(false);
  const [hitlErr, setHitlErr] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!customerId || !fileId) return;
    const silent = opts?.silent === true;
    if (!silent) {
      setErr("");
      setLoading(true);
    }
    try {
      const [f, list, cust, jobRows] = await Promise.all([
        fetchFileById(apiBase, authHeaders(), fileId),
        fetchFilesForCustomer(apiBase, authHeaders(), customerId),
        fetchCustomer(apiBase, authHeaders(), customerId).catch(() => null),
        fetchJobsByFileId(apiBase, authHeaders(), fileId),
      ]);
      if (f.customerId !== customerId) {
        if (!silent) {
          setErr("File does not belong to this customer.");
          setFile(null);
          setDriveFiles([]);
          setPrimaryJob(null);
        }
        return;
      }
      setFile(f);
      setDriveFiles(list);
      setCustomerName(cust?.name ?? "");
      const pickId = pickPrimaryJobId(jobRows);
      if (pickId) {
        const full = await fetchJob(apiBase, authHeaders(), pickId);
        setPrimaryJob(full);
      } else {
        setPrimaryJob(null);
      }
    } catch (e) {
      if (!silent) {
        setErr(e instanceof Error ? e.message : "Failed to load file");
        setFile(null);
        setDriveFiles([]);
        setPrimaryJob(null);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [apiBase, authHeaders, customerId, fileId]);

  useEffect(() => {
    void load();
  }, [load]);

  const poll =
    primaryJob?.status === "queued" || primaryJob?.status === "processing"
      ? true
      : false;
  useEffect(() => {
    if (!poll || !fileId) return;
    const t = setInterval(() => void load({ silent: true }), 3000);
    return () => clearInterval(t);
  }, [poll, fileId, load]);

  useEffect(() => {
    setPreviewZoom(100);
    setPreviewPageRange(null);
    setEditedFinancialJson(null);
    setReviewRemountKey(0);
    setHitlErr("");
  }, [fileId]);

  useEffect(() => {
    if (!primaryJob || !hasFinancialDocuments(primaryJob.result)) setPreviewPageRange(null);
  }, [primaryJob?.id, primaryJob?.result]);

  const pathMap = useMemo(() => buildPathStrings(driveFiles), [driveFiles]);
  const pathLabel = file ? pathMap.get(file.id) ?? file.name : "";

  const newJobHref =
    customerId && file && file.fileType === "file"
      ? `/jobs/new?customerId=${encodeURIComponent(customerId)}&parentId=${encodeURIComponent(file.parentId ?? "")}`
      : "/jobs/new";

  const status: JobStatus | undefined = primaryJob?.status;
  const resultPayload = primaryJob?.result as ExtractResponse | null;
  const hasFailedError = status === "failed" && Boolean(primaryJob?.error?.trim());

  const financialDocsFingerprint =
    primaryJob?.result &&
    Array.isArray((primaryJob.result as ExtractResponse).financialDocuments) &&
    (primaryJob.result as ExtractResponse).financialDocuments!.length > 0
      ? JSON.stringify((primaryJob.result as ExtractResponse).financialDocuments)
      : "";

  const pipelineFinancialDocuments = useMemo((): FinancialDocumentRow[] => {
    if (!financialDocsFingerprint) return [];
    return JSON.parse(financialDocsFingerprint) as FinancialDocumentRow[];
  }, [financialDocsFingerprint]);

  useEffect(() => {
    setEditedFinancialJson(null);
  }, [financialDocsFingerprint]);

  const hitlDirty =
    editedFinancialJson != null &&
    financialDocsFingerprint.length > 0 &&
    editedFinancialJson !== financialDocsFingerprint;

  const saveExtractionCorrections = async () => {
    if (!primaryJob || !editedFinancialJson || !hitlDirty) return;
    setHitlSaving(true);
    setHitlErr("");
    try {
      const docs = JSON.parse(editedFinancialJson) as FinancialDocumentRow[];
      await patchJobExtractionResult(apiBase, authHeaders(), primaryJob.id, {
        financialDocuments: docs,
        manualOverride: { note: "Adjusted from file view" },
      });
      setEditedFinancialJson(null);
      await load();
    } catch (e) {
      setHitlErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setHitlSaving(false);
    }
  };

  if (!customerId || !fileId) {
    return <p className="text-sm text-muted">Missing file route.</p>;
  }

  return (
    <div className="w-full min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={isPortalUser ? `/customers/${customerId}/library-documents` : `/customers/${customerId}/drive`}
            className="text-sm text-brand hover:underline"
          >
            ← Files
          </Link>
          <h1 className="text-xl font-semibold text-ink">File</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {canDeleteFiles && file ? (
          <button
            type="button"
            disabled={deleting}
            className="btn btn-danger btn-md"
            onClick={() => {
              if (
                !window.confirm(
                  "Delete this file? It will be hidden from the drive and linked extraction jobs will be removed.",
                )
              ) {
                return;
              }
              setDeleting(true);
              void deleteDriveFile(apiBase, authHeaders(), file.id)
                .then(() => navigate(`/customers/${customerId}/drive`))
                .catch((e) => setErr(e instanceof Error ? e.message : "Delete failed"))
                .finally(() => setDeleting(false));
            }}
          >
            {deleting ? "Deleting…" : "Delete file"}
          </button>
        ) : null}
        {file?.fileType === "file" ? (
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="btn btn-primary btn-md shadow-sm"
          >
            Upload files
          </button>
        ) : null}
        </div>
      </div>

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        apiBase={apiBase}
        headers={authHeaders()}
        customerId={customerId}
        parentId={file?.parentId ?? null}
        showUploadCategory
        onUploaded={({ file: uploaded }) => {
          void load();
          if (uploaded && uploaded.id !== fileId) {
            navigate(`/customers/${customerId}/files/${uploaded.id}`);
          }
        }}
      />

      {loading ? <p className="text-sm text-muted">Loading…</p> : null}
      {err ? <p className="text-sm text-red-400">{err}</p> : null}

      {file && !err && file.fileType === "folder" ? (
        <div className="space-y-4 rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
          <p className="text-sm">
            <span className="font-semibold text-ink">{file.name}</span>
            <span className="ml-2 rounded bg-surface-muted px-2 py-0.5 text-xs text-muted">Folder</span>
          </p>
          <p className="font-mono text-xs text-muted">{pathLabel}</p>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="rounded-lg border border-border bg-surface-muted px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted/80"
          >
            Upload into this folder
          </button>
        </div>
      ) : null}

      {file && !err && file.fileType === "file" ? (
        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-lg">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-surface-muted/70 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">File</p>
              <h2 className="mt-0.5 truncate text-lg font-semibold text-ink">{file.name}</h2>
              <p className="mt-0.5 text-xs text-muted">
                <span className="font-medium text-ink/90">{customerName || "Customer"}</span>
                {" · "}
                <span>Created {formatDateTime(file.createdAt)}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {primaryJob ? (
                <>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize tabular-nums ${
                      status === "completed"
                        ? "bg-emerald-500/15 text-emerald-700"
                        : status === "failed"
                          ? "bg-red-500/15 text-red-600"
                          : "bg-amber-500/15 text-amber-800"
                    }`}
                  >
                    {status}
                  </span>
                  <span className="text-xs tabular-nums text-muted">{primaryJob.percentCompleted}%</span>
                  {isAdmin ? (
                    <Link
                      to={`/jobs/${primaryJob.id}`}
                      className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-brand shadow-sm hover:bg-surface-muted"
                    >
                      Open job
                    </Link>
                  ) : null}
                </>
              ) : (
                <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-muted">
                  No file task
                </span>
              )}
            </div>
          </header>

          {hasFailedError && primaryJob ? (
            <div className="alert-error-banner">
              <p className="font-semibold text-feedback-error">Extraction failed</p>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs text-red-100/90">
                {primaryJob.error ?? "Unknown error"}
              </pre>
              {isAdmin ? (
                <p className="mt-3 text-sm text-muted">
                  <Link to={`/jobs/${primaryJob.id}`} className="font-semibold text-brand underline hover:text-brand/90">
                    Open job
                  </Link>{" "}
                  for diagnostics and configuration.
                </p>
              ) : null}
            </div>
          ) : null}

          {primaryJob && status !== "completed" && !hasFailedError ? (
            <div className="border-b border-border px-4 py-2">
              <div className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-border">
                <div
                  className="h-full bg-brand transition-all"
                  style={{ width: `${Math.min(100, primaryJob.percentCompleted)}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="flex min-h-[min(72vh,640px)] flex-1 flex-col bg-surface-raised lg:flex-row">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col border-border lg:max-w-[58%] lg:border-r">
              <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-muted/40 px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Extracted data</span>
                  <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand">AI</span>
                </div>
                {primaryJob && status === "completed" && pipelineFinancialDocuments.length > 0 ? (
                  <span className={`text-[11px] font-medium ${hitlDirty ? "text-amber-600" : "text-emerald-600"}`}>
                    {hitlDirty ? "Unsaved changes" : "Up to date"}
                  </span>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {!primaryJob ? (
                  <div className="rounded-lg border border-border bg-surface-muted/30 p-4 text-sm text-muted">
                    <p>No extraction file task for this file yet.</p>
                    {isAdmin ? (
                      <p className="mt-2">
                        <Link className="font-semibold text-brand underline" to={newJobHref}>
                          Create a job
                        </Link>{" "}
                        to run extraction, or use <strong>Upload files</strong> with Invoices or Statements.
                      </p>
                    ) : (
                      <p className="mt-2">Ask an admin to run extraction from Jobs or upload a categorized file.</p>
                    )}
                  </div>
                ) : pipelineFinancialDocuments.length > 0 ? (
                  <JobFinancialReviewPanel
                    key={`${financialDocsFingerprint || "none"}-${reviewRemountKey}`}
                    financialDocuments={pipelineFinancialDocuments}
                    disabled={status !== "completed"}
                    onSelectionPageRange={setPreviewPageRange}
                    onDocumentsChange={(docs) => setEditedFinancialJson(JSON.stringify(docs))}
                  />
                ) : (
                  <div key={reviewRemountKey} className="rounded-lg border border-border bg-surface-muted/30 p-3">
                    <ResultsTabs result={resultPayload} embedded showTabs={false} activeTab="data" />
                  </div>
                )}
              </div>
              {primaryJob && status === "completed" && pipelineFinancialDocuments.length > 0 ? (
                <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-muted/50 px-4 py-3">
                  <div className="text-xs text-muted">
                    <p>{hitlDirty ? "You have unsaved edits." : "No pending changes."}</p>
                    {hitlErr ? <p className="mt-1 text-red-400">{hitlErr}</p> : null}
                    <p className="mt-1 font-mono text-[10px] text-muted/80">{primaryJob.id}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!hitlDirty || hitlSaving || !financialDocsFingerprint}
                      onClick={() => {
                        setEditedFinancialJson(null);
                        setReviewRemountKey((k) => k + 1);
                      }}
                      className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted disabled:opacity-40"
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      disabled={!hitlDirty || hitlSaving}
                      onClick={() => void saveExtractionCorrections()}
                      className="btn btn-primary btn-md disabled:opacity-45"
                    >
                      {hitlSaving ? "Saving…" : "Save extraction"}
                    </button>
                  </div>
                </footer>
              ) : null}
            </div>

            <aside className="flex min-h-0 min-w-0 flex-1 flex-col border border-border bg-surface-muted text-ink lg:max-w-[44%]">
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs">
                <span className="font-semibold tracking-wide text-muted">Source file</span>
                <span className="rounded bg-surface-raised px-2 py-0.5 font-mono text-[11px] text-muted shadow-sm">
                  {previewPageRange ? `Pages ${previewPageRange.start}–${previewPageRange.end}` : "Full document"}
                </span>
                <span className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Zoom out"
                    className="rounded border border-border px-2 py-0.5 hover:bg-surface-raised"
                    onClick={() => setPreviewZoom((z) => Math.max(70, z - 10))}
                  >
                    −
                  </button>
                  <span className="min-w-[2.5rem] text-center tabular-nums text-muted">{previewZoom}%</span>
                  <button
                    type="button"
                    aria-label="Zoom in"
                    className="rounded border border-border px-2 py-0.5 hover:bg-surface-raised"
                    onClick={() => setPreviewZoom((z) => Math.min(130, z + 10))}
                  >
                    +
                  </button>
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-2">
                <div
                  className="mx-auto max-w-full origin-top transition-transform"
                  style={{ transform: `scale(${previewZoom / 100})` }}
                >
                  <OriginalFilePreview
                    fileId={file.id}
                    mimeType={file.mimeType}
                    fileName={file.name}
                    pdfPageRange={previewPageRange ?? undefined}
                  />
                </div>
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </div>
  );
}

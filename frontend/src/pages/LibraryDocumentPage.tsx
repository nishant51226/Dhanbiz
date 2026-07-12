import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  deleteLibraryDocument,
  fetchDocumentContentBlob,
  fetchJobsForLibraryDocument,
  fetchLibraryDocument,
  patchJobExtractionResult,
  requeueLibraryDocumentExtraction,
} from "../api/client";
import { canDeleteDriveFiles } from "../utils/canDeleteDriveFiles";
import { JobFinancialReviewPanel } from "../components/JobFinancialReviewPanel";
import { OriginalFilePreview } from "../components/OriginalFilePreview";
import { ResultsTabs } from "../components/ResultsTabs";
import { useAuth } from "../auth/AuthContext";
import { formatDateTime } from "../utils/formatDate";
import { triggerBrowserDownload } from "../utils/onboardingExportFilename";
import { resolveDocumentMime } from "../utils/filePreviewKind";
import type { AdminLibraryDocumentRow, ExtractResponse, FinancialDocumentRow, JobRow, JobStatus } from "../types/api";

function libraryLabel(t: string | undefined): string {
  if (t === "invoices") return "Invoices";
  if (t === "statements") return "Statements";
  if (t === "files") return "Files";
  return t ?? "—";
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

/** Library document: extracted data (left) + original file (right), 50/50 on large screens. */
export default function LibraryDocumentPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const { apiBase, authHeaders, isAdmin, authRequired, hasPermission } = useAuth();
  const canRequeueExtraction = !authRequired || isAdmin || hasPermission("job:create");
  const canDeleteDocument = canDeleteDriveFiles({ authRequired, isAdmin, hasPermission });
  const [doc, setDoc] = useState<AdminLibraryDocumentRow | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [primaryJob, setPrimaryJob] = useState<JobRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [previewZoom, setPreviewZoom] = useState(100);
  const [previewPageRange, setPreviewPageRange] = useState<{ start: number; end: number } | null>(null);
  const [editedFinancialJson, setEditedFinancialJson] = useState<string | null>(null);
  const [reviewRemountKey, setReviewRemountKey] = useState(0);
  const [hitlSaving, setHitlSaving] = useState(false);
  const [hitlErr, setHitlErr] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadErr, setDownloadErr] = useState("");
  const [requeueBusy, setRequeueBusy] = useState(false);
  const [requeueErr, setRequeueErr] = useState("");

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!documentId) return;
    const silent = opts?.silent === true;
    if (!silent) {
      setErr("");
      setLoading(true);
    }
    try {
      const [d, jobRows] = await Promise.all([
        fetchLibraryDocument(apiBase, authHeaders(), documentId),
        fetchJobsForLibraryDocument(apiBase, authHeaders(), documentId),
      ]);
      setDoc(d);
      setJobs(jobRows);
      const pickId = pickPrimaryJobId(jobRows);
      if (pickId) {
        setPrimaryJob(jobRows.find((j) => j.id === pickId) ?? null);
      } else {
        setPrimaryJob(null);
      }
    } catch (e) {
      if (!silent) {
        setErr(e instanceof Error ? e.message : "Failed to load");
        setDoc(null);
        setJobs([]);
        setPrimaryJob(null);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [apiBase, authHeaders, documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const poll =
    primaryJob?.status === "queued" || primaryJob?.status === "processing" ? true : false;
  useEffect(() => {
    if (!poll || !documentId) return;
    const t = setInterval(() => void load({ silent: true }), 3000);
    return () => clearInterval(t);
  }, [poll, documentId, load]);

  useEffect(() => {
    setPreviewZoom(100);
    setPreviewPageRange(null);
    setEditedFinancialJson(null);
    setReviewRemountKey(0);
    setHitlErr("");
    setDownloadErr("");
  }, [documentId]);

  useEffect(() => {
    if (!primaryJob || !hasFinancialDocuments(primaryJob.result)) setPreviewPageRange(null);
  }, [primaryJob?.id, primaryJob?.result]);

  const customerId = useMemo(() => {
    if (!doc) return "";
    return (
      doc.customerId?.trim() ||
      doc.customer?.id?.trim() ||
      doc.folder?.customerId?.trim() ||
      doc.folder?.customer?.id?.trim() ||
      ""
    );
  }, [doc]);
  const mime = useMemo(() => {
    const fromDoc =
      typeof doc?.mimeType === "string"
        ? doc.mimeType
        : typeof doc?.metadata?.mimeType === "string"
          ? doc.metadata.mimeType
          : null;
    return resolveDocumentMime(fromDoc, doc?.name ?? "");
  }, [doc?.mimeType, doc?.metadata, doc?.name]);

  const loadBlob = useMemo(() => {
    if (!documentId) return undefined;
    return () => fetchDocumentContentBlob(apiBase, authHeaders(), customerId, documentId);
  }, [apiBase, authHeaders, customerId, documentId]);

  const status: JobStatus | undefined = primaryJob?.status;
  const canRequeueNow =
    canRequeueExtraction &&
    Boolean(documentId) &&
    status !== "queued" &&
    status !== "processing";

  const requeueExtraction = async () => {
    if (!documentId || !canRequeueNow || requeueBusy) return;
    setRequeueBusy(true);
    setRequeueErr("");
    try {
      await requeueLibraryDocumentExtraction(apiBase, authHeaders(), documentId);
      await load();
    } catch (e) {
      setRequeueErr(e instanceof Error ? e.message : "Re-run failed");
    } finally {
      setRequeueBusy(false);
    }
  };

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
        manualOverride: { note: "Adjusted from library document view" },
      });
      setEditedFinancialJson(null);
      await load();
    } catch (e) {
      setHitlErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setHitlSaving(false);
    }
  };

  const otherJobs = useMemo(() => {
    if (!primaryJob?.id) return jobs;
    return jobs.filter((j) => j.id !== primaryJob.id);
  }, [jobs, primaryJob?.id]);

  const downloadDocument = useCallback(async () => {
    if (!doc || !documentId) return;
    setDownloading(true);
    setDownloadErr("");
    try {
      const blob = await fetchDocumentContentBlob(apiBase, authHeaders(), customerId, documentId, {
        download: true,
      });
      triggerBrowserDownload(blob, doc.name?.trim() || "download");
    } catch (e) {
      setDownloadErr(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }, [apiBase, authHeaders, customerId, doc, documentId]);

  return (
    <div className="w-full min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/files" className="text-sm text-brand hover:underline">
            ← Files
          </Link>
          {customerId ? (
            <Link
              to={`/customers/${customerId}/drive`}
              className="text-sm text-muted hover:text-brand hover:underline"
            >
              Customer drive
            </Link>
          ) : null}
          <h1 className="text-xl font-semibold text-ink">Document</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {doc ? (
            <button
              type="button"
              disabled={downloading}
              className="rounded-lg border border-border bg-surface-raised px-4 py-2 text-sm font-semibold text-ink shadow-sm hover:bg-surface-muted disabled:opacity-50"
              onClick={() => void downloadDocument()}
            >
              {downloading ? "Downloading…" : "Download"}
            </button>
          ) : null}
          {canRequeueNow ? (
            <button
              type="button"
              disabled={requeueBusy}
              className="rounded-lg border border-border bg-surface-raised px-4 py-2 text-sm font-semibold text-ink shadow-sm hover:bg-surface-muted disabled:opacity-50"
              onClick={() => void requeueExtraction()}
            >
              {requeueBusy ? "Queuing…" : "Re-run extraction"}
            </button>
          ) : null}
          {canDeleteDocument && doc ? (
            <button
            type="button"
            disabled={deleting}
            className="btn btn-danger btn-md"
            onClick={() => {
              if (
                !window.confirm(
                  "Delete this document? It will be hidden from the library. Linked extraction jobs will be removed too.",
                )
              ) {
                return;
              }
              setDeleting(true);
              void deleteLibraryDocument(apiBase, authHeaders(), doc.id)
                .then(() => navigate("/files"))
                .catch((e) => setErr(e instanceof Error ? e.message : "Delete failed"))
                .finally(() => setDeleting(false));
            }}
          >
            {deleting ? "Deleting…" : "Delete document"}
          </button>
          ) : null}
        </div>
      </div>
      {loading ? <p className="text-sm text-muted">Loading…</p> : null}
      {err ? <p className="text-sm text-red-400">{err}</p> : null}
      {requeueErr ? <p className="text-sm text-red-400">{requeueErr}</p> : null}
      {downloadErr ? <p className="text-sm text-red-400">{downloadErr}</p> : null}
      {doc && !err ? (
        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-lg">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-surface-muted/70 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Library document</p>
              <h2 className="mt-0.5 truncate text-lg font-semibold text-ink">{doc.name}</h2>
              <p className="mt-0.5 text-xs text-muted">
                <span className="font-medium text-ink/90">{doc.folder?.customer?.name ?? doc.folder?.customerId ?? "—"}</span>
                {" · "}
                <span>{libraryLabel(doc.folder?.type)}</span>
                {doc.folder?.name ? (
                  <>
                    {" · "}
                    <span>{doc.folder.name}</span>
                  </>
                ) : null}
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
                  No linked job
                </span>
              )}
            </div>
          </header>

              {hasFailedError && primaryJob ? (
            <div className="alert-error-banner">
              <p className="font-semibold text-feedback-error">Extraction failed</p>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs text-red-900/85 dark:text-red-100/90">
                {primaryJob.error ?? "Unknown error"}
              </pre>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {canRequeueNow ? (
                  <button
                    type="button"
                    disabled={requeueBusy}
                    onClick={() => void requeueExtraction()}
                    className="btn btn-danger btn-sm"
                  >
                    {requeueBusy ? "Queuing…" : "Re-run extraction"}
                  </button>
                ) : null}
                {isAdmin ? (
                  <p className="text-sm text-muted">
                    <Link to={`/jobs/${primaryJob.id}`} className="font-semibold text-brand underline hover:text-brand/90">
                      Open job
                    </Link>{" "}
                    for diagnostics and configuration.
                  </p>
                ) : null}
              </div>
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
            <div className="flex min-h-0 min-w-0 flex-1 flex-col border-border lg:w-1/2 lg:border-r">
              <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-muted/40 px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Invoice / statement details</span>
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
                    <p>No jobs linked to this document yet.</p>
                    {isAdmin ? (
                      <p className="mt-2">
                        Run extraction from <strong>Jobs</strong> or upload a categorized file so results appear here.
                      </p>
                    ) : (
                      <p className="mt-2">Ask an admin to run extraction for this document.</p>
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
                {otherJobs.length > 0 ? (
                  <div className="mt-4 border-t border-border-subtle pt-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Other jobs</p>
                    <ul className="space-y-1 text-sm">
                      {otherJobs.map((j) => (
                        <li key={j.id}>
                          {isAdmin ? (
                            <Link
                              className="text-brand underline hover:text-brand/90"
                              to={`/jobs/${j.id}?simple=1`}
                            >
                              {j.status}
                              {j.createdAt ? ` · ${formatDateTime(j.createdAt)}` : ""}
                            </Link>
                          ) : (
                            <span className="text-muted">
                              {j.status}
                              {j.createdAt ? ` · ${formatDateTime(j.createdAt)}` : ""}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
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

            <aside className="flex min-h-0 min-w-0 flex-1 flex-col border-border bg-surface-muted text-ink lg:w-1/2 lg:border-l lg:border-t-0 border-t">
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs">
                <span className="font-semibold tracking-wide text-muted">Original file</span>
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
                {loadBlob ? (
                  <div
                    className="mx-auto max-w-full origin-top transition-transform"
                    style={{ transform: `scale(${previewZoom / 100})` }}
                  >
                    <OriginalFilePreview
                      loadBlob={loadBlob}
                      mimeType={mime}
                      fileName={doc?.name}
                      pdfPageRange={previewPageRange ?? undefined}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted">Preview unavailable.</p>
                )}
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </div>
  );
}

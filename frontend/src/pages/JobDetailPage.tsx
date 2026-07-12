import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  cancelJob,
  fetchDocumentContentBlob,
  fetchExtractConfig,
  fetchJob,
  fetchJobCost,
  patchJob,
  patchJobExtractionResult,
  requeueJob,
} from "../api/client";
import { JobFinancialReviewPanel } from "../components/JobFinancialReviewPanel";
import { OriginalFilePreview } from "../components/OriginalFilePreview";
import { ResultsTabs } from "../components/ResultsTabs";
import { useAuth } from "../auth/AuthContext";
import { formatDateTime } from "../utils/formatDate";
import { jobDurationLabel, jobDurationSuffix } from "../utils/formatJobDuration";
import type {
  AiProviderId,
  ExtractConfig,
  ExtractResponse,
  FinancialDocumentRow,
  JobCostLine,
  JobCostSummary,
  JobRow,
  JobStatus,
} from "../types/api";
import type { ResultTab } from "../components/ResultsTabs";

type JobDetailTab =
  | ResultTab
  | "config"
  | "error"
  | "original"
  | "documents"
  | "segments"
  | "cost";

function costLineKey(l: JobCostLine): string {
  return `${l.provider}\t${l.model}\t${l.tokenType}`;
}

function effectiveLineCost(
  line: JobCostLine,
  manualPricePerM: Record<string, string>
): { cost: number | null; price: number | null } {
  const key = costLineKey(line);
  const manualRaw = manualPricePerM[key] ?? "";
  const manualNum =
    manualRaw.trim() === "" ? NaN : Number.parseFloat(manualRaw.replace(/,/g, ""));
  const price =
    line.pricePerMillion != null
      ? line.pricePerMillion
      : Number.isFinite(manualNum)
        ? manualNum
        : null;
  if (line.actualCost != null) return { cost: line.actualCost, price: line.pricePerMillion };
  if (price != null) return { cost: (line.tokens / 1_000_000) * price, price };
  return { cost: null, price: null };
}

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [searchParams] = useSearchParams();
  const simpleView = searchParams.get("simple") === "1";
  const { apiBase, authHeaders } = useAuth();
  const [job, setJob] = useState<JobRow | null>(null);
  const [defaults, setDefaults] = useState<ExtractConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [visionPrompt, setVisionPrompt] = useState("");
  const [structurePrompt, setStructurePrompt] = useState("");
  const [aiProvider, setAiProvider] = useState<AiProviderId>("ollama");
  const [visionModel, setVisionModel] = useState("");
  const [structureModel, setStructureModel] = useState("");
  const [activeTab, setActiveTab] = useState<JobDetailTab>("data");
  /** Primary split UI vs full tab strip (Data, JSON, …). */
  const [workspaceMode, setWorkspaceMode] = useState<"extraction" | "advanced">(
    simpleView ? "extraction" : "advanced"
  );
  const [previewPageRange, setPreviewPageRange] = useState<{ start: number; end: number } | null>(null);
  const [editedFinancialJson, setEditedFinancialJson] = useState<string | null>(null);
  const [hitlSaving, setHitlSaving] = useState(false);
  /** Bump to remount review panel after Discard. */
  const [reviewRemountKey, setReviewRemountKey] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [costSummary, setCostSummary] = useState<JobCostSummary | null>(null);
  const [costLoading, setCostLoading] = useState(false);
  const [costErr, setCostErr] = useState("");
  /** Per-line manual $/1M when global pricing is missing; key = provider\\tmodel\\ttokenType */
  const [manualPricePerM, setManualPricePerM] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!jobId) return;
    setErr("");
    try {
      const [j, d] = await Promise.all([
        fetchJob(apiBase, authHeaders(), jobId),
        fetchExtractConfig(apiBase, authHeaders()).catch(() => null),
      ]);
      setJob(j);
      setDefaults(d);
      setVisionPrompt(j.visionPrompt ?? d?.visionPromptDefault ?? "");
      setStructurePrompt(j.structurePrompt ?? d?.structurePromptDefault ?? "");
      setAiProvider(
        (j.aiProvider ?? d?.defaultProvider ?? "ollama") as AiProviderId
      );
      setVisionModel(j.visionModel ?? d?.visionModel ?? "");
      setStructureModel(j.structureModel ?? d?.structureModel ?? "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders, jobId]);

  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    load();
  }, [jobId, load]);

  useEffect(() => {
    setWorkspaceMode(simpleView ? "extraction" : "advanced");
    setReviewRemountKey(0);
    setPreviewZoom(100);
  }, [jobId, simpleView]);

  const poll =
    job?.status === "queued" || job?.status === "processing"
      ? true
      : false;
  const [durationNow, setDurationNow] = useState(() => Date.now());
  useEffect(() => {
    if (!poll) return;
    const t = setInterval(() => setDurationNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [poll]);
  useEffect(() => {
    if (!poll || !jobId) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [poll, jobId, load]);

  useEffect(() => {
    if (activeTab !== "cost" || !jobId) return;
    let cancelled = false;
    setCostLoading(true);
    setCostErr("");
    fetchJobCost(apiBase, authHeaders(), jobId)
      .then((s) => {
        if (!cancelled) {
          setCostSummary(s);
          setManualPricePerM({});
        }
      })
      .catch((e) => {
        if (!cancelled) setCostErr(e instanceof Error ? e.message : "Cost load failed");
      })
      .finally(() => {
        if (!cancelled) setCostLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, jobId, apiBase, authHeaders]);

  const saveConfig = async () => {
    if (!jobId) return;
    setSaving(true);
    setErr("");
    try {
      const j = await patchJob(apiBase, authHeaders(), jobId, {
        visionPrompt,
        structurePrompt,
        visionModel,
        structureModel,
        aiProvider,
      });
      setJob(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const requeue = async () => {
    if (!jobId) return;
    setSaving(true);
    setErr("");
    try {
      const j = await requeueJob(apiBase, authHeaders(), jobId);
      setJob(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Requeue failed");
    } finally {
      setSaving(false);
    }
  };

  const doCancel = async () => {
    if (!jobId) return;
    setSaving(true);
    setErr("");
    try {
      const j = await cancelJob(apiBase, authHeaders(), jobId);
      setJob(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setSaving(false);
    }
  };

  const canEdit =
    job && (job.status === "failed" || job.status === "queued" || job.status === "cancelled");
  const canRequeue =
    job?.status === "failed" || job?.status === "cancelled" || job?.status === "completed";
  const canCancel = job?.status === "queued" || job?.status === "processing";

  const resultPayload = job?.result as ExtractResponse | null;
  const status: JobStatus | undefined = job?.status;
  const jobDuration =
    job && status
      ? `${jobDurationLabel({ ...job, result: job.result }, durationNow)}${jobDurationSuffix({ status })}`
      : null;
  const hasFailedError = status === "failed" && Boolean(job?.error?.trim());

  const financialDocsFingerprint =
    job?.result &&
    Array.isArray((job.result as ExtractResponse).financialDocuments) &&
    (job.result as ExtractResponse).financialDocuments!.length > 0
      ? JSON.stringify((job.result as ExtractResponse).financialDocuments)
      : "";

  const pipelineFinancialDocuments = useMemo((): FinancialDocumentRow[] => {
    if (!financialDocsFingerprint) return [];
    return JSON.parse(financialDocsFingerprint) as FinancialDocumentRow[];
  }, [financialDocsFingerprint]);

  useEffect(() => {
    setEditedFinancialJson(null);
  }, [financialDocsFingerprint]);

  useEffect(() => {
    setPreviewPageRange(null);
  }, [jobId]);

  useEffect(() => {
    if (!pipelineFinancialDocuments.length) setPreviewPageRange(null);
  }, [pipelineFinancialDocuments.length, jobId]);

  const hitlDirty =
    editedFinancialJson != null &&
    financialDocsFingerprint.length > 0 &&
    editedFinancialJson !== financialDocsFingerprint;

  const saveExtractionCorrections = async () => {
    if (!jobId || !editedFinancialJson || !hitlDirty) return;
    setHitlSaving(true);
    setErr("");
    try {
      const docs = JSON.parse(editedFinancialJson) as FinancialDocumentRow[];
      await patchJobExtractionResult(apiBase, authHeaders(), jobId, {
        financialDocuments: docs,
        manualOverride: { note: "Adjusted in job review" },
      });
      setEditedFinancialJson(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setHitlSaving(false);
    }
  };

  useEffect(() => {
    if (hasFailedError && !simpleView) {
      setWorkspaceMode("advanced");
    }
    setActiveTab((current) => {
      if (hasFailedError && !simpleView) {
        if (current === "config" || current === "original") return current;
        return "error";
      }
      return current === "error" ? "data" : current;
    });
  }, [hasFailedError, simpleView]);

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/jobs" className="text-sm text-brand hover:underline">
          ← Jobs
        </Link>
        <h1 className="text-xl font-semibold text-ink">Job</h1>
      </div>
      {loading ? <p className="text-sm text-muted">Loading…</p> : null}
      {err ? <p className="text-sm text-red-400">{err}</p> : null}
      {job ? (
        <>
          {workspaceMode === "extraction" && (!hasFailedError || simpleView) ? (
            <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-lg">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-surface-muted/70 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Job</p>
                  <h2 className="mt-0.5 truncate text-lg font-semibold text-ink">
                    {job.document?.name ?? job.file?.name ?? job.fileId ?? job.documentId ?? "Document"}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">
                    <span className="font-medium text-ink/90">{job.customer?.name ?? job.customerId}</span>
                    {" · "}
                    <span>Created {formatDateTime(job.createdAt)}</span>
                    {jobDuration && jobDuration !== "—" ? (
                      <>
                        {" · "}
                        <span>
                          Duration {jobDuration}
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
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
                  <span className="text-xs tabular-nums text-muted">{job.percentCompleted}%</span>
                  {!simpleView ? (
                    <button
                      type="button"
                      onClick={() => {
                        setWorkspaceMode("advanced");
                        setActiveTab("data");
                      }}
                      className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-ink shadow-sm hover:bg-surface-muted"
                    >
                      Advanced view
                    </button>
                  ) : null}
                  {canRequeue ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void requeue()}
                      className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-ink shadow-sm hover:bg-surface-muted disabled:opacity-50"
                    >
                      {job.status === "completed" ? "Re-run extraction" : "Requeue"}
                    </button>
                  ) : null}
                  {canCancel ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={doCancel}
                      className="rounded-lg border border-amber-600/50 bg-amber-950/35 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-950/55 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </header>
              {hasFailedError && simpleView ? (
                <div className="alert-error-banner px-4 py-6">
                  <p className="font-semibold text-feedback-error">This job failed</p>
                  <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap font-mono text-xs text-red-900/85 dark:text-red-100/90">
                    {job.error ?? "Unknown error"}
                  </pre>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {canRequeue ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void requeue()}
                        className="btn btn-danger btn-sm"
                      >
                        Requeue
                      </button>
                    ) : null}
                    <p className="text-sm text-muted">
                      <Link to={`/jobs/${jobId}`} className="font-semibold text-brand underline hover:text-brand/90">
                        Open full job details
                      </Link>{" "}
                      for advanced diagnostics and tabs.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {status !== "completed" ? (
                    <div className="border-b border-border px-4 py-2">
                      <div className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full bg-brand transition-all"
                          style={{ width: `${Math.min(100, job.percentCompleted)}%` }}
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="flex min-h-[min(72vh,640px)] flex-1 flex-col bg-surface-raised lg:flex-row">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col border-border lg:max-w-[58%] lg:border-r">
                  <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-muted/40 px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                        Extracted data
                      </span>
                      <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                        AI
                      </span>
                    </div>
                    <span className={`text-[11px] font-medium ${hitlDirty ? "text-amber-600" : "text-emerald-600"}`}>
                      {hitlDirty ? "Unsaved changes" : "Up to date"}
                    </span>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {pipelineFinancialDocuments.length > 0 ? (
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
                  <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-muted/50 px-4 py-3">
                    <div className="text-xs text-muted">
                      <p>{hitlDirty ? "You have unsaved edits." : "No pending changes."}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={
                          !hitlDirty ||
                          hitlSaving ||
                          status !== "completed" ||
                          !financialDocsFingerprint
                        }
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
                        disabled={!hitlDirty || hitlSaving || status !== "completed"}
                        onClick={() => void saveExtractionCorrections()}
                        className="btn btn-primary btn-md disabled:opacity-45"
                      >
                        {hitlSaving ? "Saving…" : "Save extraction"}
                      </button>
                    </div>
                  </footer>
                </div>

                <aside className="flex min-h-0 min-w-0 flex-1 flex-col border border-border bg-surface-muted text-ink lg:max-w-[44%]">
                  <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs">
                    <span className="font-semibold tracking-wide text-muted">Source file</span>
                    <span className="rounded bg-surface-raised px-2 py-0.5 font-mono text-[11px] text-muted shadow-sm">
                      {previewPageRange
                        ? `Pages ${previewPageRange.start}–${previewPageRange.end}`
                        : "Full document"}
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
                      <span className="min-w-[2.5rem] text-center tabular-nums text-muted">
                        {previewZoom}%
                      </span>
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
                        fileId={job.fileId ?? undefined}
                        loadBlob={
                          job.documentId != null && job.customerId
                            ? () =>
                                fetchDocumentContentBlob(
                                  apiBase,
                                  authHeaders(),
                                  job.customerId!,
                                  job.documentId!
                                )
                            : undefined
                        }
                        mimeType={
                          job.file?.mimeType ??
                          (typeof job.document?.metadata?.mimeType === "string"
                            ? job.document.metadata.mimeType
                            : null)
                        }
                        pdfPageRange={previewPageRange ?? undefined}
                      />
                    </div>
                  </div>
                </aside>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
                <p className="text-sm text-muted">
                  Customer: <strong>{job.customer?.name ?? job.customerId}</strong> · File:{" "}
                  <span className="inline-flex items-center gap-1.5">
                    <strong>{job.document?.name ?? job.file?.name ?? job.fileId ?? job.documentId ?? "—"}</strong>
                    {!simpleView ? (
                      <button
                        type="button"
                        title="View original file"
                        onClick={() => {
                          setWorkspaceMode("advanced");
                          setActiveTab("original");
                        }}
                        className="inline-flex rounded p-0.5 text-brand hover:bg-brand/10"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                          aria-hidden
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      </button>
                    ) : null}
                  </span>
                </p>
                <p className="mt-2 text-sm text-muted">
                  Created: <span className="text-ink">{formatDateTime(job.createdAt)}</span>
                  {jobDuration && jobDuration !== "—" ? (
                    <>
                      {" · "}
                      Duration: <span className="text-ink">{jobDuration}</span>
                    </>
                  ) : null}
                </p>
                <p className="mt-2 text-sm">
                  Status: <strong>{status}</strong> ·{" "}
                  <span className="text-muted">{job.percentCompleted}%</span>
                </p>
                <div className="mt-2 h-2 w-full max-w-md overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full bg-brand transition-all"
                    style={{ width: `${Math.min(100, job.percentCompleted)}%` }}
                  />
                </div>
                {canRequeue ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void requeue()}
                    className="mt-3 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
                  >
                    {job.status === "completed" ? "Re-run extraction" : "Requeue file task"}
                  </button>
                ) : null}
                {canCancel ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={doCancel}
                    className="mt-3 rounded-lg border border-amber-600/50 bg-amber-950/35 px-3 py-1.5 text-sm font-semibold text-amber-100 hover:bg-amber-950/55 disabled:opacity-50"
                  >
                    Cancel file task
                  </button>
                ) : null}
              </div>

              <section className="rounded-xl border border-border bg-surface-raised shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-muted/90 px-3 py-2 sm:px-4">
                  {!hasFailedError ? (
                    <button
                      type="button"
                      onClick={() => setWorkspaceMode("extraction")}
                      className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-brand hover:bg-surface-muted"
                    >
                      ← Extraction view
                    </button>
                  ) : (
                    <span className="text-xs font-medium text-muted">Error details below</span>
                  )}
                  <p className="text-[11px] text-muted">Data, JSON, segments, cost, and more</p>
                </div>
                <div className="border-b border-border bg-surface-muted/90 px-3 pt-2 sm:px-5">
                  <div className="-mb-px flex flex-wrap gap-0.5">
                    {(hasFailedError
                      ? ([
                          ["error", "Error"],
                          ["diagnostics", "Diagnostics"],
                          ["original", "Original"],
                          ["config", "Config"],
                        ] as const)
                      : resultPayload?.pipelineVersion === 1
                        ? ([
                            ["data", "Data"],
                            ["documents", "Documents"],
                            ["segments", "Segments"],
                            ["json", "JSON"],
                            ["text", "Text"],
                            ["pages", "Pages"],
                            ["diagnostics", "Diagnostics"],
                            ["original", "Original"],
                            ["config", "Config"],
                          ] as const)
                        : ([
                            ["data", "Data"],
                            ["json", "JSON"],
                            ["text", "Text"],
                            ["pages", "Pages"],
                            ["diagnostics", "Diagnostics"],
                            ["original", "Original"],
                            ["config", "Config"],
                          ] as const)
                    ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={`rounded-t-lg border border-b-0 px-3 py-2 text-sm font-medium transition sm:px-4 ${
                      activeTab === id
                        ? "relative z-[1] border-border bg-surface-raised text-brand"
                        : "border-transparent text-muted hover:bg-surface-muted hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  key="cost"
                  type="button"
                  onClick={() => setActiveTab("cost")}
                  className={`rounded-t-lg border border-b-0 px-3 py-2 text-sm font-medium transition sm:px-4 ${
                    activeTab === "cost"
                      ? "relative z-[1] border-border bg-surface-raised text-brand"
                      : "border-transparent text-muted hover:bg-surface-muted hover:text-ink"
                  }`}
                >
                  Cost
                </button>
              </div>
            </div>

            <div className="p-4">
              {activeTab === "config" ? (
                <>
                  <h2 className="text-sm font-semibold text-ink">Config</h2>
                  <p className="mt-1 text-xs text-muted">
                    Server defaults for selected provider: vision{" "}
                    {defaults?.providers?.find((x) => x.id === aiProvider)?.visionModelDefault ??
                      defaults?.visionModel ??
                      "—"}
                    , structure{" "}
                    {defaults?.providers?.find((x) => x.id === aiProvider)?.structureModelDefault ??
                      defaults?.structureModel ??
                      "—"}
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                      <span className="text-xs font-medium text-muted">AI provider</span>
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
                        disabled={!canEdit}
                        className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm disabled:bg-surface-muted"
                      >
                        {(defaults?.providers ?? [
                          { id: "ollama" as const, visionModelDefault: "", structureModelDefault: "" },
                        ]).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.id === "ollama" ? "Ollama" : p.id === "openai" ? "OpenAI" : "Amazon Bedrock"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-muted">Vision model</span>
                      <input
                        value={visionModel}
                        onChange={(e) => setVisionModel(e.target.value)}
                        disabled={!canEdit}
                        className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm disabled:bg-surface-muted"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-muted">Structure model</span>
                      <input
                        value={structureModel}
                        onChange={(e) => setStructureModel(e.target.value)}
                        disabled={!canEdit}
                        className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm disabled:bg-surface-muted"
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="text-xs font-medium text-muted">Vision prompt</span>
                      <textarea
                        value={visionPrompt}
                        onChange={(e) => setVisionPrompt(e.target.value)}
                        disabled={!canEdit}
                        rows={3}
                        className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm disabled:bg-surface-muted"
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="text-xs font-medium text-muted">Structure prompt</span>
                      <textarea
                        value={structurePrompt}
                        onChange={(e) => setStructurePrompt(e.target.value)}
                        disabled={!canEdit}
                        rows={4}
                        className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm disabled:bg-surface-muted"
                      />
                    </label>
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={saveConfig}
                      className="mt-3 btn btn-primary btn-md"
                    >
                      Save config
                    </button>
                  ) : (
                    <p className="mt-3 text-xs text-muted">
                      Config can be edited when status is failed, queued, or cancelled.
                    </p>
                  )}
                  {canRequeue ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={requeue}
                      className="ml-2 mt-3 rounded-lg border border-border bg-surface-raised px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50"
                    >
                      {job.status === "completed" ? "Re-run extraction" : "Requeue file task"}
                    </button>
                  ) : null}
                </>
              ) : null}

              {activeTab === "error" ? (
                <div className="alert-error-compact">
                  {job.error || "File task failed without an explicit error message."}
                </div>
              ) : null}

              {activeTab === "original" ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted">Stored file preview (same as uploaded).</p>
                  <OriginalFilePreview
                    fileId={job.fileId ?? undefined}
                    loadBlob={
                      job.documentId != null && job.customerId
                        ? () =>
                            fetchDocumentContentBlob(
                              apiBase,
                              authHeaders(),
                              job.customerId!,
                              job.documentId!
                            )
                        : undefined
                    }
                    mimeType={
                      job.file?.mimeType ??
                      (typeof job.document?.metadata?.mimeType === "string"
                        ? job.document.metadata.mimeType
                        : null)
                    }
                  />
                </div>
              ) : null}

              {activeTab === "data" ||
              activeTab === "json" ||
              activeTab === "text" ||
              activeTab === "pages" ||
              activeTab === "diagnostics" ? (
                <ResultsTabs result={resultPayload} embedded showTabs={false} activeTab={activeTab} />
              ) : null}

              {activeTab === "documents" && resultPayload?.pipelineVersion === 1 ? (
                <div className="space-y-3">
                  {resultPayload.manualOverride?.appliedAt ? (
                    <p className="text-xs text-amber-200">
                      Manual override applied{" "}
                      {resultPayload.manualOverride.appliedAt}
                      {resultPayload.manualOverride.note ? ` — ${resultPayload.manualOverride.note}` : ""}
                    </p>
                  ) : null}
                  {resultPayload.financialDocuments?.length ? (
                    <pre className="whitespace-pre-wrap break-words rounded-xl border border-border bg-surface-muted p-4 font-mono text-xs text-ink/80">
                      {JSON.stringify(resultPayload.financialDocuments, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted">No financial documents.</p>
                  )}
                </div>
              ) : null}

              {activeTab === "segments" && resultPayload?.pipelineVersion === 1 ? (
                <div className="space-y-2">
                  {resultPayload.segments?.length ? (
                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full border-collapse text-left text-sm">
                        <thead className="border-b border-border bg-surface-muted">
                          <tr>
                            <th className="px-3 py-2">Page</th>
                            <th className="px-3 py-2">Type</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2">Financial doc</th>
                          </tr>
                        </thead>
                        <tbody>
                          {resultPayload.segments.map((s) => (
                            <tr key={s.id} className="border-b border-border-subtle odd:bg-surface-raised even:bg-surface-muted/70">
                              <td className="px-3 py-2">{s.pageNumber}</td>
                              <td className="px-3 py-2">{s.type ?? "—"}</td>
                              <td className="px-3 py-2">{s.status}</td>
                              <td className="break-all px-3 py-2 font-mono text-xs">
                                {s.financialDocumentId ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">No segments.</p>
                  )}
                </div>
              ) : null}

              {activeTab === "cost" ? (
                <div className="space-y-4">
                  <h2 className="text-sm font-semibold text-ink">AI usage and cost</h2>
                  {costLoading ? <p className="text-sm text-muted">Loading…</p> : null}
                  {costErr ? <p className="text-sm text-red-400">{costErr}</p> : null}
                  {!costLoading && !costErr && costSummary ? (
                    <>
                      <p className="text-sm text-ink-soft">
                        <span className="font-medium text-ink">{costSummary.executionCount}</span> API call
                        {costSummary.executionCount === 1 ? "" : "s"} recorded.
                      </p>
                      {(costSummary.lines ?? []).length ? (
                        <div className="overflow-x-auto rounded-xl border border-border">
                          <table className="w-full border-collapse text-left text-sm">
                            <thead className="border-b border-border bg-surface-muted">
                              <tr>
                                <th className="px-3 py-2">Provider</th>
                                <th className="px-3 py-2">Model</th>
                                <th className="px-3 py-2">Type</th>
                                <th className="px-3 py-2 text-right">Price (per M)</th>
                                <th className="px-3 py-2 text-right">Actual cost</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(costSummary.lines ?? []).map((line) => {
                                const key = costLineKey(line);
                                const { cost: effectiveCost } = effectiveLineCost(line, manualPricePerM);
                                const cur = line.currency ?? costSummary.currency ?? "USD";
                                const needsManual = line.pricePerMillion == null;
                                const manualRaw = manualPricePerM[key] ?? "";
                                return (
                                  <tr
                                    key={key}
                                    className="border-b border-border-subtle odd:bg-surface-raised even:bg-surface-muted/70"
                                  >
                                    <td className="px-3 py-2 font-medium">{line.provider}</td>
                                    <td className="max-w-[14rem] truncate px-3 py-2 font-mono text-xs" title={line.model}>
                                      {line.model}
                                    </td>
                                    <td className="px-3 py-2 capitalize">
                                      {line.tokenType}
                                      <span className="ml-1 text-muted-soft">({line.tokens.toLocaleString()} tok)</span>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      {needsManual ? (
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          placeholder="e.g. 2.50"
                                          className="w-28 rounded border border-border px-2 py-1 text-right font-mono text-xs tabular-nums"
                                          value={manualRaw}
                                          onChange={(e) =>
                                            setManualPricePerM((prev) => ({ ...prev, [key]: e.target.value }))
                                          }
                                        />
                                      ) : (
                                        <span className="tabular-nums">
                                          {cur} {line.pricePerMillion!.toFixed(6)}
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums">
                                      {effectiveCost != null ? `${cur} ${effectiveCost.toFixed(4)}` : "—"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="border-t-2 border-border bg-surface-muted font-medium">
                              <tr>
                                <td colSpan={4} className="px-3 py-2 text-right">
                                  Total
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {(() => {
                                    const lines = costSummary.lines ?? [];
                                    const cur = costSummary.currency ?? lines[0]?.currency ?? "USD";
                                    let sum = 0;
                                    let any = false;
                                    let incomplete = false;
                                    for (const line of lines) {
                                      const { cost } = effectiveLineCost(line, manualPricePerM);
                                      if (cost != null) {
                                        sum += cost;
                                        any = true;
                                      } else {
                                        incomplete = true;
                                      }
                                    }
                                    if (!any) return "—";
                                    return incomplete
                                      ? `${cur} ${sum.toFixed(4)} (partial)`
                                      : `${cur} ${sum.toFixed(4)}`;
                                  })()}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      ) : (
                        <p className="text-sm text-muted">No executions recorded for this file task yet.</p>
                      )}
                      {costSummary.unpricedModelKeys.length > 0 ? (
                        <p className="text-xs text-amber-200">
                          No global pricing for: {costSummary.unpricedModelKeys.join(", ")}. Enter per-million
                          rates in the table to estimate.
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

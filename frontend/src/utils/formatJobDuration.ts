import type { JobStatus } from "../types/api";

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
}

type JobTimingInput = {
  status: JobStatus;
  processingDurationMs?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  result?: Record<string, unknown> | null;
};

const BACKFILL_START_TOLERANCE_MS = 15_000;

function isBackfilledStart(startedAt: string, createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const started = Date.parse(startedAt);
  const created = Date.parse(createdAt);
  if (!Number.isFinite(started) || !Number.isFinite(created)) return false;
  return Math.abs(started - created) <= BACKFILL_START_TOLERANCE_MS;
}

function durationFromDiagnosticLog(result: Record<string, unknown> | null | undefined): number | null {
  const log = result?.diagnosticLog;
  if (!Array.isArray(log) || log.length === 0) return null;

  let start: number | null = null;
  let end: number | null = null;
  for (const entry of log) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const at = typeof o.at === "string" ? Date.parse(o.at) : Number.NaN;
    if (!Number.isFinite(at)) continue;
    const phase = String(o.phase ?? "");
    const message = String(o.message ?? "").toLowerCase();

    if (phase === "pipeline" && message.includes("run started")) {
      if (start === null || at < start) start = at;
    }
    if (phase === "pipeline" && message.includes("completed")) {
      if (end === null || at > end) end = at;
    }
    if (phase === "pipeline_error") {
      if (end === null || at > end) end = at;
    }
  }

  if (start != null && end != null && end > start) {
    return end - start;
  }
  return null;
}

/** Processing duration from worker pickup to completion (or elapsed while running). */
export function jobDurationLabel(job: JobTimingInput, now = Date.now()): string {
  if (job.processingDurationMs != null && job.processingDurationMs > 0) {
    return formatDurationMs(job.processingDurationMs);
  }

  const terminal =
    job.status === "completed" || job.status === "failed" || job.status === "cancelled";

  if (job.startedAt && !isBackfilledStart(job.startedAt, job.createdAt)) {
    const started = Date.parse(job.startedAt);
    const completed = job.completedAt ? Date.parse(job.completedAt) : Number.NaN;

    if (Number.isFinite(started)) {
      let end: number = Number.NaN;
      if (terminal && Number.isFinite(completed)) {
        end = completed;
      } else if (job.status === "processing") {
        end = now;
      } else if (terminal && job.updatedAt) {
        const updated = Date.parse(job.updatedAt);
        if (Number.isFinite(updated) && updated > started) end = updated;
      }

      if (Number.isFinite(end) && end > started) {
        return formatDurationMs(end - started);
      }
    }
  }

  const fromLog = durationFromDiagnosticLog(job.result);
  if (fromLog != null) {
    return formatDurationMs(fromLog);
  }

  return "—";
}

export function jobDurationSuffix(job: JobTimingInput): string {
  if (job.status === "processing") return " (running)";
  if (job.status === "queued") return "";
  return "";
}

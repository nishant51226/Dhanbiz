import type { Job } from "../entities/job.entity.js";

export function jobProcessingStartFields(): Pick<Job, "startedAt" | "completedAt"> {
  return { startedAt: new Date(), completedAt: null };
}

export function jobTimingResetFields(): Pick<Job, "startedAt" | "completedAt" | "processingDurationMs"> {
  return { startedAt: null, completedAt: null, processingDurationMs: null };
}

export function parseDiagnosticLogTimes(result: unknown): { start: Date; end: Date } | null {
  if (!result || typeof result !== "object") return null;
  const log = (result as Record<string, unknown>).diagnosticLog;
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
    return { start: new Date(start), end: new Date(end) };
  }
  return null;
}

export function computeProcessingDurationMs(input: {
  startedAt: Date | null | undefined;
  completedAt: Date | null | undefined;
  result?: unknown;
}): number | null {
  const completedAt = input.completedAt ?? null;
  let startedAt = input.startedAt ?? null;

  if (!startedAt) {
    const fromLog = parseDiagnosticLogTimes(input.result);
    if (fromLog) startedAt = fromLog.start;
  }

  if (startedAt && completedAt) {
    const ms = completedAt.getTime() - startedAt.getTime();
    if (ms > 0) return ms;
  }

  const fromLog = parseDiagnosticLogTimes(input.result);
  if (fromLog) {
    const ms = fromLog.end.getTime() - fromLog.start.getTime();
    if (ms > 0) return ms;
  }

  return null;
}

/** Persist terminal timing for completed / failed / cancelled jobs. */
export function jobTerminalTimingFields(ctx?: {
  startedAt?: Date | null;
  result?: unknown;
}): Pick<Job, "completedAt" | "processingDurationMs"> & Partial<Pick<Job, "startedAt">> {
  const completedAt = new Date();
  const startedAt = ctx?.startedAt ?? null;
  const processingDurationMs = computeProcessingDurationMs({
    startedAt,
    completedAt,
    result: ctx?.result,
  });

  const out: Pick<Job, "completedAt" | "processingDurationMs"> & Partial<Pick<Job, "startedAt">> = {
    completedAt,
    processingDurationMs,
  };

  if (!startedAt) {
    const fromLog = parseDiagnosticLogTimes(ctx?.result);
    if (fromLog) out.startedAt = fromLog.start;
  }

  return out;
}

/** @deprecated Use jobTerminalTimingFields */
export function jobTerminalFields(): Pick<Job, "completedAt"> {
  return { completedAt: new Date() };
}

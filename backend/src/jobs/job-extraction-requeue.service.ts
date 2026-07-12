import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { formatEffectiveAiModelsLog, resolveEffectiveModels } from "../ai/providers/factory.js";
import { appendJobDiagnostic } from "../extraction/job-diagnostics.js";
import type { JobDiagnosticEntry } from "../extraction/financial-types.js";
import { sanitizeStringsForPgJsonb } from "../extraction/sanitize-for-pg-jsonb.js";
import { ExtractionPersistenceService } from "../extraction/extraction-persistence.service.js";
import { Job, JobStatus, JobType } from "../entities/job.entity";
import { QueueService } from "../queue/queue.service";

type JobPreviewRow = {
  id: string;
  type: JobType;
  status: JobStatus;
  customerId: string;
};

@Injectable()
export class JobExtractionRequeueService {
  private readonly log = new Logger(JobExtractionRequeueService.name);

  constructor(
    private readonly queue: QueueService,
    private readonly extractionPersistence: ExtractionPersistenceService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Re-run extraction on the same job row (no re-upload). Failed/cancelled jobs may resume
   * from checkpoints; completed jobs reset progress and clear persisted extraction rows.
   * Queued jobs can be force re-enqueued when stuck (cancels stale pg-boss message).
   */
  async requeue(jobId: string): Promise<Job> {
    const preview = await this.loadPreviewAsAdmin(jobId);
    if (preview.type !== JobType.extraction) {
      throw new BadRequestException("Only extraction jobs can be requeued");
    }
    if (preview.status === JobStatus.processing) {
      throw new BadRequestException("Job is already processing; cancel it first");
    }
    if (
      preview.status !== JobStatus.failed &&
      preview.status !== JobStatus.cancelled &&
      preview.status !== JobStatus.completed &&
      preview.status !== JobStatus.queued
    ) {
      throw new BadRequestException("Job cannot be requeued");
    }

    if (preview.status === JobStatus.queued) {
      this.log.log(`[Job ${jobId}] force re-enqueue (stuck queued)`);
      try {
        await this.queue.forceReEnqueueExtraction(jobId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await this.markFailedAsAdmin(jobId, `Queue failed: ${msg}`);
        throw new ServiceUnavailableException(`Queue failed: ${msg}`);
      }
      return this.reloadJobAsAdmin(jobId);
    }

    const restartFromScratch =
      preview.status === JobStatus.completed || preview.status === JobStatus.cancelled;
    if (restartFromScratch) {
      this.log.log(`[Job ${jobId}] clearing persisted extraction rows`);
      await this.extractionPersistence.clearForJob(jobId, preview.customerId);
    }

    const jobForLog = await this.reloadJobAsAdmin(jobId);
    const models = resolveEffectiveModels(this.config, jobForLog);
    const resumeCp =
      jobForLog.result && typeof jobForLog.result === "object"
        ? (jobForLog.result as Record<string, unknown>).pipelineCheckpoint
        : null;
    this.log.log(
      `[Job ${jobId}] requeue from status=${jobForLog.status} checkpoint=${String(resumeCp ?? "none")} pct=${jobForLog.percentCompleted ?? 0} models: ${formatEffectiveAiModelsLog(models)}`,
    );

    this.log.log(`[Job ${jobId}] prepareJobRowForRequeue start`);
    await this.prepareJobRowForRequeue(jobId, jobForLog, restartFromScratch, resumeCp);
    this.log.log(`[Job ${jobId}] prepareJobRowForRequeue done`);

    this.log.log(`[Job ${jobId}] calling enqueueExtraction`);
    try {
      await this.queue.enqueueExtraction(jobId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.markFailedAsAdmin(jobId, `Queue failed: ${msg}`);
      throw new ServiceUnavailableException(`Queue failed: ${msg}`);
    }
    this.log.log(`[Job ${jobId}] enqueueExtraction done`);

    const reloaded = await this.reloadJobAsAdmin(jobId);
    if (reloaded.status !== JobStatus.queued) {
      this.log.error(`[Job ${jobId}] requeue finished with status=${reloaded.status} (expected queued)`);
    }
    return reloaded;
  }

  private async loadPreviewAsAdmin(jobId: string): Promise<JobPreviewRow> {
    const rows = (await this.queue.runAdminJobWrite(async (manager) =>
      manager.query(
        `SELECT id, type, status, customer_id AS "customerId"
         FROM jobs WHERE id = $1::uuid AND deleted_at IS NULL`,
        [jobId],
      ),
    )) as JobPreviewRow[];
    const preview = rows[0];
    if (!preview) {
      throw new NotFoundException("job not found");
    }
    return preview;
  }

  /** Commits before pg-boss send — raw SQL on app pool (not worker pool). */
  private async prepareJobRowForRequeue(
    jobId: string,
    job: Job,
    restartFromScratch: boolean,
    resumeCp: unknown,
  ): Promise<void> {
    await this.queue.runAdminJobWrite(async (manager) => {
      if (restartFromScratch) {
        const result = await manager.query(
          `UPDATE jobs
           SET status = $2, percent_completed = 0, error = NULL, result = NULL,
               started_at = NULL, completed_at = NULL, processing_duration_ms = NULL,
               pg_boss_job_id = NULL, updated_at = NOW()
           WHERE id = $1::uuid`,
          [jobId, JobStatus.queued],
        );
        this.log.log(`[Job ${jobId}] reset for requeue (rowsAffected=${this.rowCount(result)})`);
        return;
      }

      const base =
        job.result && typeof job.result === "object" ? (job.result as Record<string, unknown>) : {};
      const prior = base.diagnosticLog;
      const diagnosticLog: JobDiagnosticEntry[] = Array.isArray(prior) ? [...prior] : [];
      appendJobDiagnostic(diagnosticLog, "requeue", "Manual requeue requested", {
        fromStatus: job.status,
        checkpoint: resumeCp,
        percentCompleted: job.percentCompleted ?? 0,
        restartFromScratch: false,
      });

      const resultJson = JSON.stringify(
        sanitizeStringsForPgJsonb({ ...base, diagnosticLog }),
      );
      const statusResult = await manager.query(
        `UPDATE jobs
         SET status = $2, percent_completed = $3, error = NULL,
             pg_boss_job_id = NULL, result = $4::jsonb, updated_at = NOW()
         WHERE id = $1::uuid`,
        [jobId, JobStatus.queued, job.percentCompleted ?? 0, resultJson],
      );
      this.log.log(`[Job ${jobId}] status → queued (rowsAffected=${this.rowCount(statusResult)})`);
    });
  }

  private async markFailedAsAdmin(jobId: string, error: string): Promise<void> {
    await this.queue.runAdminJobWrite(async (manager) => {
      await manager.query(
        `UPDATE jobs SET status = $2, error = $3, updated_at = NOW() WHERE id = $1::uuid`,
        [jobId, JobStatus.failed, error],
      );
    });
  }

  private async reloadJobAsAdmin(jobId: string): Promise<Job> {
    const job = await this.queue.runAdminJobRepo(async (repo) =>
      repo.findOne({
        where: { id: jobId },
        relations: { customer: true, file: true, document: true },
        relationLoadStrategy: "query",
      }),
    );
    if (!job) {
      throw new NotFoundException("job not found");
    }
    return job;
  }

  private rowCount(result: unknown): number {
    if (Array.isArray(result) && result.length >= 2 && typeof result[1] === "number") {
      return result[1];
    }
    if (result && typeof result === "object" && "rowCount" in result) {
      const n = (result as { rowCount?: number }).rowCount;
      return typeof n === "number" ? n : 0;
    }
    return 0;
  }
}

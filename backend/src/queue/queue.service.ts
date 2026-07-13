import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import PgBoss from "pg-boss";
import { DataSource, EntityManager, Repository } from "typeorm";
import { Customer } from "../entities/customer.entity";
import { CustomerFormSubmissionEntity } from "../entities/customer-form-submission.entity";
import { CustomerUserEntity } from "../entities/customer-user.entity";
import { RoleEntity } from "../entities/role.entity";
import { UserEntity } from "../entities/user.entity";
import { DocumentEntity } from "../entities/document.entity";
import { File, FileType } from "../entities/file.entity";
import { FolderEntity } from "../entities/folder.entity";
import { SupplierEntity } from "../entities/supplier.entity";
import { Job, JobStatus, JobType } from "../entities/job.entity";
import { SubscriptionPlan } from "../entities/subscription-plan.entity";
import { PlansEntity } from "../entities/plans.entity";
import { CustomerTypeEntity } from "../entities/customer-type.entity";
import { PlanServiceEntity } from "../entities/plan-service.entity";
import { ServiceEntity } from "../entities/service.entity";
import {
  formatEffectiveAiModelsLog,
  resolveEffectiveModels,
} from "../ai/providers/factory.js";
import { ExtractPipelineService } from "../extract/extract-pipeline.service";
import { ExtractionPersistenceService } from "../extraction/extraction-persistence.service.js";
import { appendJobDiagnostic, shouldLogDiagnosticToConsole } from "../extraction/job-diagnostics.js";
import type { FinancialJobResult, JobDiagnosticEntry } from "../extraction/financial-types.js";
import { sanitizeStringsForPgJsonb } from "../extraction/sanitize-for-pg-jsonb.js";
import { S3Service } from "../s3/s3.service";
import { runWithAdminRls } from "../tenant/run-with-tenant-rls.js";
import { FileActivityLogService } from "../file-activity/file-activity-log.service.js";
import { FileActivityAction } from "../entities/file-activity-log.entity.js";
import { jobProcessingStartFields, jobTerminalTimingFields, jobTimingResetFields } from "../jobs/job-timing.util.js";
import type {
  PgBossJobMismatch,
  PgBossQueueJobRow,
  PgBossQueueStateCount,
  QueueDashboardResponse,
} from "./queue-dashboard.types.js";

const QUEUE = "extraction";
/** Background jobs keyed by customer (e.g. sync or denormalised data builds). */
export const CUSTOMERS_DATA_QUEUE = "customers_data";
export const LIBRARY_ZIP_EXPORT_QUEUE = "library_zip_export";
export const CUSTOMER_DOCUMENTS_EXPORT_QUEUE = "customer_documents_export";
/** Re-dispatch queued jobs when no worker is processing and pg-boss never picked them up. */
const STALE_QUEUED_MINUTES_DEFAULT = 5;
/** Reset processing jobs with no live pg-boss active row (crash / timeout). */
const STALE_PROCESSING_MINUTES = 20;
/** Re-enqueue processing jobs with no DB progress heartbeat (hung LLM / worker). */
const STALE_HUNG_PROCESSING_MINUTES = 30;
/** pg-boss default is 15 min; multi-page extraction can exceed that. */
const EXTRACTION_EXPIRE_SECONDS = 4 * 60 * 60;
/** Parallel `work()` subscribers on the extraction queue (one hung Bedrock call must not stall all jobs). */
const EXTRACTION_WORKER_COUNT = 2;

function parseResumeFromJobResult(result: Record<string, unknown> | null | undefined): FinancialJobResult | null {
  if (!result || typeof result !== "object") return null;
  const cp = result.pipelineCheckpoint as string | undefined;
  if (!cp || cp === "complete") return null;
  if (
    ![
      "text_layer_done",
      "text_in_progress",
      "text_extracted",
      "llm_in_progress",
      "structured",
      "merged",
    ].includes(cp)
  ) {
    return null;
  }
  return result as unknown as FinancialJobResult;
}

function percentFromCheckpoint(partial: FinancialJobResult): number {
  switch (partial.pipelineCheckpoint) {
    case "text_layer_done":
      return 12;
    case "text_in_progress": {
      const n = Math.max(partial.segments?.length ?? 0, 1);
      const i = partial.textNextPageIndex ?? 0;
      return 12 + Math.floor((12 * i) / n);
    }
    case "text_extracted":
      return 24;
    case "llm_in_progress": {
      const n = Math.max(partial.segments?.length ?? 0, 1);
      const i = partial.llmNextSegmentIndex ?? 0;
      return 25 + Math.floor((55 * i) / n);
    }
    case "structured":
      return 80;
    case "merged":
      return 82;
    case "complete":
      return 100;
    default:
      return 1;
  }
}

/** Thrown when progress sees DB status `cancelled` so the pipeline stops and the worker exits cleanly. */
export class JobCancelledError extends Error {
  constructor() {
    super("job cancelled");
    this.name = "JobCancelledError";
  }
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(QueueService.name);
  private boss: PgBoss | null = null;
  private workerDataSource: DataSource | null = null;
  /** Job ids currently inside an extraction `work()` handler (parallel workers). */
  private readonly extractionJobsInFlight = new Set<string>();
  private lastExtractionPickupAt: Date | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly moduleRef: ModuleRef,
    @InjectDataSource() private readonly appDataSource: DataSource,
    @InjectRepository(Job) private readonly jobRepo: Repository<Job>,
    private readonly extract: ExtractPipelineService,
    private readonly extractionPersistence: ExtractionPersistenceService,
    private readonly s3: S3Service,
    private readonly fileActivity: FileActivityLogService,
  ) {}

  async onModuleInit(): Promise<void> {
    const databaseUrl = this.config.get<string>("DATABASE_URL") ?? "";
    const databaseUrlAdmin = this.config.get<string>("DATABASE_URL_ADMIN") ?? "";
    const url = databaseUrlAdmin || databaseUrl;
    if (!url) {
      this.log.warn("DATABASE_URL_ADMIN/DATABASE_URL missing; queue worker not started");
      return;
    }
    const boss = new PgBoss(url);
    boss.on("error", (err: Error) => {
      this.log.error(`pg-boss error: ${err.message}`, err.stack);
    });
    await boss.start();
    try {
      await boss.createQueue(QUEUE);
      await boss.createQueue(CUSTOMERS_DATA_QUEUE);
      await boss.createQueue(LIBRARY_ZIP_EXPORT_QUEUE);
      await boss.createQueue(CUSTOMER_DOCUMENTS_EXPORT_QUEUE);
    } catch {
      /* queue may already exist */
    }
    this.boss = boss;
    const serverModels = resolveEffectiveModels(this.config);
    this.log.log(
      `Extraction worker AI defaults: ${formatEffectiveAiModelsLog(serverModels)} (AI_PROVIDER_DEFAULT=${this.config.get<string>("AI_PROVIDER_DEFAULT") ?? "ollama"})`,
    );
    this.workerDataSource = new DataSource({
      type: "postgres",
      url,
      entities: [
        Customer,
        CustomerFormSubmissionEntity,
        CustomerUserEntity,
        UserEntity,
        RoleEntity,
        File,
        Job,
        SubscriptionPlan,
        DocumentEntity,
        FolderEntity,
        SupplierEntity,
        PlansEntity,
        CustomerTypeEntity,
        PlanServiceEntity,
        ServiceEntity,
      ],
      synchronize: false,
      migrationsRun: false,
      extra: {
        max: Math.max(8, EXTRACTION_WORKER_COUNT * 4),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      },
    });
    await this.workerDataSource.initialize();
    this.log.log(`Queue worker started for "${QUEUE}"`);

    for (let slot = 1; slot <= EXTRACTION_WORKER_COUNT; slot++) {
      const workerSlot = slot;
      await boss.work(QUEUE, { batchSize: 1 }, async (jobs) => {
        const j = jobs[0];
        if (!j?.data) return;
        const { jobId } = j.data as { jobId: string };
        this.lastExtractionPickupAt = new Date();
        this.extractionJobsInFlight.add(jobId);
        this.log.log(
          `Picked queued job ${jobId} (pgBossId=${j.id}, worker=${workerSlot}/${EXTRACTION_WORKER_COUNT}, inFlight=${this.extractionJobsInFlight.size})`,
        );
        try {
          await this.runExtractionJob(jobId);
        } finally {
          this.extractionJobsInFlight.delete(jobId);
          this.log.log(
            `Extraction handler finished for job ${jobId} (worker=${workerSlot}, inFlight=${this.extractionJobsInFlight.size})`,
          );
        }
      });
    }
    this.log.log(
      `pg-boss work() subscribed for "${QUEUE}" ×${EXTRACTION_WORKER_COUNT} parallel workers (batchSize=1 each)`,
    );

    await boss.work(LIBRARY_ZIP_EXPORT_QUEUE, { batchSize: 1 }, async (jobs) => {
      const j = jobs[0];
      if (!j?.data) return;
      const { exportId } = j.data as { exportId?: string };
      if (!exportId) {
        this.log.warn(`library_zip_export job missing exportId (pgBossId=${j.id})`);
        return;
      }
      this.log.log(`Picked library export ${exportId} (pgBossId=${j.id})`);
      const { LibraryExportService } = await import("../documents/library-export.service.js");
      const libraryExport = this.moduleRef.get(LibraryExportService, { strict: false });
      if (!libraryExport) {
        this.log.error(`LibraryExportService unavailable for export ${exportId}`);
        return;
      }
      await libraryExport.processExport(exportId);
    });
    this.log.log(`Queue worker also listening on "${LIBRARY_ZIP_EXPORT_QUEUE}"`);

    await boss.work(CUSTOMER_DOCUMENTS_EXPORT_QUEUE, { batchSize: 1 }, async (jobs) => {
      const j = jobs[0];
      if (!j?.data) return;
      const { exportId } = j.data as { exportId?: string };
      if (!exportId) {
        this.log.warn(`customer_documents_export job missing exportId (pgBossId=${j.id})`);
        return;
      }
      this.log.log(`Picked customer documents export ${exportId} (pgBossId=${j.id})`);
      const { CustomerDocumentsExportJobService } = await import(
        "../reports/customer-documents-export-job.service.js"
      );
      const exportJobs = this.moduleRef.get(CustomerDocumentsExportJobService, { strict: false });
      if (!exportJobs) {
        this.log.error(`CustomerDocumentsExportJobService unavailable for export ${exportId}`);
        return;
      }
      await exportJobs.processExport(exportId);
    });
    this.log.log(`Queue worker also listening on "${CUSTOMER_DOCUMENTS_EXPORT_QUEUE}"`);

    void this.recoverInterruptedProcessingOnStartup()
      .then(() => this.recoverStaleExtractionJobs())
      .catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.error(`Stale extraction job recovery failed: ${msg}`);
    });
  }

  /**
   * After API/worker restart, `jobs.status=processing` rows may be orphaned while pg-boss still
   * shows `active`. Re-queue them so the new worker resumes from the last checkpoint.
   */
  private async recoverInterruptedProcessingOnStartup(): Promise<void> {
    if (!this.boss || !this.workerDataSource) return;

    const interrupted = await this.withAdminJobRepo((r) =>
      r
        .createQueryBuilder("j")
        .select(["j.id", "j.pgBossJobId", "j.percentCompleted"])
        .where("j.type = :type", { type: JobType.extraction })
        .andWhere("j.status = :status", { status: JobStatus.processing })
        .getMany(),
    );

    for (const row of interrupted) {
      this.log.warn(
        `Startup recovery: re-queue interrupted processing job ${row.id} (pct=${row.percentCompleted ?? 0})`,
      );
      await this.appendResultDiagnostic(row.id, "recovery", "Startup recovery: interrupted processing re-queued", {
        reason: "server_restart",
        percentCompleted: row.percentCompleted ?? 0,
      });
      await this.cancelPgBossExtractionJob(row.pgBossJobId);
      await this.withAdminJobRepo((r) =>
        r.update(row.id, {
          status: JobStatus.queued,
          error: null,
          pgBossJobId: null,
          ...jobTimingResetFields(),
        }),
      );
      try {
        await this.forceReEnqueueExtraction(row.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await this.withAdminJobRepo((r) =>
          r.update(row.id, {
            status: JobStatus.failed,
            ...jobTerminalTimingFields(),
            error: `Startup recovery failed: ${msg}`,
          }),
        );
        this.log.error(`Startup recovery failed for job ${row.id}: ${msg}`);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.boss) {
      await this.boss.stop({ graceful: true, timeout: 30_000 });
      this.boss = null;
    }
    if (this.workerDataSource) {
      await this.workerDataSource.destroy();
      this.workerDataSource = null;
    }
  }

  private async appendResultDiagnostic(
    jobId: string,
    phase: string,
    message: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    const row = await this.withAdminJobRepo((r) => r.findOne({ where: { id: jobId } }));
    if (!row) return;
    const base =
      row.result && typeof row.result === "object" ? (row.result as Record<string, unknown>) : {};
    const prior = base.diagnosticLog;
    const diagnosticLog: JobDiagnosticEntry[] = Array.isArray(prior) ? [...prior] : [];
    const entry = appendJobDiagnostic(diagnosticLog, phase, message, meta);
    if (shouldLogDiagnosticToConsole(phase)) {
      const metaStr = meta ? ` | ${JSON.stringify(meta).slice(0, 1600)}` : "";
      this.log.log(`[Job ${jobId}] ${entry.at} ${phase}: ${message}${metaStr}`);
    }
    await this.withAdminJobRepo((r) =>
      r.update(jobId, {
        result: JSON.parse(
          JSON.stringify(sanitizeStringsForPgJsonb({ ...base, diagnosticLog })),
        ) as Record<string, unknown>,
      } as any),
    );
  }

  private staleQueuedMinutes(): number {
    const v = this.config.get<string>("EXTRACTION_STALE_QUEUED_MINUTES");
    const n = v ? Number.parseInt(v, 10) : NaN;
    return Number.isFinite(n) && n >= 1 ? n : STALE_QUEUED_MINUTES_DEFAULT;
  }

  /**
   * Requeue / recovery must persist `status=queued` with admin RLS before pg-boss send.
   * HTTP-scoped updates can fail silently under tenant RLS; worker skips `cancelled` rows.
   */
  private async ensureJobQueuedBeforeEnqueue(jobId: string): Promise<void> {
    await this.runAdminJobWrite(async (manager) => {
      const rows = (await manager.query(`SELECT status FROM jobs WHERE id = $1::uuid`, [jobId])) as Array<{
        status: JobStatus;
      }>;
      const row = rows[0];
      if (!row) {
        this.log.warn(`ensureJobQueued: job ${jobId} not found`);
        return;
      }
      if (row.status === JobStatus.processing || row.status === JobStatus.queued) {
        return;
      }
      const resetPct =
        row.status === JobStatus.cancelled || row.status === JobStatus.completed;
      const result = resetPct
        ? await manager.query(
            `UPDATE jobs SET status = $2, error = NULL, percent_completed = 0,
                    started_at = NULL, completed_at = NULL, processing_duration_ms = NULL, updated_at = NOW()
             WHERE id = $1::uuid`,
            [jobId, JobStatus.queued],
          )
        : await manager.query(
            `UPDATE jobs SET status = $2, error = NULL, updated_at = NOW() WHERE id = $1::uuid`,
            [jobId, JobStatus.queued],
          );
      const affected = this.sqlRowCount(result);
      this.log.log(
        `[Job ${jobId}] ensureJobQueued: ${row.status} → queued (rowsAffected=${affected})`,
      );
      if (!affected) {
        this.log.error(`[Job ${jobId}] ensureJobQueued: update affected 0 rows`);
      }
    });
  }

  /** Persist pg-boss id + queued status with admin RLS (required for worker pickup). */
  private async persistExtractionEnqueue(jobId: string, pgBossJobId: string): Promise<void> {
    await this.runAdminJobWrite(async (manager) => {
      const result = await manager.query(
        `UPDATE jobs SET status = $2, pg_boss_job_id = $3, error = NULL, updated_at = NOW() WHERE id = $1::uuid`,
        [jobId, JobStatus.queued, pgBossJobId],
      );
      if (!this.sqlRowCount(result)) {
        this.log.error(
          `[Job ${jobId}] persistExtractionEnqueue: 0 rows updated (pgBossId=${pgBossJobId})`,
        );
      }
    });
  }

  async enqueueExtraction(jobId: string, queue: string = QUEUE): Promise<string> {
    if (!this.boss) {
      throw new Error("Queue not available");
    }
    await this.ensureJobQueuedBeforeEnqueue(jobId);
    const pgBossJobId = await this.boss.send(
      queue,
      { jobId },
      { retryLimit: 0, expireInSeconds: EXTRACTION_EXPIRE_SECONDS },
    );
    if (!pgBossJobId) {
      throw new Error("pg-boss send returned null (queue unavailable or job rejected)");
    }
    await this.persistExtractionEnqueue(jobId, pgBossJobId);
    const job = await this.runAdminJobRepo((jobRepo) =>
      jobRepo.findOne({
        where: { id: jobId },
        select: {
          aiProvider: true,
          visionModel: true,
          structureModel: true,
          status: true,
          percentCompleted: true,
          result: true,
          pgBossJobId: true,
        },
      }),
    );
    if (job) {
      const models = resolveEffectiveModels(this.config, job);
      const cp =
        job.result && typeof job.result === "object"
          ? (job.result as Record<string, unknown>).pipelineCheckpoint
          : null;
      this.log.log(
        `Enqueued extraction job ${jobId} (pgBossId=${pgBossJobId}) status=${job.status} pct=${job.percentCompleted ?? 0} checkpoint=${String(cp ?? "none")} AI: ${formatEffectiveAiModelsLog(models)}`,
      );
      if (job.status !== JobStatus.queued) {
        this.log.error(
          `[Job ${jobId}] status=${job.status} after enqueue — worker will skip (expected queued)`,
        );
      }
      if (job.pgBossJobId !== pgBossJobId) {
        this.log.error(
          `[Job ${jobId}] pgBossJobId mismatch after persist (db=${job.pgBossJobId ?? "null"} sent=${pgBossJobId})`,
        );
      }
    } else {
      this.log.log(`Enqueued extraction job ${jobId} (pgBossId=${pgBossJobId})`);
    }
    return pgBossJobId;
  }

  async enqueueCustomersData(customerId: string): Promise<string | null> {
    if (!this.boss) {
      throw new Error("Queue not available");
    }
    const trimmed = customerId.trim();
    if (!trimmed) {
      throw new BadRequestException("customerId is required");
    }
    const pgBossJobId = await this.boss.send(CUSTOMERS_DATA_QUEUE, { customerId: trimmed }, { retryLimit: 0 });
    this.log.log(`Enqueued customers_data for customer ${trimmed} (pgBossId=${pgBossJobId})`);
    return pgBossJobId;
  }

  /** Enqueue a library ZIP export (payload: `{ exportId }`). */
  async enqueueLibraryZipExport(exportId: string): Promise<string | null> {
    if (!this.boss) {
      throw new Error("Queue not available");
    }
    const trimmed = exportId.trim();
    if (!trimmed) {
      throw new BadRequestException("exportId is required");
    }
    const pgBossJobId = await this.boss.send(LIBRARY_ZIP_EXPORT_QUEUE, { exportId: trimmed }, { retryLimit: 0 });
    this.log.log(`Enqueued library_zip_export ${trimmed} (pgBossId=${pgBossJobId})`);
    return pgBossJobId;
  }

  /** Enqueue a customer documents Excel export (payload: `{ exportId }`). */
  async enqueueCustomerDocumentsExport(exportId: string): Promise<string | null> {
    if (!this.boss) {
      throw new Error("Queue not available");
    }
    const trimmed = exportId.trim();
    if (!trimmed) {
      throw new BadRequestException("exportId is required");
    }
    const pgBossJobId = await this.boss.send(
      CUSTOMER_DOCUMENTS_EXPORT_QUEUE,
      { exportId: trimmed },
      { retryLimit: 0 },
    );
    if (!pgBossJobId) {
      this.log.warn(
        `customer_documents_export send returned null for ${trimmed} (queue missing or pg-boss rejected job)`,
      );
    } else {
      this.log.log(`Enqueued customer_documents_export ${trimmed} (pgBossId=${pgBossJobId})`);
    }
    return pgBossJobId;
  }

  /**
   * Marks the job cancelled and removes it from pg-boss if still queued.
   * If already processing, the worker stops at the next progress checkpoint.
   */
  async cancelJob(jobId: string): Promise<void> {
    const job = await this.runAdminJobRepo((repo) => repo.findOne({ where: { id: jobId } }));
    if (!job) {
      throw new NotFoundException("job not found (it may have been deleted with its file or document)");
    }
    if (job.status !== JobStatus.queued && job.status !== JobStatus.processing) {
      throw new BadRequestException("Only queued or processing jobs can be cancelled");
    }
    if (this.boss && job.pgBossJobId) {
      try {
        await this.boss.cancel(QUEUE, job.pgBossJobId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`pg-boss cancel ${job.pgBossJobId}: ${msg}`);
      }
    }
    await this.runAdminJobRepo((repo) =>
      repo.update(jobId, {
        status: JobStatus.cancelled,
        error: "Cancelled by user",
        percentCompleted: 0,
        pgBossJobId: null,
        result: null,
        ...jobTerminalTimingFields({ startedAt: job.startedAt, result: job.result }),
      }),
    );
    this.fileActivity.tryLogJob(
      { ...job, status: JobStatus.cancelled },
      FileActivityAction.job_cancelled,
      { fromStatus: job.status, toStatus: JobStatus.cancelled },
    );
  }

  /**
   * Each call runs in its own committed transaction with admin RLS GUCs so:
   * - UI polls see `processing` / `percent_completed` without waiting for the pipeline to finish.
   * - `extractionPersistence.replaceForJob` is not blocked by a long-held row lock on `jobs`.
   */
  private adminDataSource(): DataSource {
    if (this.workerDataSource?.isInitialized) {
      return this.workerDataSource;
    }
    return this.appDataSource;
  }

  /** pg-boss rows in `active` for the extraction queue (worker is executing a handler). */
  private async countActivePgBossExtractionJobs(): Promise<number> {
    if (!this.boss) return 0;
    const rows = (await this.runAdminJobWrite((manager) =>
      manager.query(
        `SELECT COUNT(*)::int AS count
         FROM pgboss.job
         WHERE name = $1 AND state = 'active'`,
        [QUEUE],
      ),
    )) as Array<{ count: number }>;
    return rows[0]?.count ?? 0;
  }

  private async countCreatedPgBossExtractionJobs(): Promise<number> {
    if (!this.boss) return 0;
    const rows = (await this.runAdminJobWrite((manager) =>
      manager.query(
        `SELECT COUNT(*)::int AS count
         FROM pgboss.job
         WHERE name = $1 AND state = 'created'`,
        [QUEUE],
      ),
    )) as Array<{ count: number }>;
    return rows[0]?.count ?? 0;
  }

  /**
   * Logs when pg-boss has waiting jobs but nothing is being picked up — usually a hung handler
   * (blocked Bedrock/Ollama call) or a dead work() subscription. Re-enqueue alone cannot fix this.
   */
  private logExtractionWorkerStallIfNeeded(createdPgBoss: number, activePgBoss: number): void {
    if (createdPgBoss <= 0 || activePgBoss > 0) return;

    const inFlight = this.extractionJobsInFlight.size;
    const staleMin = this.staleQueuedMinutes();
    const pickupAgeMin =
      this.lastExtractionPickupAt == null
        ? Number.POSITIVE_INFINITY
        : (Date.now() - this.lastExtractionPickupAt.getTime()) / 60_000;

    if (inFlight > 0) {
      if (pickupAgeMin >= staleMin) {
        const slotsHung = inFlight >= EXTRACTION_WORKER_COUNT ? "all" : `${inFlight}/${EXTRACTION_WORKER_COUNT}`;
        this.log.error(
          `CRITICAL: extraction handler(s) in-flight for ${Math.floor(pickupAgeMin)}m (${slotsHung} workers, jobs=${[...this.extractionJobsInFlight].join(",")}) ` +
            `but pg-boss shows 0 active — likely hung on vision/LLM (Bedrock). Restart the backend container to unblock the queue.`,
        );
      }
      return;
    }

    if (pickupAgeMin >= staleMin) {
      this.log.error(
        `CRITICAL: ${createdPgBoss} extraction job(s) in pg-boss "created" but no worker has picked any for ` +
          `${Math.floor(pickupAgeMin)}m (${EXTRACTION_WORKER_COUNT} workers registered). Restart the backend container.`,
      );
    }
  }

  /**
   * Admin RLS writes for HTTP requeue/enqueue — uses app DataSource, not the worker pool
   * (extraction holds worker connections; sharing that pool caused requeue to hang).
   */
  async runAdminJobWrite<T>(fn: (manager: EntityManager) => Promise<T>): Promise<T> {
    return runWithAdminRls(this.appDataSource, fn);
  }

  async runAdminJobRepo<T>(fn: (repo: Repository<Job>) => Promise<T>): Promise<T> {
    return this.runAdminJobWrite(async (m) => fn(m.getRepository(Job)));
  }

  private sqlRowCount(result: unknown): number {
    if (Array.isArray(result) && result.length >= 2 && typeof result[1] === "number") {
      return result[1];
    }
    if (result && typeof result === "object" && "rowCount" in result) {
      const n = (result as { rowCount?: number }).rowCount;
      return typeof n === "number" ? n : 0;
    }
    return 0;
  }

  /** Worker extraction / recovery — dedicated pool separate from HTTP requeue. */
  private async withAdminJobRepo<T>(fn: (repo: Repository<Job>) => Promise<T>): Promise<T> {
    return runWithAdminRls(this.adminDataSource(), async (m) => fn(m.getRepository(Job)));
  }

  private async runExtractionJob(jobId: string): Promise<void> {
    this.log.log(`runExtractionJob started: ${jobId}`);

    const row = await this.withAdminJobRepo((jobRepo) =>
      jobRepo.findOne({
        where: { id: jobId },
        relations: { file: true, document: { folder: true } },
      }),
    );
    if (!row || row.type !== JobType.extraction) {
      this.log.warn(
        `runExtractionJob skip: job ${jobId} missing or not extraction (stale pg-boss message, or DB read blocked by RLS without admin session)`,
      );
      return;
    }
    if (row.status === JobStatus.completed || row.status === JobStatus.cancelled) {
      this.log.warn(
        `runExtractionJob skip: job ${jobId} status=${row.status} — worker will not run (requeue may have failed to set status=queued)`,
      );
      return;
    }

    const pickupCheckpoint =
      row.result && typeof row.result === "object"
        ? (row.result as Record<string, unknown>).pipelineCheckpoint
        : null;
    this.log.log(
      `[Job ${jobId}] worker picked up job status=${row.status} pct=${row.percentCompleted ?? 0} checkpoint=${String(pickupCheckpoint ?? "none")}`,
    );

    const pre = await this.withAdminJobRepo((jobRepo) => jobRepo.findOne({ where: { id: jobId } }));
    if (pre?.status === JobStatus.cancelled) {
      return;
    }

    const fromStatus = row.status;
    await this.withAdminJobRepo((jobRepo) =>
      jobRepo.update(jobId, {
        status: JobStatus.processing,
        percentCompleted: Math.max(row.percentCompleted, 1),
        error: null,
        ...jobProcessingStartFields(),
      }),
    );
    this.fileActivity.tryLogJob(
      { ...row, status: JobStatus.processing },
      FileActivityAction.job_processing,
      { fromStatus, toStatus: JobStatus.processing },
    );
    this.log.log(`Job ${jobId} moved to processing`);

    const root = this.config.get<string>("FILE_STORAGE_ROOT");
    if (!root) {
      await this.withAdminJobRepo((jobRepo) =>
        jobRepo.update(jobId, {
          status: JobStatus.failed,
          ...jobTerminalTimingFields(),
          error: "FILE_STORAGE_ROOT not configured",
        }),
      );
      return;
    }

    const customerId = row.customerId;
    let abs: string;
    let mime: string;
    let pipelineSourceId: string;
    let persistIds: { documentId: string | null; fileId: string | null };
    let s3ObjectKey: string | null = null;

    if (row.documentId && row.document) {
      const doc = row.document;
      const folder = doc.folder;
      // Tenant scope is denormalized on `documents.customer_id`. Folders may be missing
      // (`folder_id` null) or global/supplier-scoped with `folders.customer_id` null — same
      // rules as `portal-folder-document.service` (`doc.customerId ?? folder?.customerId`).
      if (doc.customerId !== customerId) {
        await this.withAdminJobRepo((jobRepo) =>
          jobRepo.update(jobId, {
            status: JobStatus.failed,
            ...jobTerminalTimingFields(),
            error: "Document customer does not match job",
            percentCompleted: 0,
          }),
        );
        return;
      }
      if (folder?.customerId != null && folder.customerId !== customerId) {
        await this.withAdminJobRepo((jobRepo) =>
          jobRepo.update(jobId, {
            status: JobStatus.failed,
            ...jobTerminalTimingFields(),
            error: "Document folder customer does not match job",
            percentCompleted: 0,
          }),
        );
        return;
      }
      const s3Key = doc.s3Key?.trim();
      if (s3Key) {
        s3ObjectKey = s3Key;
        abs = "";
        mime =
          (typeof doc.metadata?.mimeType === "string" && doc.metadata.mimeType) || "application/octet-stream";
      } else {
        const rel = doc.fileUrl?.trim().replace(/^\/+/, "");
        if (!rel) {
          await this.withAdminJobRepo((jobRepo) =>
            jobRepo.update(jobId, {
              status: JobStatus.failed,
              ...jobTerminalTimingFields(),
              error: "Document has no file_url or s3_key for extraction",
              percentCompleted: 0,
            }),
          );
          return;
        }
        abs = path.join(root, customerId, rel);
        mime =
          (typeof doc.metadata?.mimeType === "string" && doc.metadata.mimeType) || "application/octet-stream";
      }
      pipelineSourceId = doc.id;
      persistIds = { documentId: doc.id, fileId: null };
    } else if (row.fileId && row.file) {
      const file = row.file;
      if (file.fileType !== FileType.file) {
        await this.withAdminJobRepo((jobRepo) =>
          jobRepo.update(jobId, {
            status: JobStatus.failed,
            ...jobTerminalTimingFields(),
            error: "Invalid file record for extraction",
            percentCompleted: 0,
          }),
        );
        return;
      }
      const s3Key = file.s3Key?.trim();
      if (s3Key && !file.storageRelativePath?.trim()) {
        s3ObjectKey = s3Key;
        abs = "";
        mime = file.mimeType ?? "application/octet-stream";
      } else if (file.storageRelativePath?.trim()) {
        abs = path.join(root, file.customerId, file.storageRelativePath.trim());
        mime = file.mimeType ?? "application/octet-stream";
      } else {
        await this.withAdminJobRepo((jobRepo) =>
          jobRepo.update(jobId, {
            status: JobStatus.failed,
            ...jobTerminalTimingFields(),
            error: "File has no storage path or s3_key for extraction",
            percentCompleted: 0,
          }),
        );
        return;
      }
      pipelineSourceId = file.id;
      persistIds = { documentId: null, fileId: file.id };
    } else {
      await this.withAdminJobRepo((jobRepo) =>
        jobRepo.update(jobId, {
          status: JobStatus.failed,
          ...jobTerminalTimingFields(),
          error: "Job has neither document_id nor a valid file_id",
          percentCompleted: 0,
        }),
      );
      return;
    }

    const resume = parseResumeFromJobResult(row.result as Record<string, unknown> | null);
    const resumeCp = resume?.pipelineCheckpoint;
    const needFileBuffer =
      !resume || resumeCp === "text_layer_done" || resumeCp === "text_in_progress";

    let buffer: Buffer | null = null;
    if (needFileBuffer) {
      try {
        if (s3ObjectKey) {
          buffer = await this.s3.getObjectBufferByKey(s3ObjectKey);
        } else {
          buffer = await fs.readFile(abs);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await this.withAdminJobRepo((jobRepo) =>
          jobRepo.update(jobId, {
            status: JobStatus.failed,
            ...jobTerminalTimingFields(),
            error: `Read file failed: ${msg}`,
          }),
        );
        return;
      }
    }

    const beforeRun = await this.withAdminJobRepo((jobRepo) => jobRepo.findOne({ where: { id: jobId } }));
    if (beforeRun?.status === JobStatus.cancelled) {
      return;
    }

    const vision = row.visionPrompt?.trim() || this.extract.defaultVisionPrompt();
    const structure = row.structurePrompt?.trim() || this.extract.defaultStructurePrompt();
    const runOptions =
      row.aiProvider != null || row.visionModel != null || row.structureModel != null
        ? {
            aiProvider: row.aiProvider,
            visionModel: row.visionModel,
            structureModel: row.structureModel,
          }
        : undefined;

    const resumeTyped = resume as FinancialJobResult | null;
    const priorDiag = resumeTyped?.diagnosticLog;
    const diagnosticLog: JobDiagnosticEntry[] = Array.isArray(priorDiag) ? [...priorDiag] : [];
    const pushJobDiagnostic = (phase: string, message: string, meta?: Record<string, unknown>) => {
      const entry = appendJobDiagnostic(diagnosticLog, phase, message, meta);
      if (!shouldLogDiagnosticToConsole(phase)) return;
      const metaStr = meta ? ` | ${JSON.stringify(meta).slice(0, 1600)}` : "";
      this.log.log(`[Job ${jobId}] ${entry.at} ${phase}: ${message}${metaStr}`);
    };

    const effModels = resolveEffectiveModels(this.config, row);
    pushJobDiagnostic("worker", "Extraction worker invoking pipeline", {
      fileId: persistIds.fileId,
      documentId: persistIds.documentId,
      customerId,
      mimeType: mime,
      source: s3ObjectKey ? "s3" : "disk",
      absPathTail: abs ? abs.slice(Math.max(0, abs.length - 120)) : "",
      s3KeyTail: s3ObjectKey ? s3ObjectKey.slice(Math.max(0, s3ObjectKey.length - 120)) : "",
      effectiveProvider: effModels.provider,
      effectiveVisionModel: effModels.visionModel,
      effectiveStructureModel: effModels.structureModel,
      bufferBytes: buffer?.length ?? 0,
      resumeCheckpoint: resume?.pipelineCheckpoint ?? null,
      resumeTextPageIndex: resume?.textNextPageIndex ?? null,
      resumeLlmSegmentIndex: resume?.llmNextSegmentIndex ?? null,
      segmentCountAfterResume: resume?.segments?.length ?? 0,
    });
    this.log.log(`[Job ${jobId}] using AI models: ${formatEffectiveAiModelsLog(effModels)}`);

    const onProgress = async (pct: number) => {
      await this.withAdminJobRepo(async (r) => {
        await r.update(jobId, { percentCompleted: pct });
        this.log.debug(`Job ${jobId} progress ${pct}%`);
        const latest = await r.findOne({ where: { id: jobId } });
        if (latest?.status === JobStatus.cancelled) {
          throw new JobCancelledError();
        }
      });
      if (pct === 1 || pct === 12 || pct === 24 || pct === 80 || pct === 82 || pct >= 99 || pct === 100) {
        pushJobDiagnostic("progress", `Pipeline progress ${pct}%`, { percentCompleted: pct });
      }
    };

    const onCheckpoint = async (partial: FinancialJobResult) => {
      const pct = percentFromCheckpoint(partial);
      const safePartial = sanitizeStringsForPgJsonb(partial);
      const resultJson = JSON.parse(JSON.stringify(safePartial)) as Job["result"];
      await this.withAdminJobRepo(async (r) => {
        await r.update(jobId, { result: resultJson, percentCompleted: pct } as any);
      });
      this.log.log(`Job ${jobId} checkpoint=${partial.pipelineCheckpoint} pct=${pct}`);
      pushJobDiagnostic("checkpoint", `Saved checkpoint ${partial.pipelineCheckpoint}`, {
        checkpoint: partial.pipelineCheckpoint,
        percentCompleted: pct,
        segmentCount: partial.segments?.length ?? 0,
        financialDocumentCount: partial.financialDocuments?.length ?? 0,
        textNextPageIndex: partial.textNextPageIndex ?? null,
        llmNextSegmentIndex: partial.llmNextSegmentIndex ?? null,
      });
      const cp = partial.pipelineCheckpoint;
      if (
        cp === "text_layer_done" ||
        cp === "text_in_progress" ||
        cp === "text_extracted" ||
        cp === "structured" ||
        cp === "merged" ||
        cp === "complete"
      ) {
        try {
          await this.extractionPersistence.replaceForJob(jobId, customerId, persistIds, safePartial);
          pushJobDiagnostic("persist", `DB rows updated for checkpoint ${cp}`, {
            checkpoint: cp,
            financialDocumentCount: partial.financialDocuments?.length ?? 0,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          pushJobDiagnostic("persist_error", `DB persist failed at checkpoint ${cp}`, {
            checkpoint: cp,
            error: msg.slice(0, 600),
          });
          this.log.error(`Persist extraction checkpoint for job ${jobId}: ${msg}`);
        }
      }
    };

    try {
      this.log.log(`Job ${jobId} extraction started (${formatEffectiveAiModelsLog(effModels)})`);
      const result = await this.extract.runFinancialExtraction(
        buffer,
        mime,
        { jobId, fileId: pipelineSourceId, customerId },
        vision,
        structure,
        onProgress,
        {
          ...runOptions,
          resume,
          onCheckpoint,
          diagnosticLog,
          pushJobDiagnostic,
        }
      );
      this.log.log(`Job ${jobId} extraction finished`);
      pushJobDiagnostic("pipeline", "Extraction pipeline completed", {
        financialDocumentCount: result.financialDocuments?.length ?? 0,
        segmentCount: result.segments?.length ?? 0,
        warningCount: result.warnings?.length ?? 0,
      });
      await this.withAdminJobRepo(async (r) => {
        const jobRow = await r.findOne({ where: { id: jobId } });
        if (!jobRow || jobRow.status === JobStatus.cancelled) {
          return;
        }
        jobRow.status = JobStatus.completed;
        jobRow.percentCompleted = 100;
        jobRow.error = null;
        const safeResult = sanitizeStringsForPgJsonb(result);
        const timing = jobTerminalTimingFields({ startedAt: jobRow.startedAt, result: safeResult });
        jobRow.completedAt = timing.completedAt;
        jobRow.processingDurationMs = timing.processingDurationMs;
        if (timing.startedAt && !jobRow.startedAt) {
          jobRow.startedAt = timing.startedAt;
        }
        jobRow.result = JSON.parse(JSON.stringify(safeResult)) as Record<string, unknown>;
        await r.save(jobRow);
      });
      const completedJob = await this.withAdminJobRepo((r) => r.findOne({ where: { id: jobId } }));
      if (completedJob) {
        this.fileActivity.tryLogJob(completedJob, FileActivityAction.job_completed, {
          fromStatus: JobStatus.processing,
          toStatus: JobStatus.completed,
        });
      }
      this.log.log(`Job ${jobId} completed`);
    } catch (e) {
      if (e instanceof JobCancelledError) {
        this.log.warn(`Job ${jobId} cancelled while processing`);
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error && e.stack ? e.stack : undefined;
      const cur = await this.withAdminJobRepo((r) => r.findOne({ where: { id: jobId } }));
      if (cur?.status === JobStatus.cancelled) {
        return;
      }
      await this.withAdminJobRepo((r) =>
        r.update(jobId, {
          status: JobStatus.failed,
          error: msg,
          ...jobTerminalTimingFields({
            startedAt: cur?.startedAt ?? null,
            result: {
              ...(cur?.result && typeof cur.result === "object" ? cur.result : {}),
              diagnosticLog,
              pipelineCheckpoint:
                resume?.pipelineCheckpoint ?? (cur?.result as Record<string, unknown>)?.pipelineCheckpoint,
            },
          }),
          result: JSON.parse(
            JSON.stringify({
              ...(cur?.result && typeof cur.result === "object" ? cur.result : {}),
              diagnosticLog,
              pipelineCheckpoint: resume?.pipelineCheckpoint ?? (cur?.result as Record<string, unknown>)?.pipelineCheckpoint,
            })
          ) as Record<string, unknown>,
        } as any),
      );
      pushJobDiagnostic("pipeline_error", "Extraction pipeline failed", {
        error: msg.slice(0, 800),
      });
      const failedJob = await this.withAdminJobRepo((r) => r.findOne({ where: { id: jobId } }));
      if (failedJob) {
        this.fileActivity.tryLogJob(failedJob, FileActivityAction.job_failed, {
          fromStatus: cur?.status ?? JobStatus.processing,
          toStatus: JobStatus.failed,
          summary: `Extraction job failed: ${msg.slice(0, 200)}`,
        });
      }
      this.log.error(`Job ${jobId} failed: ${msg}`);
      if (stack) {
        this.log.error(`Job ${jobId} stack: ${stack}`);
      }
    }
  }

  /**
   * Cancel any pg-boss message for this extraction job and send a fresh one.
   * Used by recovery and manual requeue of stuck `queued` rows.
   */
  async forceReEnqueueExtraction(jobId: string): Promise<string> {
    if (!this.boss) {
      throw new Error("Queue not available");
    }
    const row = await this.withAdminJobRepo((r) =>
      r.findOne({ where: { id: jobId }, select: { id: true, pgBossJobId: true } }),
    );
    if (!row) {
      throw new NotFoundException("job not found");
    }
    await this.cancelPgBossExtractionJob(row.pgBossJobId);
    await this.withAdminJobRepo((r) => r.update(jobId, { pgBossJobId: null } as any));
    return this.enqueueExtraction(jobId);
  }

  private async cancelPgBossExtractionJob(pgBossJobId: string | null | undefined): Promise<void> {
    if (!this.boss || !pgBossJobId?.trim()) return;
    try {
      await this.boss.cancel(QUEUE, pgBossJobId.trim());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`pg-boss cancel ${pgBossJobId}: ${msg}`);
    }
  }

  /**
   * Re-enqueue extraction jobs stuck in `queued` without a live pg-boss row (orphan after crash,
   * completed pg-boss job, or enqueue that returned null). Also recovers queued rows whose pg-boss
   * message stayed in `created` while no pg-boss job is active, and stale `processing` zombies.
   */
  async recoverStaleExtractionJobs(): Promise<void> {
    if (!this.boss) return;

    await this.recoverProcessingWithoutActivePgBoss();

    const createdPgBoss = await this.countCreatedPgBossExtractionJobs();
    const activePgBoss = await this.countActivePgBossExtractionJobs();
    this.logExtractionWorkerStallIfNeeded(createdPgBoss, activePgBoss);

    const orphans = await this.withAdminJobRepo((r) =>
      r
        .createQueryBuilder("j")
        .select(["j.id", "j.pgBossJobId"])
        .where("j.type = :type", { type: JobType.extraction })
        .andWhere("j.status = :status", { status: JobStatus.queued })
        .andWhere(
          `(j.pg_boss_job_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM pgboss.job b
            WHERE b.id::text = j.pg_boss_job_id
              AND b.state IN ('created', 'active', 'retry')
          ))`,
        )
        .getMany(),
    );

    for (const row of orphans) {
      this.log.warn(
        `Recovering orphan queued extraction job ${row.id} (pgBossJobId=${row.pgBossJobId ?? "null"})`,
      );
      await this.appendResultDiagnostic(row.id, "recovery", "Orphan queued job re-enqueued", {
        reason: "orphan_queued",
        priorPgBossJobId: row.pgBossJobId ?? null,
      });
      try {
        await this.forceReEnqueueExtraction(row.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.error(`Recovery enqueue failed for job ${row.id}: ${msg}`);
      }
    }

    if (activePgBoss === 0) {
      const staleMin = this.staleQueuedMinutes();
      const idleStaleQueued = await this.withAdminJobRepo((r) =>
        r
          .createQueryBuilder("j")
          .select(["j.id", "j.pgBossJobId"])
          .where("j.type = :type", { type: JobType.extraction })
          .andWhere("j.status = :status", { status: JobStatus.queued })
          // Use updated_at + pg-boss created_on — not jobs.created_at (upload time). Requeued jobs
          // have an old created_at; treating that as stale cancelled fresh pg-boss messages.
          .andWhere(`j.updated_at < NOW() - INTERVAL '${staleMin} minutes'`)
          .andWhere(
            `EXISTS (
              SELECT 1 FROM pgboss.job b
              WHERE b.id::text = j.pg_boss_job_id
                AND b.name = :queue
                AND b.state = 'created'
                AND b.created_on < NOW() - INTERVAL '${staleMin} minutes'
            )`,
            { queue: QUEUE },
          )
          .orderBy("j.updated_at", "ASC")
          // Only skip re-enqueue when every worker slot is already blocked in-process.
          .take(this.extractionJobsInFlight.size >= EXTRACTION_WORKER_COUNT ? 0 : 1)
          .getMany(),
      );

      if (idleStaleQueued.length > 0) {
        this.log.warn(
          `Idle stale queued recovery: re-enqueueing oldest ${idleStaleQueued.length} of ${createdPgBoss} waiting job(s) ` +
            `(pg-boss created >${staleMin}m, no active pg-boss worker)`,
        );
      }

      for (const row of idleStaleQueued) {
        this.log.warn(
          `Recovering idle stale queued job ${row.id} (pg-boss created, no active pg-boss worker)`,
        );
        await this.appendResultDiagnostic(row.id, "recovery", "Idle stale queued job re-enqueued", {
          reason: "idle_stale_queued",
          priorPgBossJobId: row.pgBossJobId ?? null,
        });
        try {
          await this.forceReEnqueueExtraction(row.id);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          this.log.error(`Idle stale recovery failed for job ${row.id}: ${msg}`);
        }
      }
    }

    await this.recoverStaleProcessingJobs();
  }

  /**
   * DB says `processing` but pg-boss has no `active` row — worker crashed, job expired, or handler
   * hung after pg-boss released the lease. Unblocks the queue without waiting 20+ minutes.
   */
  private async recoverProcessingWithoutActivePgBoss(): Promise<void> {
    const zombies = await this.withAdminJobRepo((r) =>
      r
        .createQueryBuilder("j")
        .select(["j.id", "j.pgBossJobId", "j.percentCompleted"])
        .where("j.type = :type", { type: JobType.extraction })
        .andWhere("j.status = :status", { status: JobStatus.processing })
        .andWhere(
          `(j.pg_boss_job_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM pgboss.job b
            WHERE b.id::text = j.pg_boss_job_id AND b.state = 'active'
          ))`,
        )
        .getMany(),
    );

    for (const row of zombies) {
      this.log.warn(
        `Recovering processing zombie ${row.id} (pct=${row.percentCompleted ?? 0}, no active pg-boss row)`,
      );
      await this.appendResultDiagnostic(row.id, "recovery", "Processing zombie re-queued (no active pg-boss)", {
        reason: "processing_without_active_pgboss",
        percentCompleted: row.percentCompleted ?? 0,
        priorPgBossJobId: row.pgBossJobId ?? null,
      });
      await this.cancelPgBossExtractionJob(row.pgBossJobId);
      await this.withAdminJobRepo((r) =>
        r.update(row.id, {
          status: JobStatus.queued,
          error: null,
          pgBossJobId: null,
          ...jobTimingResetFields(),
        }),
      );
      try {
        await this.forceReEnqueueExtraction(row.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await this.withAdminJobRepo((r) =>
          r.update(row.id, {
            status: JobStatus.failed,
            ...jobTerminalTimingFields(),
            error: `Zombie recovery failed: ${msg}`,
          }),
        );
        this.log.error(`Processing zombie recovery failed for job ${row.id}: ${msg}`);
      }
    }
  }

  private async recoverStaleProcessingJobs(): Promise<void> {
    const staleProcessing = await this.withAdminJobRepo((r) =>
      r
        .createQueryBuilder("j")
        .select(["j.id", "j.pgBossJobId"])
        .where("j.type = :type", { type: JobType.extraction })
        .andWhere("j.status = :status", { status: JobStatus.processing })
        .andWhere(`j.updated_at < NOW() - INTERVAL '${STALE_PROCESSING_MINUTES} minutes'`)
        .andWhere(
          `(j.pg_boss_job_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM pgboss.job b
            WHERE b.id::text = j.pg_boss_job_id
              AND b.state = 'active'
          ))`,
        )
        .getMany(),
    );

    for (const row of staleProcessing) {
      this.log.warn(`Recovering stale processing job ${row.id} → queued`);
      await this.appendResultDiagnostic(row.id, "recovery", "Stale processing zombie re-queued", {
        reason: "stale_processing",
        priorPgBossJobId: row.pgBossJobId ?? null,
      });
      await this.withAdminJobRepo((r) =>
        r.update(row.id, {
          status: JobStatus.queued,
          error: null,
          pgBossJobId: null,
          ...jobTimingResetFields(),
        }),
      );
      try {
        await this.forceReEnqueueExtraction(row.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await this.withAdminJobRepo((r) =>
          r.update(row.id, {
            status: JobStatus.failed,
            ...jobTerminalTimingFields(),
            error: `Recovery failed: ${msg}`,
          }),
        );
        this.log.error(`Stale processing recovery failed for job ${row.id}: ${msg}`);
      }
    }

    const hungProcessing = await this.withAdminJobRepo((r) =>
      r
        .createQueryBuilder("j")
        .select(["j.id", "j.pgBossJobId", "j.percentCompleted"])
        .where("j.type = :type", { type: JobType.extraction })
        .andWhere("j.status = :status", { status: JobStatus.processing })
        .andWhere(`j.updated_at < NOW() - INTERVAL '${STALE_HUNG_PROCESSING_MINUTES} minutes'`)
        .getMany(),
    );

    for (const row of hungProcessing) {
      this.log.warn(
        `Recovering hung processing job ${row.id} (pct=${row.percentCompleted ?? 0}, no heartbeat ${STALE_HUNG_PROCESSING_MINUTES}m)`,
      );
      await this.appendResultDiagnostic(row.id, "recovery", "Hung processing job re-queued", {
        reason: "hung_processing",
        percentCompleted: row.percentCompleted ?? 0,
        staleMinutes: STALE_HUNG_PROCESSING_MINUTES,
      });
      await this.cancelPgBossExtractionJob(row.pgBossJobId);
      await this.withAdminJobRepo((r) =>
        r.update(row.id, {
          status: JobStatus.queued,
          error: null,
          pgBossJobId: null,
          ...jobTimingResetFields(),
        }),
      );
      try {
        await this.forceReEnqueueExtraction(row.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await this.withAdminJobRepo((r) =>
          r.update(row.id, {
            status: JobStatus.failed,
            ...jobTerminalTimingFields(),
            error: `Hung recovery failed: ${msg}`,
          }),
        );
        this.log.error(`Hung processing recovery failed for job ${row.id}: ${msg}`);
      }
    }
  }

  /** Live pg-boss monitor for admin UI — reads `pgboss.job` joined with `jobs` where applicable. */
  async getPgBossDashboard(): Promise<QueueDashboardResponse> {
    const queueNames = [
      QUEUE,
      CUSTOMERS_DATA_QUEUE,
      LIBRARY_ZIP_EXPORT_QUEUE,
      CUSTOMER_DOCUMENTS_EXPORT_QUEUE,
    ];

    if (!this.boss) {
      return {
        workerRunning: false,
        queueNames,
        stateCounts: [],
        liveJobs: [],
        recentCompleted: [],
        mismatches: [],
        fetchedAt: new Date().toISOString(),
      };
    }

    return this.runAdminJobWrite(async (manager) => {
      const stateRows = (await manager.query(
        `SELECT name AS "queueName", state, COUNT(*)::int AS count
         FROM pgboss.job
         GROUP BY name, state
         ORDER BY name, state`,
      )) as PgBossQueueStateCount[];

      const mapJobRow = (row: Record<string, unknown>): PgBossQueueJobRow => ({
        pgBossId: String(row.pgBossId ?? ""),
        queueName: String(row.queueName ?? ""),
        state: String(row.state ?? ""),
        createdOn: row.createdOn instanceof Date ? row.createdOn.toISOString() : String(row.createdOn ?? ""),
        startedOn:
          row.startedOn == null
            ? null
            : row.startedOn instanceof Date
              ? row.startedOn.toISOString()
              : String(row.startedOn),
        completedOn:
          row.completedOn == null
            ? null
            : row.completedOn instanceof Date
              ? row.completedOn.toISOString()
              : String(row.completedOn),
        payload:
          row.payload && typeof row.payload === "object"
            ? (row.payload as Record<string, unknown>)
            : {},
        jobId: row.jobId != null ? String(row.jobId) : null,
        jobStatus: row.jobStatus != null ? String(row.jobStatus) : null,
        percentCompleted:
          row.percentCompleted == null ? null : Number.parseInt(String(row.percentCompleted), 10) || 0,
        documentName: row.documentName != null ? String(row.documentName) : null,
        customerName: row.customerName != null ? String(row.customerName) : null,
      });

      const jobSelectSql = `
        SELECT
          b.id::text AS "pgBossId",
          b.name AS "queueName",
          b.state,
          b.created_on AS "createdOn",
          b.started_on AS "startedOn",
          b.completed_on AS "completedOn",
          b.data AS payload,
          j.id AS "jobId",
          j.status AS "jobStatus",
          j.percent_completed AS "percentCompleted",
          COALESCE(d.original_name, f.name) AS "documentName",
          c.name AS "customerName"
        FROM pgboss.job b
        LEFT JOIN jobs j ON j.pg_boss_job_id = b.id::text
        LEFT JOIN documents d ON d.id = j.document_id
        LEFT JOIN files f ON f.id = j.file_id
        LEFT JOIN customers c ON c.id = j.customer_id
      `;

      const liveJobs = (
        (await manager.query(
          `${jobSelectSql}
         WHERE b.state IN ('created', 'active', 'retry')
         ORDER BY
           CASE b.state WHEN 'active' THEN 0 WHEN 'retry' THEN 1 ELSE 2 END,
           b.created_on ASC
         LIMIT 100`,
        )) as Record<string, unknown>[]
      ).map(mapJobRow);

      const recentCompleted = (
        (await manager.query(
          `${jobSelectSql}
         WHERE b.state IN ('completed', 'cancelled', 'failed')
           AND b.completed_on > NOW() - INTERVAL '1 hour'
         ORDER BY b.completed_on DESC
         LIMIT 30`,
        )) as Record<string, unknown>[]
      ).map(mapJobRow);

      const mismatches = (await manager.query(
        `SELECT j.id AS "jobId", j.status AS "jobStatus", j.percent_completed AS "percentCompleted",
                j.pg_boss_job_id AS "pgBossJobId", issues.issue
         FROM jobs j
         INNER JOIN LATERAL (
           SELECT CASE
             WHEN j.status = 'queued' AND (
               j.pg_boss_job_id IS NULL OR NOT EXISTS (
                 SELECT 1 FROM pgboss.job b
                 WHERE b.id::text = j.pg_boss_job_id
                   AND b.state IN ('created', 'active', 'retry')
               )
             ) THEN 'queued_without_live_pgboss'
             WHEN j.status IN ('completed', 'failed', 'cancelled') AND EXISTS (
               SELECT 1 FROM pgboss.job b
               WHERE b.id::text = j.pg_boss_job_id
                 AND b.state IN ('created', 'active', 'retry')
             ) THEN 'terminal_status_with_active_pgboss'
             WHEN j.status = 'processing' AND (
               j.pg_boss_job_id IS NULL OR NOT EXISTS (
                 SELECT 1 FROM pgboss.job b
                 WHERE b.id::text = j.pg_boss_job_id AND b.state = 'active'
               )
             ) THEN 'processing_without_active_pgboss'
             ELSE NULL
           END AS issue
         ) issues ON TRUE
         WHERE j.type = 'extraction' AND issues.issue IS NOT NULL
         ORDER BY j.updated_at DESC
         LIMIT 25`,
      )) as PgBossJobMismatch[];

      return {
        workerRunning: true,
        queueNames,
        stateCounts: stateRows,
        liveJobs,
        recentCompleted,
        mismatches,
        fetchedAt: new Date().toISOString(),
      };
    });
  }
}

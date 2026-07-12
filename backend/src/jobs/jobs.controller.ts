import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { InjectRepository } from "@nestjs/typeorm";
import { Crud, CrudRequest, Override, ParsedRequest } from "@nestjsx/crud";
import type { Request } from "express";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { parseAiProviderId, formatEffectiveAiModelsLog, resolveEffectiveModels } from "../ai/providers/factory.js";
import type { AuthUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionResource } from "../auth/permission-resource.decorator";
import { PermissionsGuard } from "../auth/permissions.guard";
import { Job, JobStatus } from "../entities/job.entity";
import type { FinancialJobResult } from "../extraction/financial-types.js";
import { AiExecutionsService } from "../extraction/ai-executions.service.js";
import { ExtractionPersistenceService } from "../extraction/extraction-persistence.service.js";
import { QueueService } from "../queue/queue.service";
import { JobExtractionRequeueService } from "./job-extraction-requeue.service";
import { JobsService } from "./jobs.service";

function decodeJwtPayloadUnsafe(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

@ApiBearerAuth("bearer")
@Crud({
  model: { type: Job },
  params: {
    id: {
      field: "id",
      type: "uuid",
      primary: true,
    },
  },
  query: {
    limit: 200,
    maxLimit: 500,
  },
  routes: {
    only: ["getManyBase", "getOneBase"],
  },
})
@Controller("jobs")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@PermissionResource("job")
export class JobsController {
  private static readonly log = new Logger(JobsController.name);

  constructor(
    public service: JobsService,
    private readonly queue: QueueService,
    private readonly config: ConfigService,
    @InjectRepository(Job) private readonly jobRepo: Repository<Job>,
    private readonly extractionPersistence: ExtractionPersistenceService,
    private readonly aiExecutions: AiExecutionsService,
    private readonly extractionRequeue: JobExtractionRequeueService,
  ) {}

  private extractActor(httpReq: Request): AuthUser | undefined {
    const direct = (httpReq as Request & { user?: AuthUser }).user;
    if (direct?.userId) return direct;
    const auth = httpReq.headers?.authorization;
    if (!auth || !auth.toLowerCase().startsWith("bearer ")) return undefined;
    const payload = decodeJwtPayloadUnsafe(auth.slice(7).trim());
    if (!payload) return undefined;
    const userIdRaw =
      payload.userId ??
      payload.uid ??
      (typeof payload.sub === "string" && payload.sub !== "docp" ? payload.sub : undefined);
    if (typeof userIdRaw !== "string" || !userIdRaw.trim()) return undefined;
    const customerIdRaw = payload.customerId ?? payload.cid;
    const customerId =
      typeof customerIdRaw === "string" && customerIdRaw.trim() ? customerIdRaw.trim() : null;
    const isAdmin = payload.isAdmin === true || payload.adm === true;
    return { userId: userIdRaw.trim(), customerId, isAdmin };
  }

  /**
   * Pass raw query so `filter` survives nestjsx parsing when `s` (search) is present.
   * Merge `libraryKind` from the URL string when missing on `req.query` (some proxies / parsers drop
   * unknown keys; the jobs list relies on this param for type filtering).
   *
   * nestjsx sets `prototype.getManyBase = (req) => this.service.getMany(req)`, which overwrites any
   * class method named `getManyBase`. The override must be on a differently named handler (`getMany`)
   * with `@Override("getManyBase")` so GET /jobs binds here (see CustomersController).
   */
  @Override("getManyBase")
  getMany(@ParsedRequest() req: CrudRequest, @Req() httpReq: Request) {
    const actor = this.extractActor(httpReq);
    return this.service.getMany(req, JobsController.mergeJobsListQuery(httpReq), actor);
  }

  /** Jobs for a file (newest first). Used by drive UI to open extraction details. */
  @Get("by-file/:fileId")
  async jobsByFile(@Param("fileId") fileId: string) {
    return this.jobRepo
      .createQueryBuilder("job")
      .leftJoinAndSelect("job.customer", "customer")
      .leftJoinAndSelect("job.file", "file")
      .leftJoinAndSelect("job.document", "document")
      .where("job.file_id = :fileId", { fileId })
      .orWhere(`job.document_id IN (SELECT id FROM documents WHERE metadata->>'fileId' = :fileId)`, { fileId })
      .orderBy("job.created_at", "DESC")
      .take(50)
      .getMany();
  }

  private static mergeJobsListQuery(httpReq: Request): Request["query"] {
    const base = httpReq.query as Record<string, string | string[]>;
    const merged: Record<string, string | string[]> = { ...base };
    const rawPath = typeof httpReq.originalUrl === "string" ? httpReq.originalUrl : (httpReq.url ?? "");
    const qm = rawPath.indexOf("?");
    let urlLibraryKind: string | undefined;
    if (qm >= 0) {
      const sp = new URLSearchParams(rawPath.slice(qm + 1));
      const lk = sp.get("libraryKind");
      if (lk !== null && lk.trim() !== "") {
        urlLibraryKind = lk.trim();
        merged.libraryKind = urlLibraryKind;
      }
    }
    return merged as Request["query"];
  }

  @Override("getOneBase")
  async getOne(@ParsedRequest() req: CrudRequest, @Req() httpReq: Request) {
    const actor = this.extractActor(httpReq);
    return this.service.getOneForActor(req, actor);
  }

  @Get(":id/cost")
  async jobCost(@Param("id") id: string) {
    const job = await this.jobRepo.findOne({ where: { id } });
    if (!job) {
      throw new NotFoundException("job not found");
    }
    return this.aiExecutions.getJobCostSummary(job.id, job.customerId);
  }

  @Post(":id/cancel")
  async cancel(@Param("id") id: string) {
    await this.queue.cancelJob(id);
    const job = await this.queue.runAdminJobRepo((repo) =>
      repo.findOne({
        where: { id },
        relations: { customer: true, file: true },
      }),
    );
    if (!job) {
      throw new NotFoundException("job not found (it may have been deleted with its file or document)");
    }
    return job;
  }

  @Post(":id/requeue")
  async requeue(@Param("id") id: string) {
    const job = await this.extractionRequeue.requeue(id);
    const models = resolveEffectiveModels(this.config, job);
    JobsController.log.log(`[Job ${id}] requeued with AI models: ${formatEffectiveAiModelsLog(models)}`);
    return job;
  }

  @Patch(":id")
  async patchConfig(
    @Param("id") id: string,
    @Body()
    body: {
      visionPrompt?: string | null;
      structurePrompt?: string | null;
      visionModel?: string | null;
      structureModel?: string | null;
      aiProvider?: string | null;
    }
  ) {
    const job = await this.jobRepo.findOne({ where: { id } });
    if (!job) {
      throw new NotFoundException("job not found");
    }
    if (
      job.status !== JobStatus.failed &&
      job.status !== JobStatus.queued &&
      job.status !== JobStatus.cancelled
    ) {
      throw new BadRequestException("Config can only be edited when job is failed, queued, or cancelled");
    }
    const upd: Partial<
      Pick<
        Job,
        "visionPrompt" | "structurePrompt" | "visionModel" | "structureModel" | "aiProvider"
      >
    > = {};
    if ("visionPrompt" in body) upd.visionPrompt = body.visionPrompt?.trim() || null;
    if ("structurePrompt" in body) upd.structurePrompt = body.structurePrompt?.trim() || null;
    if ("visionModel" in body) upd.visionModel = body.visionModel?.trim() || null;
    if ("structureModel" in body) upd.structureModel = body.structureModel?.trim() || null;
    if ("aiProvider" in body) {
      const raw = body.aiProvider?.trim();
      upd.aiProvider = raw ? parseAiProviderId(raw) : null;
    }
    await this.jobRepo.update(id, upd);
    return this.jobRepo.findOne({
      where: { id },
      relations: { customer: true, file: true },
    });
  }

  /**
   * Human-in-the-loop: replace `segments` / `financialDocuments` on a completed financial
   * pipeline result (`pipelineVersion === 1`). Tenant scope is `Job.customerId` (company).
   */
  @Patch(":id/extraction-result")
  async patchExtractionResult(
    @Param("id") id: string,
    @Body()
    body: {
      segments?: unknown[];
      financialDocuments?: unknown[];
      manualOverride?: { note?: string };
    }
  ) {
    const job = await this.jobRepo.findOne({ where: { id } });
    if (!job) {
      throw new NotFoundException("job not found");
    }
    if (job.status !== JobStatus.completed) {
      throw new BadRequestException("Only completed jobs can be updated");
    }
    const cur = job.result as Record<string, unknown> | null;
    if (!cur || cur.pipelineVersion !== 1) {
      throw new BadRequestException("Job does not have a financial pipeline result");
    }
    const next: Record<string, unknown> = { ...cur };
    if (body.segments !== undefined) next.segments = body.segments;
    if (body.financialDocuments !== undefined) next.financialDocuments = body.financialDocuments;
    next.manualOverride = {
      appliedAt: new Date().toISOString(),
      ...(typeof body.manualOverride === "object" && body.manualOverride !== null
        ? body.manualOverride
        : {}),
    };
    job.result = next as Job["result"];
    await this.jobRepo.save(job);
    try {
      await this.extractionPersistence.replaceForJob(id, job.customerId, {
        documentId: job.documentId ?? null,
        fileId: job.fileId ?? null,
      }, next as unknown as FinancialJobResult);
    } catch {
      /* ignore DB sync errors; JSON result is source for HITL */
    }
    return this.jobRepo.findOne({
      where: { id },
      relations: { customer: true, file: true, document: true },
      relationLoadStrategy: "query",
    });
  }
}

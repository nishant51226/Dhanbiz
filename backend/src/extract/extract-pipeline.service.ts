import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AiProviderId } from "../ai/types.js";
import {
  createDepsForProvider,
  defaultStructureModel,
  defaultVisionModel,
  formatEffectiveAiModelsLog,
  resolveEffectiveModels,
  resolveEffectiveProvider,
} from "../ai/providers/factory.js";
import { AiExecutionsService } from "../extraction/ai-executions.service.js";
import { runFinancialPipeline, type PipelineCheckpointFn } from "../extraction/financial-pipeline.js";
import type { FinancialJobResult, JobDiagnosticEntry } from "../extraction/financial-types.js";
import {
  defaultStructurePrompt,
  defaultVisionPrompt,
  ExtractProgressFn,
  ExtractResult,
  runImagePipeline,
  runPdfPipeline,
} from "../extractPipeline";

export type ExtractRunOptions = {
  aiProvider?: AiProviderId | null;
  visionModel?: string | null;
  structureModel?: string | null;
};

@Injectable()
export class ExtractPipelineService {
  private readonly log = new Logger(ExtractPipelineService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly aiExecutions: AiExecutionsService
  ) {}

  defaultVisionPrompt(): string {
    return defaultVisionPrompt();
  }

  defaultStructurePrompt(): string {
    return defaultStructurePrompt();
  }

  async run(
    buffer: Buffer,
    mimeType: string,
    visionPrompt: string,
    structurePrompt: string,
    onProgress?: ExtractProgressFn,
    options?: ExtractRunOptions
  ): Promise<ExtractResult> {
    const provider = resolveEffectiveProvider(options?.aiProvider ?? null, this.config);
    const deps = createDepsForProvider(this.config, provider);
    const vm =
      (options?.visionModel?.trim() && options.visionModel.trim()) ||
      defaultVisionModel(this.config, provider);
    const sm =
      (options?.structureModel?.trim() && options.structureModel.trim()) ||
      defaultStructureModel(this.config, provider);
    if (mimeType === "application/pdf") {
      return runPdfPipeline(deps, vm, sm, buffer, visionPrompt, structurePrompt, onProgress);
    }
    const imageMime = mimeType.startsWith("image/") ? mimeType : "image/png";
    return runImagePipeline(deps, vm, sm, buffer, imageMime, visionPrompt, structurePrompt, onProgress);
  }

  /**
   * Multi-page financial pipeline (stages 1–7). `structurePrompt` is reserved for future
   * customization; per-page extraction uses built-in invoice/statement prompts.
   */
  async runFinancialExtraction(
    buffer: Buffer | null,
    mimeType: string,
    ctx: { jobId: string; fileId: string; customerId: string },
    visionPrompt: string,
    _structurePrompt: string,
    onProgress?: ExtractProgressFn,
    options?: ExtractRunOptions & {
      resume?: FinancialJobResult | null;
      onCheckpoint?: PipelineCheckpointFn;
      diagnosticLog: JobDiagnosticEntry[];
      pushJobDiagnostic: (phase: string, message: string, meta?: Record<string, unknown>) => void;
    }
  ): Promise<FinancialJobResult> {
    const models = resolveEffectiveModels(this.config, options);
    const deps = createDepsForProvider(this.config, models.provider);
    this.log.log(`[job ${ctx.jobId}] financial extraction ${formatEffectiveAiModelsLog(models)}`);
    void _structurePrompt;
    const recordExecution = async (args: Parameters<AiExecutionsService["record"]>[0]) => {
      await this.aiExecutions.record(args);
    };
    if (!options?.diagnosticLog || !options?.pushJobDiagnostic) {
      throw new Error("runFinancialExtraction requires diagnosticLog and pushJobDiagnostic");
    }
    return runFinancialPipeline({
      buffer,
      mimeType,
      jobId: ctx.jobId,
      fileId: ctx.fileId,
      customerId: ctx.customerId,
      aiProvider: models.provider,
      deps,
      visionModel: models.visionModel,
      structureModel: models.structureModel,
      visionPrompt,
      onProgress,
      resume: options?.resume ?? null,
      onCheckpoint: options?.onCheckpoint,
      recordExecution,
      diagnosticLog: options.diagnosticLog,
      pushJobDiagnostic: options.pushJobDiagnostic,
    });
  }
}

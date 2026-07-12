import type { AiProviderId, ExtractPipelineDeps } from "../ai/types.js";
import { OLLAMA_DEFAULT_FETCH_TIMEOUT_MS, parseJsonFromModelOutput } from "../ollama.js";
import type { TenantId } from "../tenant/tenant-scope.js";
import type {
  FinancialJobResult,
  JobDiagnosticEntry,
  PageTrace,
  PipelineCheckpoint,
  Segment,
  SegmentClassification,
  SegmentKind,
  SegmentStatus,
} from "./financial-types.js";
import { mergeBuildAndValidate } from "./merge-build-validate.js";
import { enrichInvoiceLineItemsDescriptions } from "./invoice-line-items-description.js";
import {
  DEFAULT_CLASSIFICATION_PROMPT,
  defaultPerPageInvoicePrompt,
  defaultPerPageStatementPrompt,
} from "./prompts.js";
import {
  extractTextFromImage,
  getPdfTextLayerSlice,
  pdfMinTextChars,
  type RecordAiExecutionFn,
  visionOcrPdfPage,
} from "./text-extraction.js";
import { runWithConcurrencyLimit } from "./concurrency.js";
import {
  summarizeExtractedPayload,
  summarizeFinancialDocument,
  summarizeTextSegmentsForLog,
  extractionDebugPageChars,
} from "./job-diagnostics.js";
import {
  formatStructureContextLengthError,
  isStructureContextLengthError,
  truncateForStructureModel,
} from "./structure-input-budget.js";

export type ExtractProgressFn = (percent: number) => void | Promise<void>;

/** Persist partial pipeline state (job.result + optional DB) between stages. */
export type PipelineCheckpointFn = (partial: FinancialJobResult) => void | Promise<void>;

const STRUCTURE_SYSTEM_PROMPT =
  "You are a strict JSON extractor. Reply with a single JSON value only—no preamble, no markdown, no explanation.";

function structureTimeoutMs(): number {
  return (
    Number(process.env.OLLAMA_STRUCTURE_FETCH_TIMEOUT_MS) ||
    Number(process.env.OLLAMA_FETCH_TIMEOUT_MS) ||
    OLLAMA_DEFAULT_FETCH_TIMEOUT_MS
  );
}

function extractionConcurrencyEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : fallback;
}

function defaultPdfVisionConcurrency(provider: AiProviderId): number {
  // Bedrock qwen3-vl is slow on multi-MB page images; parallel calls cause stream timeouts.
  if (provider === "bedrock") return 2;
  return 5;
}

function logPageChars(
  segments: Segment[],
  pushJobDiagnostic: (phase: string, message: string, meta?: Record<string, unknown>) => void
): void {
  pushJobDiagnostic("text_extracted", "Per-page plain text ready (summary)", {
    ...summarizeTextSegmentsForLog(segments),
  });
  if (!extractionDebugPageChars()) return;
  for (const seg of segments) {
    pushJobDiagnostic("page_chars", `Page ${seg.pageNumber}: ${seg.text.length} chars`, {
      pageNumber: seg.pageNumber,
      textChars: seg.text.length,
      textSource: seg.textSource,
    });
  }
}

async function structureChatJson(
  deps: ExtractPipelineDeps,
  structureModel: string,
  userContent: string,
  recordCtx?: {
    recordExecution: RecordAiExecutionFn;
    jobId: string;
    customerId: TenantId;
    pipelineSegmentId: string;
    provider: AiProviderId;
    method: "classification" | "formatting";
    pageNumber: number;
  },
  pushJobDiagnostic?: (phase: string, message: string, meta?: Record<string, unknown>) => void
): Promise<{ raw: string; parsed: unknown | null; parseError: string | null }> {
  const pageNumber = recordCtx?.pageNumber ?? null;
  const method = recordCtx?.method ?? "structure";
  const promptChars = userContent.length + STRUCTURE_SYSTEM_PROMPT.length;
  pushJobDiagnostic?.("structure_api", `Page ${pageNumber ?? "?"} ${method}: sending ${promptChars} chars`, {
    pageNumber,
    method,
    promptChars,
    userChars: userContent.length,
    systemChars: STRUCTURE_SYSTEM_PROMPT.length,
    model: structureModel,
  });
  let chatRes;
  try {
    chatRes = await deps.structureChat(
      structureModel,
      [
        {
          role: "system",
          content: STRUCTURE_SYSTEM_PROMPT,
        },
        { role: "user", content: userContent },
      ],
      structureTimeoutMs()
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    pushJobDiagnostic?.("structure_api_error", `Page ${pageNumber ?? "?"} ${method}: API failed`, {
      pageNumber,
      method,
      promptChars,
      userChars: userContent.length,
      model: structureModel,
      error: msg.slice(0, 800),
    });
    if (isStructureContextLengthError(msg)) {
      throw new Error(formatStructureContextLengthError(msg));
    }
    throw e;
  }
  const raw = chatRes.text;
  if (recordCtx) {
    await recordCtx.recordExecution({
      jobId: recordCtx.jobId,
      customerId: recordCtx.customerId,
      pipelineSegmentId: recordCtx.pipelineSegmentId,
      method: recordCtx.method,
      provider: recordCtx.provider,
      model: structureModel,
      usage: chatRes.usage,
    });
  }
  const parsed = parseJsonFromModelOutput(raw);
  pushJobDiagnostic?.(
    "structure_api",
    `Page ${pageNumber ?? "?"} ${method}: response ${raw.length} chars`,
    {
      pageNumber,
      method,
      responseChars: raw.length,
      inputTokens: chatRes.usage?.inputTokens ?? null,
      outputTokens: chatRes.usage?.outputTokens ?? null,
      totalTokens: chatRes.usage?.totalTokens ?? null,
      model: structureModel,
      parseOk: parsed.ok,
    }
  );
  return {
    raw,
    parsed: parsed.ok ? parsed.value : null,
    parseError: parsed.ok ? null : parsed.error,
  };
}

function parseClassification(v: unknown): SegmentClassification {
  if (!v || typeof v !== "object") return { segmentKind: "other", boundary: "new" };
  const o = v as Record<string, unknown>;
  const sk = o.segmentKind;
  const b = o.boundary;
  const kind: SegmentKind =
    sk === "invoice" || sk === "statement" || sk === "other" ? sk : "other";
  const boundary = b === "continuation" ? "continuation" : "new";
  return { segmentKind: kind, boundary };
}

function legacyStructured(first: ReturnType<typeof mergeBuildAndValidate>[number]): unknown {
  if (first.type === "invoice" && first.invoice) {
    return {
      documentType: "invoice",
      vendor: first.invoice.vendor,
      customer: first.invoice.customer,
      storeName: first.invoice.storeName,
      customerAddress: first.invoice.customerAddress,
      invoiceNumber: first.invoice.invoiceNumber,
      invoiceDate: first.invoice.invoiceDate,
      dueDate: first.invoice.dueDate,
      currency: first.invoice.currency,
      lineItems: first.invoice.lineItems,
      lineItemsDescription: first.invoice.lineItemsDescription,
      subtotal: first.invoice.subtotal,
      tax: first.invoice.tax,
      total: first.invoice.total,
      notes: first.invoice.notes,
    };
  }
  if (first.type === "statement" && first.statement) {
    return {
      documentType: "bank_statement",
      accountHolder: first.statement.accountHolder,
      bankName: first.statement.bankName,
      accountNumber: first.statement.accountNumber,
      statementPeriodStart: first.statement.statementPeriodStart,
      statementPeriodEnd: first.statement.statementPeriodEnd,
      currency: first.statement.currency,
      openingBalance: first.statement.openingBalance,
      closingBalance: first.statement.closingBalance,
      transactions: first.statement.transactions,
      notes: first.statement.notes,
    };
  }
  return null;
}

function buildPartial(
  base: Omit<
    FinancialJobResult,
    | "pipelineCheckpoint"
    | "llmNextSegmentIndex"
    | "textNextPageIndex"
    | "automatedSnapshot"
    | "structured"
    | "structuredRaw"
    | "structuredParseError"
    | "combinedText"
    | "pipelineVersion"
  > & {
    pipelineCheckpoint: PipelineCheckpoint;
    llmNextSegmentIndex?: number;
    textNextPageIndex?: number;
    combinedText?: string;
    structured?: unknown | null;
    structuredRaw?: string;
    structuredParseError?: string | null;
    automatedSnapshot?: FinancialJobResult["automatedSnapshot"];
  },
  diagnosticLog: JobDiagnosticEntry[]
): FinancialJobResult {
  return {
    customerId: base.customerId,
    pipelineVersion: 1,
    pipelineCheckpoint: base.pipelineCheckpoint,
    llmNextSegmentIndex: base.llmNextSegmentIndex,
    textNextPageIndex: base.textNextPageIndex,
    segments: base.segments,
    financialDocuments: base.financialDocuments,
    automatedSnapshot: base.automatedSnapshot ?? null,
    manualOverride: base.manualOverride ?? null,
    combinedText: base.combinedText ?? "",
    pages: base.pages,
    structured: base.structured ?? null,
    structuredRaw: base.structuredRaw ?? "",
    structuredParseError: base.structuredParseError ?? null,
    warnings: base.warnings,
    diagnosticLog: [...diagnosticLog],
  };
}

export type RunFinancialPipelineParams = {
  buffer: Buffer | null;
  mimeType: string;
  jobId: string;
  fileId: string;
  customerId: TenantId;
  aiProvider: AiProviderId;
  deps: ExtractPipelineDeps;
  visionModel: string;
  structureModel: string;
  visionPrompt: string;
  onProgress?: ExtractProgressFn;
  /** Resume from a failed/partial job.result (same job requeued). */
  resume?: FinancialJobResult | null;
  /** Called after text extraction, after each LLM segment, after structured (pre-merge), and with final result. */
  onCheckpoint?: PipelineCheckpointFn;
  recordExecution?: RecordAiExecutionFn;
  /** Mutated; each checkpoint snapshots a copy onto `Job.result`. */
  diagnosticLog: JobDiagnosticEntry[];
  pushJobDiagnostic: (phase: string, message: string, meta?: Record<string, unknown>) => void;
};

export async function runFinancialPipeline(params: RunFinancialPipelineParams): Promise<FinancialJobResult> {
  const {
    buffer,
    mimeType,
    jobId,
    fileId,
    customerId,
    aiProvider,
    deps,
    visionModel,
    structureModel,
    visionPrompt,
    onProgress,
    resume,
    onCheckpoint,
    recordExecution,
    diagnosticLog,
    pushJobDiagnostic,
  } = params;

  pushJobDiagnostic("pipeline", "Financial extraction run started", {
    jobId,
    fileId,
    customerId,
    mimeType,
    provider: aiProvider,
    visionModel,
    structureModel,
    bufferBytes: buffer?.length ?? 0,
    resumeCheckpoint: resume?.pipelineCheckpoint ?? null,
    resumeTextPageIndex: resume?.textNextPageIndex ?? null,
    resumeLlmSegmentIndex: resume?.llmNextSegmentIndex ?? null,
    segmentCountAfterResume: resume?.segments?.length ?? 0,
    financialDocumentCountAfterResume: resume?.financialDocuments?.length ?? 0,
  });

  const warnings: string[] = [...(resume?.warnings ?? [])];
  let pages: PageTrace[] = [...(resume?.pages ?? [])];
  let segments: Segment[] = [];

  const tick = async (pct: number) => {
    await onProgress?.(Math.min(100, Math.max(0, Math.round(pct))));
  };

  const cp = resume?.pipelineCheckpoint;
  const skipTextStage =
    cp === "text_extracted" ||
    cp === "llm_in_progress" ||
    cp === "structured" ||
    cp === "merged";

  if (skipTextStage) {
    if (!resume?.segments?.length) {
      throw new Error("Resume checkpoint requires saved segments");
    }
    segments = JSON.parse(JSON.stringify(resume.segments)) as Segment[];
    pushJobDiagnostic("resume", "Skipped text stage; using saved segments", {
      checkpoint: cp,
      pages: segments.length,
    });
  } else {
    if (!buffer?.length) {
      throw new Error("buffer required for new extraction");
    }
    await tick(1);

    if (mimeType === "application/pdf") {
      const resumeCp = resume?.pipelineCheckpoint;
      const resumingOcr =
        resumeCp === "text_layer_done" || resumeCp === "text_in_progress";

      const runPdfOcrFromIndex = async (startIdx: number) => {
        const minChars = pdfMinTextChars();
        const n = segments.length;
        const visionConcurrency = extractionConcurrencyEnv(
          "EXTRACTION_PDF_VISION_CONCURRENCY",
          defaultPdfVisionConcurrency(aiProvider),
        );

        const ocrComplete = (i: number) => (segments[i]!.text ?? "").length >= minChars;

        const countOcrComplete = (): number => {
          let c = 0;
          for (let j = 0; j < n; j++) {
            if (ocrComplete(j)) c++;
          }
          return c;
        };

        const firstOcrIncomplete = (from: number): number | null => {
          for (let i = from; i < n; i++) {
            if (!ocrComplete(i)) return i;
          }
          return null;
        };

        const ocrTick = async () => {
          await tick(2 + Math.floor((20 * countOcrComplete()) / Math.max(n, 1)));
        };

        for (let i = startIdx; i < n; i++) {
          const seg = segments[i]!;
          const pageNumber = seg.pageNumber;
          if (ocrComplete(i)) {
            pages[i] = { page: pageNumber, source: "text", preview: (seg.text ?? "").slice(0, 200) };
            seg.textSource = "text";
          }
        }

        await ocrTick();

        const visionPending: number[] = [];
        for (let i = startIdx; i < n; i++) {
          if (!ocrComplete(i)) visionPending.push(i);
        }
        pushJobDiagnostic("pdf_vision", "Vision OCR queue prepared", {
          totalPages: n,
          startIndex: startIdx,
          pagesUsingTextLayer: n - visionPending.length,
          pagesNeedingVision: visionPending.length,
          visionConcurrency,
          minCharsBeforeVision: minChars,
        });

        const fiAfterSync = firstOcrIncomplete(startIdx);
        if (fiAfterSync !== null) {
          await onCheckpoint?.(
            buildPartial(
              {
                customerId,
                segments,
                financialDocuments: [],
                pages,
                warnings,
                manualOverride: resume?.manualOverride ?? null,
                pipelineCheckpoint: "text_in_progress",
                textNextPageIndex: fiAfterSync,
                combinedText: "",
              },
              diagnosticLog
            )
          );
        }

        await runWithConcurrencyLimit(visionPending, visionConcurrency, async (i) => {
          const seg = segments[i]!;
          const pageNumber = seg.pageNumber;
          pushJobDiagnostic("pdf_vision", `Vision OCR batch: page ${pageNumber}`, {
            segmentIndex: i,
            pageNumber,
            ocrCompleteBefore: countOcrComplete(),
            ocrTotal: n,
          });
          const o = await visionOcrPdfPage(
            deps,
            buffer,
            pageNumber,
            visionModel,
            visionPrompt,
            warnings,
            {
              ...(recordExecution ? { recordExecution } : {}),
              jobId,
              customerId,
              pipelineSegmentId: seg.id,
              provider: aiProvider,
              visionModel,
              pushJobDiagnostic,
            }
          );
          seg.text = o.text;
          seg.textSource = o.textSource;
          pages[i] = o.trace;

          await ocrTick();

          const fi = firstOcrIncomplete(startIdx);
          if (fi !== null) {
            await onCheckpoint?.(
              buildPartial(
                {
                  customerId,
                  segments,
                  financialDocuments: [],
                  pages,
                  warnings,
                  manualOverride: resume?.manualOverride ?? null,
                  pipelineCheckpoint: "text_in_progress",
                  textNextPageIndex: fi,
                  combinedText: "",
                },
                diagnosticLog
              )
            );
          }
        });

        for (const s of segments) {
          s.status = "text_ok";
        }
        await tick(24);
        logPageChars(segments, pushJobDiagnostic);
        await onCheckpoint?.(
          buildPartial(
            {
              customerId,
              segments,
              financialDocuments: [],
              pages,
              warnings,
              manualOverride: resume?.manualOverride ?? null,
              pipelineCheckpoint: "text_extracted",
              combinedText: "",
            },
            diagnosticLog
          )
        );
      };

      if (resumingOcr) {
        if (!resume?.segments?.length) {
          throw new Error("Resume checkpoint requires saved segments");
        }
        pushJobDiagnostic("resume", "Resuming PDF text/vision stage from checkpoint", {
          resumeCheckpoint: resumeCp,
          segmentCount: resume.segments.length,
          textNextPageIndex: resume.textNextPageIndex ?? 0,
        });
        segments = JSON.parse(JSON.stringify(resume.segments)) as Segment[];
        pages = [...(resume.pages ?? [])];
        const startIdx =
          resumeCp === "text_layer_done" ? 0 : (resume.textNextPageIndex ?? 0);
        await runPdfOcrFromIndex(startIdx);
      } else {
        const { slice } = await getPdfTextLayerSlice(buffer, warnings);
        pushJobDiagnostic("text_layer", "PDF embedded text layer read (per page)", {
          pageCount: slice.length,
          minCharsBeforeVision: pdfMinTextChars(),
          charCountPerPageSample: slice.slice(0, 8).map((t) => t.length),
        });
        if (slice.length === 0) {
          warnings.push("PDF produced no pages.");
        }
        segments = slice.map((t, i) => ({
          id: `${jobId}-p${i + 1}`,
          jobId,
          fileId,
          customerId,
          pageNumber: i + 1,
          text: t,
          textSource: "text" as const,
          type: null,
          classification: null,
          classificationRaw: null,
          extractedData: null,
          extractedRaw: null,
          extractedParseError: null,
          status: "split" as SegmentStatus,
          financialDocumentId: null,
        }));
        pages = slice.map((t, i) => ({
          page: i + 1,
          source: "text" as const,
          preview: t.slice(0, 200),
        }));

        await onCheckpoint?.(
          buildPartial(
            {
              customerId,
              segments,
              financialDocuments: [],
              pages,
              warnings,
              manualOverride: resume?.manualOverride ?? null,
              pipelineCheckpoint: "text_layer_done",
              combinedText: "",
            },
            diagnosticLog
          )
        );

        await runPdfOcrFromIndex(0);
      }
    } else {
      const imageMime = mimeType.startsWith("image/") ? mimeType : "image/png";
      segments = [
        {
          id: `${jobId}-p1`,
          jobId,
          fileId,
          customerId,
          pageNumber: 1,
          text: "",
          textSource: "text",
          type: null,
          classification: null,
          classificationRaw: null,
          extractedData: null,
          extractedRaw: null,
          extractedParseError: null,
          status: "split",
          financialDocumentId: null,
        },
      ];
      pages = [{ page: 1, source: "text", preview: "" }];

      await onCheckpoint?.(
        buildPartial(
          {
            customerId,
            segments,
            financialDocuments: [],
            pages,
            warnings,
            manualOverride: resume?.manualOverride ?? null,
            pipelineCheckpoint: "text_layer_done",
            combinedText: "",
          },
          diagnosticLog
        )
      );

      const seg0 = segments[0]!;
      pushJobDiagnostic("image_input", "Raster image — vision OCR for full page", {
        imageMime,
        bufferBytes: buffer.length,
      });
      const pt = await extractTextFromImage(
        deps,
        buffer,
        imageMime,
        visionModel,
        visionPrompt,
        {
          ...(recordExecution ? { recordExecution } : {}),
          jobId,
          customerId,
          pipelineSegmentId: seg0.id,
          provider: aiProvider,
          visionModel,
          pushJobDiagnostic,
        }
      );
      seg0.text = pt.text;
      seg0.textSource = pt.textSource;
      pages = [pt.trace];

      for (const s of segments) {
        s.status = "text_ok";
      }

      await tick(24);

      logPageChars(segments, pushJobDiagnostic);
      await onCheckpoint?.(
        buildPartial(
          {
            customerId,
            segments,
            financialDocuments: [],
            pages,
            warnings,
            manualOverride: resume?.manualOverride ?? null,
            pipelineCheckpoint: "text_extracted",
            combinedText: "",
          },
          diagnosticLog
        )
      );
    }
  }

  const n = Math.max(segments.length, 1);
  let startIdx = 0;
  if (cp === "llm_in_progress" && resume?.llmNextSegmentIndex != null) {
    startIdx = Math.min(resume.llmNextSegmentIndex, segments.length);
  }

  const skipLlm = cp === "structured" || cp === "merged";

  if (!skipLlm) {
    pushJobDiagnostic("llm_phase", "Starting per-page classification and JSON extraction", {
      segmentCount: segments.length,
      provider: aiProvider,
      structureModel,
      concurrency: extractionConcurrencyEnv("EXTRACTION_LLM_CONCURRENCY", 5),
      startIndex: startIdx,
    });
    const llmConcurrency = extractionConcurrencyEnv("EXTRACTION_LLM_CONCURRENCY", 5);

    const segmentLlmComplete = (seg: Segment) => seg.status === "structured";

    const firstLlmIncomplete = (from: number): number | null => {
      for (let i = from; i < segments.length; i++) {
        if (!segmentLlmComplete(segments[i]!)) return i;
      }
      return null;
    };

    const completedStructuredCount = (): number => {
      let c = 0;
      for (const seg of segments) {
        if (segmentLlmComplete(seg)) c++;
      }
      return c;
    };

    const llmTick = async () => {
      await tick(25 + Math.floor((55 * completedStructuredCount()) / Math.max(n, 1)));
    };

    const pendingLlmIndices: number[] = [];
    for (let idx = startIdx; idx < segments.length; idx++) {
      if (!segmentLlmComplete(segments[idx]!)) pendingLlmIndices.push(idx);
    }

    await llmTick();

    if (pendingLlmIndices.length > 0) {
      const fiBefore = firstLlmIncomplete(startIdx);
      if (fiBefore !== null) {
        await onCheckpoint?.(
          buildPartial(
            {
              customerId,
              segments,
              financialDocuments: [],
              pages,
              warnings,
              manualOverride: resume?.manualOverride ?? null,
              pipelineCheckpoint: "llm_in_progress",
              llmNextSegmentIndex: fiBefore,
              combinedText: "",
            },
            diagnosticLog
          )
        );
      }

      await runWithConcurrencyLimit(pendingLlmIndices, llmConcurrency, async (idx) => {
        const seg = segments[idx]!;

        pushJobDiagnostic("llm_segment", "Page LLM pass started", {
          segmentIndex: idx,
          pageNumber: seg.pageNumber,
          textChars: seg.text.length,
          textSource: seg.textSource,
        });

        const clsPrefix = `${DEFAULT_CLASSIFICATION_PROMPT}\n\n---\nPAGE TEXT:\n\n`;
        const clsUser = `${clsPrefix}${truncateForStructureModel(seg.text, clsPrefix, warnings, STRUCTURE_SYSTEM_PROMPT.length)}`;
        const cls = await structureChatJson(
          deps,
          structureModel,
          clsUser,
          recordExecution
            ? {
                recordExecution,
                jobId,
                customerId,
                pipelineSegmentId: seg.id,
                provider: aiProvider,
                method: "classification",
                pageNumber: seg.pageNumber,
              }
            : undefined,
          pushJobDiagnostic
        );
        seg.classificationRaw = cls.raw;
        seg.classification = parseClassification(cls.parsed);
        seg.type = seg.classification.segmentKind;
        seg.status = "classified";
        pushJobDiagnostic("classification", "Page classified", {
          pageNumber: seg.pageNumber,
          segmentKind: seg.classification.segmentKind,
          boundary: seg.classification.boundary,
        });

        const kind = seg.classification.segmentKind;
        const extractPrompt =
          kind === "statement" ? defaultPerPageStatementPrompt() : defaultPerPageInvoicePrompt();
        const exPrefix = `${extractPrompt}\n\n---\nPAGE TEXT:\n\n`;
        const exUser = `${exPrefix}${truncateForStructureModel(seg.text, exPrefix, warnings, STRUCTURE_SYSTEM_PROMPT.length)}`;
        const ex = await structureChatJson(
          deps,
          structureModel,
          exUser,
          recordExecution
            ? {
                recordExecution,
                jobId,
                customerId,
                pipelineSegmentId: seg.id,
                provider: aiProvider,
                method: "formatting",
                pageNumber: seg.pageNumber,
              }
            : undefined,
          pushJobDiagnostic
        );
        seg.extractedRaw = ex.raw;
        seg.extractedData = ex.parsed;
        seg.extractedParseError = ex.parseError;
        seg.status = "structured";
        pushJobDiagnostic("extracted_data", "Structured fields extracted from page", {
          pageNumber: seg.pageNumber,
          documentKind: kind,
          parseOk: ex.parseError == null,
          parseError: ex.parseError,
          extractedSummary: summarizeExtractedPayload(ex.parsed),
        });

        await llmTick();

        const fi = firstLlmIncomplete(startIdx);
        if (fi !== null) {
          await onCheckpoint?.(
            buildPartial(
              {
                customerId,
                segments,
                financialDocuments: [],
                pages,
                warnings,
                manualOverride: resume?.manualOverride ?? null,
                pipelineCheckpoint: "llm_in_progress",
                llmNextSegmentIndex: fi,
                combinedText: "",
              },
              diagnosticLog
            )
          );
        }
      });

      pushJobDiagnostic("structured_batch", "All segment structured payloads (summary)", {
        segmentCount: segments.length,
        summaries: segments.slice(0, 50).map((s) => ({
          page: s.pageNumber,
          segmentKind: s.type,
          summary: summarizeExtractedPayload(s.extractedData),
        })),
        ...(segments.length > 50 ? { _moreSegmentsOmitted: segments.length - 50 } : {}),
      });

      await onCheckpoint?.(
        buildPartial(
          {
            customerId,
            segments,
            financialDocuments: [],
            pages,
            warnings,
            manualOverride: resume?.manualOverride ?? null,
            pipelineCheckpoint: "structured",
            combinedText: "",
          },
          diagnosticLog
        )
      );
    }
  } else {
    pushJobDiagnostic("llm_phase", "Skipped LLM phase (resume checkpoint already structured or merged)", {
      checkpoint: String(cp),
      segmentCount: segments.length,
    });
  }

  await tick(80);

  let financialDocuments: ReturnType<typeof mergeBuildAndValidate>;
  if (cp === "merged" && resume?.financialDocuments?.length) {
    financialDocuments = JSON.parse(JSON.stringify(resume.financialDocuments)) as ReturnType<
      typeof mergeBuildAndValidate
    >;
    pushJobDiagnostic("resume", "Skipped merge; using saved financial documents", {
      documentCount: financialDocuments.length,
    });
  } else {
    financialDocuments = mergeBuildAndValidate(segments, jobId, fileId, customerId);
    pushJobDiagnostic("merge", "Merged segments into financial documents", {
      documentCount: financialDocuments.length,
      docTypes: financialDocuments.map((d) => d.type),
    });
    await onCheckpoint?.(
      buildPartial(
        {
          customerId,
          segments,
          financialDocuments,
          pages,
          warnings,
          manualOverride: resume?.manualOverride ?? null,
          pipelineCheckpoint: "merged",
          combinedText: "",
        },
        diagnosticLog
      )
    );
  }

  await tick(82);

  pushJobDiagnostic("enrich", "Starting per-invoice line items description enrichment", {
    invoiceDocumentCount: financialDocuments.filter((d) => d.type === "invoice").length,
  });

  await enrichInvoiceLineItemsDescriptions(financialDocuments, {
    deps,
    structureModel,
    structureTimeoutMs: structureTimeoutMs(),
    jobId,
    customerId,
    aiProvider,
    recordExecution,
    pushJobDiagnostic,
    warnings,
    onInvoiceDone: async (done, total) => {
      pushJobDiagnostic("enrich", `Line items description progress ${done}/${total}`, {
        done,
        total,
      });
      await tick(82 + Math.floor((17 * done) / Math.max(total, 1)));
    },
  });

  pushJobDiagnostic("merge", "Final financial documents (post-enrich)", {
    documentCount: financialDocuments.length,
    docTypes: financialDocuments.map((d) => d.type),
    documents: financialDocuments.map((d) => summarizeFinancialDocument(d)),
  });

  const combinedText = segments.map((s) => `--- Page ${s.pageNumber} ---\n${s.text}`).join("\n\n");

  const structured = financialDocuments.length ? legacyStructured(financialDocuments[0]) : null;
  const structuredRaw = structured != null ? JSON.stringify(structured, null, 2) : "";
  const structuredParseError: string | null = null;

  await tick(100);

  const automatedSnapshot = {
    segments: JSON.parse(JSON.stringify(segments)) as Segment[],
    financialDocuments: JSON.parse(JSON.stringify(financialDocuments)) as typeof financialDocuments,
  };

  const result: FinancialJobResult = {
    customerId,
    pipelineVersion: 1,
    pipelineCheckpoint: "complete",
    llmNextSegmentIndex: undefined,
    textNextPageIndex: undefined,
    segments,
    financialDocuments,
    automatedSnapshot,
    manualOverride: resume?.manualOverride ?? null,
    combinedText,
    pages,
    structured,
    structuredRaw,
    structuredParseError,
    warnings,
    diagnosticLog: [...diagnosticLog],
  };

  await onCheckpoint?.(result);

  return result;
}

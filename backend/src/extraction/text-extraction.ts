import type { AiChatResult, AiProviderId, ExtractPipelineDeps } from "../ai/types.js";
import { prepareImageForVision } from "../files/image-normalize.util.js";
import { extractPdfTextPerPage, renderPdfPageToPng } from "../pdf.js";
import type { PageTrace } from "./financial-types.js";

export type RecordAiExecutionFn = (args: {
  jobId: string;
  customerId: string;
  pipelineSegmentId: string;
  method: "extraction" | "classification" | "formatting";
  provider: AiProviderId;
  model: string;
  usage?: import("../ai/types.js").AiCallUsage | null;
}) => void | Promise<void>;

export type VisionExecutionCtx = {
  recordExecution?: RecordAiExecutionFn;
  jobId: string;
  customerId: string;
  pipelineSegmentId: string;
  provider: AiProviderId;
  visionModel: string;
  pushJobDiagnostic?: (phase: string, message: string, meta?: Record<string, unknown>) => void;
};

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

function envPositiveIntOrNull(name: string): number | null {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
}

/** Min chars from PDF text layer before skipping vision OCR (env `PDF_PAGE_MIN_TEXT_CHARS`). */
export function pdfMinTextChars(): number {
  return envInt("PDF_PAGE_MIN_TEXT_CHARS", 50);
}

/** Fast pass: embedded text per page only (no vision). Same page cap as full extraction. */
export async function getPdfTextLayerSlice(
  pdfBuffer: Buffer,
  warnings: string[]
): Promise<{ slice: string[] }> {
  const maxPages = envPositiveIntOrNull("PDF_MAX_PAGES");
  const perPageTexts = await extractPdfTextPerPage(pdfBuffer);
  if (maxPages != null && perPageTexts.length > maxPages) {
    warnings.push(
      `PDF has ${perPageTexts.length} pages; only the first ${maxPages} are processed (unset PDF_MAX_PAGES for no limit).`
    );
  }
  const slice = maxPages == null ? perPageTexts : perPageTexts.slice(0, maxPages);
  return { slice };
}

/** Vision OCR for a single PDF page (rasterize + vision model). */
export async function visionOcrPdfPage(
  deps: ExtractPipelineDeps,
  pdfBuffer: Buffer,
  pageNumber1Based: number,
  visionModel: string,
  visionPrompt: string,
  warnings: string[],
  execCtx?: VisionExecutionCtx
): Promise<{ text: string; trace: PageTrace; textSource: "vision" }> {
  const t0 = Date.now();
  execCtx?.pushJobDiagnostic?.("vision_api", "PDF page vision OCR started", {
    pageNumber: pageNumber1Based,
    pipelineSegmentId: execCtx.pipelineSegmentId,
    provider: execCtx.provider,
    model: execCtx.visionModel,
    promptChars: visionPrompt.length,
  });
  try {
    const tRaster = Date.now();
    const png = await renderPdfPageToPng(pdfBuffer, pageNumber1Based);
    execCtx?.pushJobDiagnostic?.("vision_raster", "PDF page rasterized for vision", {
      pageNumber: pageNumber1Based,
      imageBytes: png.length,
      rasterMs: Date.now() - tRaster,
    });
    const tVision = Date.now();
    const vt = await visionExtractPage(deps, visionModel, png, visionPrompt, "image/png");
    execCtx?.pushJobDiagnostic?.("vision_api", "PDF page vision OCR completed", {
      pageNumber: pageNumber1Based,
      pipelineSegmentId: execCtx?.pipelineSegmentId,
      provider: execCtx?.provider,
      model: execCtx?.visionModel,
      imageBytes: png.length,
      visionMs: Date.now() - tVision,
      elapsedMs: Date.now() - t0,
      textChars: vt.text.length,
      inputTokens: vt.usage?.inputTokens ?? null,
      outputTokens: vt.usage?.outputTokens ?? null,
    });
    await execCtx?.recordExecution?.({
      jobId: execCtx.jobId,
      customerId: execCtx.customerId,
      pipelineSegmentId: execCtx.pipelineSegmentId,
      method: "extraction",
      provider: execCtx.provider,
      model: execCtx.visionModel,
      usage: vt.usage,
    });
    return {
      text: vt.text,
      textSource: "vision",
      trace: { page: pageNumber1Based, source: "vision", preview: vt.text.slice(0, 200) },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    execCtx?.pushJobDiagnostic?.("vision_api_error", "PDF page vision OCR failed", {
      pageNumber: pageNumber1Based,
      pipelineSegmentId: execCtx?.pipelineSegmentId,
      provider: execCtx?.provider,
      model: execCtx?.visionModel,
      elapsedMs: Date.now() - t0,
      error: msg.slice(0, 600),
    });
    const fallback = `[Page ${pageNumber1Based}: OCR unavailable — page rasterization or vision OCR failed]`;
    warnings.push(
      `Page ${pageNumber1Based}: little or no text layer and rasterization/OCR failed.`
    );
    return {
      text: fallback,
      textSource: "vision",
      trace: {
        page: pageNumber1Based,
        source: "vision",
        preview: "(failed — PDF rasterization or vision OCR error)",
      },
    };
  }
}

async function visionExtractPage(
  deps: ExtractPipelineDeps,
  visionModel: string,
  imageBuffer: Buffer,
  prompt: string,
  imageMime: string
): Promise<AiChatResult> {
  return deps.visionChat(visionModel, prompt, imageBuffer, imageMime);
}

export type PageTextResult = {
  pageNumber: number;
  text: string;
  textSource: "text" | "vision";
  trace: PageTrace;
};

/**
 * Stage 2: extract plain text per PDF page — text layer or vision OCR when thin.
 */
export async function extractTextsFromPdf(
  deps: ExtractPipelineDeps,
  pdfBuffer: Buffer,
  visionModel: string,
  visionPrompt: string,
  warnings: string[],
  onPage?: (pageIndex: number, total: number) => void | Promise<void>
): Promise<PageTextResult[]> {
  const minChars = pdfMinTextChars();
  const { slice } = await getPdfTextLayerSlice(pdfBuffer, warnings);
  const out: PageTextResult[] = [];

  for (let i = 0; i < slice.length; i++) {
    const pageNumber = i + 1;
    await onPage?.(i, slice.length);
    const t = slice[i];
    if (t && t.length >= minChars) {
      out.push({
        pageNumber,
        text: t,
        textSource: "text",
        trace: { page: pageNumber, source: "text", preview: t.slice(0, 200) },
      });
      continue;
    }
    const o = await visionOcrPdfPage(deps, pdfBuffer, pageNumber, visionModel, visionPrompt, warnings);
    out.push({
      pageNumber,
      text: o.text,
      textSource: o.textSource,
      trace: o.trace,
    });
  }

  return out;
}

/** Stage 2 for a single raster image (vision only). */
export async function extractTextFromImage(
  deps: ExtractPipelineDeps,
  imageBuffer: Buffer,
  imageMime: string,
  visionModel: string,
  visionPrompt: string,
  execCtx?: VisionExecutionCtx
): Promise<PageTextResult> {
  const t0 = Date.now();
  let visionBuffer = imageBuffer;
  let visionMime = imageMime;
  try {
    const prepared = await prepareImageForVision(imageBuffer, imageMime);
    visionBuffer = prepared.buffer;
    visionMime = prepared.mimeType;
    if (prepared.converted) {
      execCtx?.pushJobDiagnostic?.("image_normalize", "Normalized JPEG for vision OCR", {
        pipelineSegmentId: execCtx?.pipelineSegmentId,
        sourceMime: imageMime,
        sourceBytes: imageBuffer.length,
        outputBytes: prepared.buffer.length,
        ...prepared.meta,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    execCtx?.pushJobDiagnostic?.("image_normalize_error", "JPEG normalization failed", {
      pipelineSegmentId: execCtx?.pipelineSegmentId,
      sourceMime: imageMime,
      error: msg.slice(0, 600),
    });
    throw e;
  }
  execCtx?.pushJobDiagnostic?.("vision_api", "Image vision OCR started", {
    pipelineSegmentId: execCtx?.pipelineSegmentId,
    provider: execCtx?.provider,
    model: execCtx?.visionModel,
    imageBytes: visionBuffer.length,
    imageMime: visionMime,
    promptChars: visionPrompt.length,
  });
  let vt: AiChatResult;
  try {
    vt = await visionExtractPage(deps, visionModel, visionBuffer, visionPrompt, visionMime);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    execCtx?.pushJobDiagnostic?.("vision_api_error", "Image vision OCR failed", {
      pipelineSegmentId: execCtx?.pipelineSegmentId,
      provider: execCtx?.provider,
      model: execCtx?.visionModel,
      elapsedMs: Date.now() - t0,
      error: msg.slice(0, 600),
    });
    throw e;
  }
  execCtx?.pushJobDiagnostic?.("vision_api", "Image vision OCR completed", {
    pipelineSegmentId: execCtx?.pipelineSegmentId,
    provider: execCtx?.provider,
    model: execCtx?.visionModel,
    elapsedMs: Date.now() - t0,
    textChars: vt.text.length,
    inputTokens: vt.usage?.inputTokens ?? null,
    outputTokens: vt.usage?.outputTokens ?? null,
  });
  await execCtx?.recordExecution?.({
    jobId: execCtx.jobId,
    customerId: execCtx.customerId,
    pipelineSegmentId: execCtx.pipelineSegmentId,
    method: "extraction",
    provider: execCtx.provider,
    model: execCtx.visionModel,
    usage: vt.usage,
  });
  return {
    pageNumber: 1,
    text: vt.text,
    textSource: "vision",
    trace: { page: 1, source: "vision", preview: vt.text.slice(0, 200) },
  };
}

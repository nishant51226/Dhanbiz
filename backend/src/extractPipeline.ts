import type { ExtractPipelineDeps } from "./ai/types.js";
import { prepareImageForVision } from "./files/image-normalize.util.js";
import {
  formatStructureContextLengthError,
  isStructureContextLengthError,
  truncateForStructureModel,
} from "./extraction/structure-input-budget.js";
import { OLLAMA_DEFAULT_FETCH_TIMEOUT_MS, parseJsonFromModelOutput } from "./ollama.js";
import { extractPdfTextPerPage, renderPdfPageToPng } from "./pdf.js";

const DEFAULT_VISION_PROMPT =
  "Extract all visible text in reading order. Output plain text only, no commentary.";

const DEFAULT_STRUCTURE_PROMPT = `You are helping an accounting firm. From the document text below, extract a single JSON object with these keys (use null when unknown):
documentType (e.g. "invoice", "receipt", "statement", "other"),
vendor, customer,
invoiceNumber, invoiceDate, dueDate,
currency,
lineItems: array of { description, quantity, unitPrice, amount },
subtotal, tax, total,
notes (string).

Rules: Output ONLY valid JSON, no markdown fences. Do not invent amounts; if unsure use null.

Your entire reply must be one JSON object and nothing else: no greeting, no "Certainly", no explanation, no markdown headings. Start your response with { and end with }.`;

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

/** Positive int from env, or `null` if unset / invalid — use for optional caps (null = no limit). */
function envPositiveIntOrNull(name: string): number | null {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
}

const STRUCTURE_SYSTEM_PROMPT =
  "You are a strict JSON extractor. Reply with a single JSON value only—no preamble, no markdown, no explanation, no sentences like 'Based on' or 'Summary'.";

async function structureFromText(
  deps: ExtractPipelineDeps,
  structureModel: string,
  structurePrompt: string,
  combinedText: string,
  warnings: string[]
): Promise<{ structuredRaw: string; structured: unknown | null; structuredParseError: string | null }> {
  const docPrefix = `${structurePrompt}\n\n---\nDOCUMENT TEXT:\n\n`;
  const doc = truncateForStructureModel(combinedText, docPrefix, warnings, STRUCTURE_SYSTEM_PROMPT.length);
  const structureTimeoutMs =
    Number(process.env.OLLAMA_STRUCTURE_FETCH_TIMEOUT_MS) ||
    Number(process.env.OLLAMA_FETCH_TIMEOUT_MS) ||
    OLLAMA_DEFAULT_FETCH_TIMEOUT_MS;
  let chatRes;
  try {
    chatRes = await deps.structureChat(
      structureModel,
      [
        {
          role: "system",
          content: STRUCTURE_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `${docPrefix}${doc}`,
        },
      ],
      structureTimeoutMs
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isStructureContextLengthError(msg)) {
      throw new Error(formatStructureContextLengthError(msg));
    }
    throw e;
  }
  const structuredRaw = chatRes.text;
  const parsed = parseJsonFromModelOutput(structuredRaw);
  return {
    structuredRaw,
    structured: parsed.ok ? parsed.value : null,
    structuredParseError: parsed.ok ? null : parsed.error,
  };
}

export type PageTrace = {
  page: number;
  source: "text" | "vision";
  preview: string;
};

export type ExtractResult = {
  combinedText: string;
  pages: PageTrace[];
  structured: unknown | null;
  structuredRaw: string;
  structuredParseError: string | null;
  warnings: string[];
};

async function visionExtractPage(
  deps: ExtractPipelineDeps,
  visionModel: string,
  imageBuffer: Buffer,
  prompt: string,
  imageMime: string
): Promise<string> {
  const r = await deps.visionChat(visionModel, prompt, imageBuffer, imageMime);
  return r.text;
}

export type ExtractProgressFn = (percent: number) => void | Promise<void>;

export async function runImagePipeline(
  deps: ExtractPipelineDeps,
  visionModel: string,
  structureModel: string,
  imageBuffer: Buffer,
  imageMime: string,
  visionPrompt: string,
  structurePrompt: string,
  onProgress?: ExtractProgressFn
): Promise<ExtractResult> {
  const warnings: string[] = [];
  await onProgress?.(25);
  const prepared = await prepareImageForVision(imageBuffer, imageMime);
  if (prepared.converted) {
    warnings.push("JPEG normalized for vision OCR (original file unchanged in storage).");
  }
  const text = await visionExtractPage(
    deps,
    visionModel,
    prepared.buffer,
    visionPrompt,
    prepared.mimeType,
  );
  const pages: PageTrace[] = [{ page: 1, source: "vision", preview: text.slice(0, 200) }];
  await onProgress?.(60);
  const st = await structureFromText(deps, structureModel, structurePrompt, text, warnings);
  await onProgress?.(100);
  return {
    combinedText: text,
    pages,
    structured: st.structured,
    structuredRaw: st.structuredRaw,
    structuredParseError: st.structuredParseError,
    warnings,
  };
}

export async function runPdfPipeline(
  deps: ExtractPipelineDeps,
  visionModel: string,
  structureModel: string,
  pdfBuffer: Buffer,
  visionPrompt: string,
  structurePrompt: string,
  onProgress?: ExtractProgressFn
): Promise<ExtractResult> {
  const warnings: string[] = [];
  const minChars = envInt("PDF_PAGE_MIN_TEXT_CHARS", 50);
  const maxPages = envPositiveIntOrNull("PDF_MAX_PAGES");
  const perPageTexts = await extractPdfTextPerPage(pdfBuffer);
  if (maxPages != null && perPageTexts.length > maxPages) {
    warnings.push(
      `PDF has ${perPageTexts.length} pages; only the first ${maxPages} are processed (unset PDF_MAX_PAGES for no limit).`
    );
  }
  const slice = maxPages == null ? perPageTexts : perPageTexts.slice(0, maxPages);
  const total = slice.length || 1;
  const pages: PageTrace[] = [];
  const parts: string[] = [];

  const pageProgress = (pageIndex: number) =>
    Math.min(90, Math.round(((pageIndex + 1) / total) * 90));

  for (let i = 0; i < slice.length; i++) {
    const pageNum = i + 1;
    const t = slice[i];
    await onProgress?.(pageProgress(i));
    if (t.length >= minChars) {
      parts.push(`--- Page ${pageNum} (text layer) ---\n${t}`);
      pages.push({ page: pageNum, source: "text", preview: t.slice(0, 200) });
      continue;
    }
    try {
      const png = await renderPdfPageToPng(pdfBuffer, pageNum);
      const vt = await visionExtractPage(deps, visionModel, png, visionPrompt, "image/png");
      parts.push(`--- Page ${pageNum} (vision OCR) ---\n${vt}`);
      pages.push({ page: pageNum, source: "vision", preview: vt.slice(0, 200) });
    } catch {
      parts.push(
        `--- Page ${pageNum} (scanned; OCR skipped) ---\n[Page rasterization or vision OCR failed]`
      );
      pages.push({
        page: pageNum,
        source: "vision",
        preview: "(failed — PDF rasterization or vision OCR error)",
      });
      warnings.push(
        `Page ${pageNum}: little or no text layer and rasterization or vision OCR failed.`
      );
    }
  }

  await onProgress?.(92);
  const combinedText = parts.join("\n\n");
  const st = await structureFromText(deps, structureModel, structurePrompt, combinedText, warnings);
  await onProgress?.(100);
  return {
    combinedText,
    pages,
    structured: st.structured,
    structuredRaw: st.structuredRaw,
    structuredParseError: st.structuredParseError,
    warnings,
  };
}

export function defaultVisionPrompt(): string {
  return (
    (typeof process.env.DEFAULT_VISION_PROMPT === "string" &&
      process.env.DEFAULT_VISION_PROMPT.trim()) ||
    DEFAULT_VISION_PROMPT
  );
}

export function defaultStructurePrompt(): string {
  return (
    (typeof process.env.DEFAULT_STRUCTURE_PROMPT === "string" &&
      process.env.DEFAULT_STRUCTURE_PROMPT.trim()) ||
    DEFAULT_STRUCTURE_PROMPT
  );
}

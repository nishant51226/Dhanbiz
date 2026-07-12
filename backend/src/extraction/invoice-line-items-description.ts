import type { AiProviderId, ExtractPipelineDeps } from "../ai/types.js";
import { parseJsonFromModelOutput } from "../ollama.js";
import type { FinancialDocument, Invoice, InvoiceLine } from "./financial-types.js";
import { invoiceLineItemsDescriptionPrompt } from "./prompts.js";
import { isStructureContextLengthError, truncateForStructureModel } from "./structure-input-budget.js";
import type { RecordAiExecutionFn } from "./text-extraction.js";

const MAX_DESC_LEN = 1200;
const LINE_ITEMS_DESC_SYSTEM_PROMPT =
  "You are a strict JSON extractor. Reply with a single JSON value only—no preamble, no markdown, no explanation.";

function lineItemsDescMaxLines(): number {
  const v = Number(process.env.LINE_ITEMS_DESC_MAX_LINES);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 80;
}

/** Shorter than full structure timeout — line-items summary should fail fast and use fallback. */
export function lineItemsDescTimeoutMs(structureTimeoutMs: number): number {
  const v = Number(process.env.LINE_ITEMS_DESC_TIMEOUT_MS);
  if (Number.isFinite(v) && v > 0) return Math.floor(v);
  return Math.min(structureTimeoutMs, 3 * 60 * 1000);
}

/** Deterministic fallback when the structure LLM does not return a summary. */
export function buildLineItemsDescriptionFallback(lineItems: InvoiceLine[]): string | null {
  const labels = lineItems
    .map((li) => li.description?.trim())
    .filter((d): d is string => Boolean(d));
  if (labels.length === 0) return null;
  const unique = [...new Set(labels)];
  if (unique.length <= 6) {
    return unique.join("; ").slice(0, MAX_DESC_LEN);
  }
  const head = unique.slice(0, 6).join("; ");
  return `${head}; and ${unique.length - 6} other line items`.slice(0, MAX_DESC_LEN);
}

function parseLineItemsDescription(parsed: unknown, rawText: string): string | null {
  if (typeof parsed === "string") {
    const s = parsed.trim();
    return s.length ? s.slice(0, MAX_DESC_LEN) : null;
  }
  if (parsed && typeof parsed === "object") {
    const raw = (parsed as Record<string, unknown>).lineItemsDescription;
    if (raw != null) {
      const s = String(raw).trim();
      if (s.length) return s.slice(0, MAX_DESC_LEN);
    }
  }
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return null;
  return trimmed.slice(0, MAX_DESC_LEN);
}

function buildLineItemsDescUserContent(
  inv: Pick<Invoice, "vendor" | "invoiceNumber" | "customer" | "lineItems">,
  warnings?: string[]
): { userContent: string; lineItemCount: number; omittedLineCount: number } {
  const maxLines = lineItemsDescMaxLines();
  const total = inv.lineItems.length;
  const omittedLineCount = total > maxLines ? total - maxLines : 0;
  const cappedInv = {
    ...inv,
    lineItems: omittedLineCount > 0 ? inv.lineItems.slice(0, maxLines) : inv.lineItems,
  };
  const { prefix, lineItemsJson } = invoiceLineItemsDescriptionPrompt(cappedInv, { omittedLineCount });
  const truncatedJson = truncateForStructureModel(
    lineItemsJson,
    prefix,
    warnings,
    LINE_ITEMS_DESC_SYSTEM_PROMPT.length
  );
  return {
    userContent: `${prefix}${truncatedJson}`,
    lineItemCount: cappedInv.lineItems.length,
    omittedLineCount,
  };
}

async function requestLineItemsDescription(
  inv: Pick<Invoice, "vendor" | "invoiceNumber" | "customer" | "lineItems">,
  ctx: {
    deps: ExtractPipelineDeps;
    structureModel: string;
    structureTimeoutMs: number;
    jobId: string;
    customerId: string;
    aiProvider: AiProviderId;
    pipelineSegmentId: string;
    recordExecution?: RecordAiExecutionFn;
    pushJobDiagnostic?: (phase: string, message: string, meta?: Record<string, unknown>) => void;
    warnings?: string[];
  }
): Promise<string | null> {
  const { userContent, lineItemCount, omittedLineCount } = buildLineItemsDescUserContent(inv, ctx.warnings);
  ctx.pushJobDiagnostic?.("line_items_description", "Generating line items summary for one invoice", {
    pipelineSegmentId: ctx.pipelineSegmentId,
    lineItemCount,
    omittedLineCount,
    promptChars: userContent.length + LINE_ITEMS_DESC_SYSTEM_PROMPT.length,
    vendor: inv.vendor,
    invoiceNumber: inv.invoiceNumber,
  });

  let chatRes;
  try {
    chatRes = await ctx.deps.structureChat(
      ctx.structureModel,
      [
        {
          role: "system",
          content: LINE_ITEMS_DESC_SYSTEM_PROMPT,
        },
        { role: "user", content: userContent },
      ],
      lineItemsDescTimeoutMs(ctx.structureTimeoutMs)
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ctx.pushJobDiagnostic?.("line_items_description", "LLM call failed; using deterministic fallback", {
      pipelineSegmentId: ctx.pipelineSegmentId,
      contextLimit: isStructureContextLengthError(msg),
      error: msg.slice(0, 600),
    });
    return buildLineItemsDescriptionFallback(inv.lineItems);
  }

  if (ctx.recordExecution) {
    await ctx.recordExecution({
      jobId: ctx.jobId,
      customerId: ctx.customerId,
      pipelineSegmentId: ctx.pipelineSegmentId,
      method: "formatting",
      provider: ctx.aiProvider,
      model: ctx.structureModel,
      usage: chatRes.usage,
    });
  }

  const parsed = parseJsonFromModelOutput(chatRes.text);
  const fromLlm = parsed.ok
    ? parseLineItemsDescription(parsed.value, chatRes.text)
    : parseLineItemsDescription(null, chatRes.text);
  if (fromLlm) {
    ctx.pushJobDiagnostic?.("line_items_description", "Line items summary generated", {
      pipelineSegmentId: ctx.pipelineSegmentId,
      descriptionChars: fromLlm.length,
      vendor: inv.vendor,
      invoiceNumber: inv.invoiceNumber,
    });
    return fromLlm;
  }

  return buildLineItemsDescriptionFallback(inv.lineItems);
}

/** One line-items summary LLM call per invoice financial document (not per job / whole PDF). */
export async function enrichInvoiceLineItemsDescriptions(
  documents: FinancialDocument[],
  ctx: {
    deps: ExtractPipelineDeps;
    structureModel: string;
    structureTimeoutMs: number;
    jobId: string;
    customerId: string;
    aiProvider: AiProviderId;
    recordExecution?: RecordAiExecutionFn;
    pushJobDiagnostic?: (phase: string, message: string, meta?: Record<string, unknown>) => void;
    warnings?: string[];
    onInvoiceDone?: (done: number, total: number) => void | Promise<void>;
  }
): Promise<void> {
  const invoiceDocs = documents.filter((d) => d.type === "invoice" && d.invoice);
  if (invoiceDocs.length === 0) return;

  ctx.pushJobDiagnostic?.("enrich", `Enriching line items for ${invoiceDocs.length} invoice(s)`, {
    invoiceCount: invoiceDocs.length,
  });

  const total = invoiceDocs.length;
  let done = 0;

  for (const fd of invoiceDocs) {
    const inv = fd.invoice!;
    if (!inv.lineItems?.length) {
      done++;
      await ctx.onInvoiceDone?.(done, total);
      continue;
    }

    const description = await requestLineItemsDescription(
      {
        vendor: inv.vendor,
        invoiceNumber: inv.invoiceNumber,
        customer: inv.customer,
        lineItems: inv.lineItems,
      },
      {
        ...ctx,
        pipelineSegmentId: `${ctx.jobId}-line-items-desc-${fd.id}`,
      }
    );

    if (description) {
      inv.lineItemsDescription = description;
    }

    done++;
    await ctx.onInvoiceDone?.(done, total);
  }
}

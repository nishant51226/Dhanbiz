/** Conservative chars-per-token estimate for English/OCR text (structure prompts). */
const CHARS_PER_TOKEN_HEURISTIC = 4;

/** Matches default `OLLAMA_STRUCTURE_NUM_CTX` when unset. */
const DEFAULT_STRUCTURE_CONTEXT_TOKENS = 32_768;

/** Reserve tokens for model output, chat template, and estimation error. */
const STRUCTURE_INPUT_TOKEN_SAFETY_MARGIN = 2_048;

const STRUCTURE_SYSTEM_PROMPT_CHARS =
  "You are a strict JSON extractor. Reply with a single JSON value only—no preamble, no markdown, no explanation.".length;

const MIN_TRUNCATED_DOC_CHARS = 4_000;

function envPositiveIntOrNull(name: string): number | null {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
}

function structureContextTokens(): number {
  const numCtx = Number(process.env.OLLAMA_STRUCTURE_NUM_CTX);
  return Number.isFinite(numCtx) && numCtx > 0 ? Math.floor(numCtx) : DEFAULT_STRUCTURE_CONTEXT_TOKENS;
}

/** Max page/document text chars safe for one structure LLM call. */
export function maxStructureDocumentChars(
  promptPrefixChars: number,
  systemPromptChars = STRUCTURE_SYSTEM_PROMPT_CHARS
): number {
  const inputTokenBudget = structureContextTokens() - STRUCTURE_INPUT_TOKEN_SAFETY_MARGIN;
  const totalCharBudget = inputTokenBudget * CHARS_PER_TOKEN_HEURISTIC;
  const available = totalCharBudget - promptPrefixChars - systemPromptChars;
  const explicit = envPositiveIntOrNull("STRUCTURE_MAX_CHARS");
  const cap = explicit != null ? Math.min(explicit, available) : available;
  return Math.max(MIN_TRUNCATED_DOC_CHARS, Math.floor(cap));
}

/** Truncate document/page text so prompt + system message stay within model context. */
export function truncateForStructureModel(
  text: string,
  promptPrefix: string,
  warnings?: string[],
  systemPromptChars = STRUCTURE_SYSTEM_PROMPT_CHARS
): string {
  const maxDoc = maxStructureDocumentChars(promptPrefix.length, systemPromptChars);
  if (text.length <= maxDoc) return text;
  warnings?.push(
    `Text truncated from ${text.length} to ${maxDoc} characters for the structure model (tune STRUCTURE_MAX_CHARS or OLLAMA_STRUCTURE_NUM_CTX).`
  );
  return text.slice(0, maxDoc);
}

/** User-facing message when the provider rejects an oversized prompt. */
export function formatStructureContextLengthError(providerMessage: string): string {
  return (
    "Document text exceeds the structure model context limit. " +
    "Try PDF_MAX_PAGES, lower STRUCTURE_MAX_CHARS, or a larger-context model. " +
    `Provider: ${providerMessage.slice(0, 600)}`
  );
}

export function isStructureContextLengthError(message: string): boolean {
  return /maximum context length|context length is \d+|requested \d+ input tokens|context window|too many tokens/i.test(
    message
  );
}

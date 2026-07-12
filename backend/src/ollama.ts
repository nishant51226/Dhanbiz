/** Default HTTP timeout for Ollama `/api/chat` (ms). Override with `OLLAMA_FETCH_TIMEOUT_MS` or structure-only `OLLAMA_STRUCTURE_FETCH_TIMEOUT_MS`. */
export const OLLAMA_DEFAULT_FETCH_TIMEOUT_MS = 15 * 60 * 1000;

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  images?: string[];
};

/** Extra `/api/chat` fields: `format` enables Ollama JSON / schema mode; `options` maps to num_ctx, num_predict, etc. */
export type OllamaChatExtra = {
  format?: "json" | Record<string, unknown>;
  options?: Record<string, unknown>;
};

/**
 * Defaults for structure model: align with common Qwen2.5 builds (e.g. 32k context).
 * Very high `num_predict` (e.g. 131072) makes CPU inference run for hours and hits HTTP timeouts.
 * Override with `OLLAMA_STRUCTURE_NUM_CTX` / `OLLAMA_STRUCTURE_NUM_PREDICT` for larger models.
 */
export function buildStructureOllamaOptions(): Record<string, unknown> {
  const numCtx = Number(process.env.OLLAMA_STRUCTURE_NUM_CTX);
  const numPredict = Number(process.env.OLLAMA_STRUCTURE_NUM_PREDICT);
  const temp = Number(process.env.OLLAMA_STRUCTURE_TEMPERATURE);
  const opts: Record<string, unknown> = {
    temperature: Number.isFinite(temp) && temp >= 0 ? temp : 0,
  };
  opts.num_ctx = Number.isFinite(numCtx) && numCtx > 0 ? Math.floor(numCtx) : 32768;
  opts.num_predict = Number.isFinite(numPredict) && numPredict > 0 ? Math.floor(numPredict) : 8192;
  return opts;
}

/** Structure step: JSON format mode + options (set `OLLAMA_STRUCTURE_FORMAT=off` to disable format if Ollama is too old). */
export function structureOllamaChatExtra(): OllamaChatExtra {
  const formatOff = process.env.OLLAMA_STRUCTURE_FORMAT?.toLowerCase() === "off";
  const extra: OllamaChatExtra = { options: buildStructureOllamaOptions() };
  if (!formatOff) {
    extra.format = "json";
  }
  return extra;
}

export type OllamaChatResult = {
  text: string;
  promptEvalCount?: number;
  evalCount?: number;
};

export async function ollamaChat(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  timeoutMs = Number(process.env.OLLAMA_FETCH_TIMEOUT_MS) || OLLAMA_DEFAULT_FETCH_TIMEOUT_MS,
  extra?: OllamaChatExtra
): Promise<OllamaChatResult> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/chat`;
  const vision = messages.some((m) => (m.images?.length ?? 0) > 0);
  const t0 = Date.now();
  const fmt =
    extra?.format === undefined
      ? "none"
      : typeof extra.format === "string"
        ? extra.format
        : "schema";
  console.log(`[docp] Ollama POST ${url} model=${model} vision=${vision} format=${fmt}`);

  const body: Record<string, unknown> = { model, stream: false, messages };
  if (extra?.format !== undefined) body.format = extra.format;
  if (extra?.options && Object.keys(extra.options).length > 0) body.options = extra.options;

  let r: Response;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[docp] Ollama unreachable (${Date.now() - t0}ms):`, msg);
    throw e;
  }

  const raw = await r.text();
  const ms = Date.now() - t0;
  if (!r.ok) {
    console.error(`[docp] Ollama HTTP ${r.status} (${ms}ms):`, raw.slice(0, 500));
    throw new Error(`Ollama HTTP ${r.status}: ${raw.slice(0, 2000)}`);
  }
  let data: {
    message?: { content?: string };
    prompt_eval_count?: number;
    eval_count?: number;
  };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    console.error(`[docp] Ollama response not JSON (${ms}ms) model=${model}:`, raw.slice(0, 400));
    throw new Error("Invalid JSON from Ollama.");
  }

  const content = data.message?.content ?? "";
  const promptEval =
    typeof data.prompt_eval_count === "number" && Number.isFinite(data.prompt_eval_count)
      ? Math.floor(data.prompt_eval_count)
      : undefined;
  const evalCount =
    typeof data.eval_count === "number" && Number.isFinite(data.eval_count)
      ? Math.floor(data.eval_count)
      : undefined;
  const previewLen = 500;
  const preview = JSON.stringify(content.slice(0, previewLen));
  if (!content.length) {
    console.warn(
      `[docp] Ollama empty message.content (${ms}ms) model=${model} topKeys=${JSON.stringify(
        data && typeof data === "object" ? Object.keys(data) : []
      )}`
    );
  } else {
    console.log(
      `[docp] Ollama OK (${ms}ms) model=${model} chars=${content.length} preview=${preview}${content.length > previewLen ? "…" : ""}`
    );
  }
  return {
    text: content,
    promptEvalCount: promptEval,
    evalCount,
  };
}

/** Balanced `{...}` starting at `start`, respecting JSON string escapes and nested braces. */
function extractJsonObjectAt(s: string, start: number): string | null {
  if (start < 0 || start >= s.length || s[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function extractAllJsonObjects(s: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    const start = s.indexOf("{", i);
    if (start === -1) break;
    const slice = extractJsonObjectAt(s, start);
    if (slice) {
      out.push(slice);
      i = start + slice.length;
    } else {
      i = start + 1;
    }
  }
  return out;
}

/** Each non-empty line is a complete JSON value (NDJSON). */
function tryParseNdjsonLines(s: string): unknown[] | null {
  const lines = s.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return null;
  const values: unknown[] = [];
  for (const line of lines) {
    try {
      values.push(JSON.parse(line));
    } catch {
      return null;
    }
  }
  return values;
}

function tryParseJson(t: string): unknown {
  return JSON.parse(t);
}

export function parseJsonFromModelOutput(s: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const raw = s.trim();
  let lastError = "invalid JSON";

  const tryValue = (v: unknown): { ok: true; value: unknown } => ({ ok: true, value: v });

  const tryString = (t: string): boolean => {
    try {
      tryParseJson(t);
      return true;
    } catch (e) {
      lastError = e instanceof Error ? e.message : "invalid JSON";
      return false;
    }
  };

  if (tryString(raw)) return tryValue(tryParseJson(raw));

  const fenceAnywhere = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceAnywhere?.[1]) {
    const inner = fenceAnywhere[1].trim();
    if (tryString(inner)) return tryValue(tryParseJson(inner));
    const ndIn = tryParseNdjsonLines(inner);
    if (ndIn) return tryValue(ndIn);
    const parsedIn = extractAllJsonObjects(inner)
      .map((o) => {
        try {
          return tryParseJson(o);
        } catch {
          return null;
        }
      })
      .filter((x): x is unknown => x !== null);
    if (parsedIn.length >= 2) return tryValue(parsedIn);
    if (parsedIn.length === 1) return tryValue(parsedIn[0]);
  }

  const nd = tryParseNdjsonLines(raw);
  if (nd) return tryValue(nd);

  const parsedBlocks = extractAllJsonObjects(raw)
    .map((o) => {
      try {
        return tryParseJson(o);
      } catch {
        return null;
      }
    })
    .filter((x): x is unknown => x !== null);
  if (parsedBlocks.length >= 2) return tryValue(parsedBlocks);
  if (parsedBlocks.length === 1) return tryValue(parsedBlocks[0]);

  const idx = raw.indexOf("{");
  if (idx !== -1) {
    const first = extractJsonObjectAt(raw, idx);
    if (first && tryString(first)) return tryValue(tryParseJson(first));
  }

  return { ok: false, error: lastError };
}

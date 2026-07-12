import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ChatMessage } from "../../ollama.js";
import type { AiChatResult, ExtractPipelineDeps } from "../types.js";

const hfLog = new Logger("HuggingFaceProvider");

/** Router / gateway timeouts and overload — safe to retry. */
const TRANSIENT_HF_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Avoid megabyte HTML error pages in logs and `Error.message`. */
function briefHttpFailureBody(body: string, maxLen = 400): string {
  const t = body.trimStart();
  if (t.startsWith("<!DOCTYPE") || t.toLowerCase().startsWith("<html")) {
    return `HTML error page (${body.length} chars)`;
  }
  if (body.length <= maxLen) return body;
  return `${body.slice(0, maxLen)}…`;
}

function clampInt(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

type HuggingFaceChatResponse = {
  choices?: { message?: { content?: string } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

function usageFromHuggingFace(u: HuggingFaceChatResponse["usage"]): AiChatResult["usage"] {
  if (!u || typeof u !== "object") return null;
  return {
    inputTokens: u.prompt_tokens ?? null,
    outputTokens: u.completion_tokens ?? null,
    totalTokens: u.total_tokens ?? null,
    metadata: u as unknown as Record<string, unknown>,
  };
}

export function createHuggingFaceDeps(config: ConfigService): ExtractPipelineDeps {
  const apiKey = config.get<string>("HUGGINGFACE_API_KEY")?.trim() ?? "";
  const base = (config.get<string>("HUGGINGFACE_BASE_URL") ?? "https://router.huggingface.co/v1")
    .replace(/\/$/, "");
  const defaultTimeout = Number(config.get("OLLAMA_FETCH_TIMEOUT_MS")) || 15 * 60 * 1000;
  /** Extra attempts after the first failure for transient HTTP (504 from HF router, etc.). */
  const hfMaxRetries = clampInt(Number(config.get("HUGGINGFACE_HTTP_MAX_RETRIES")), 0, 12, 4);
  const hfRetryBaseMs = clampInt(Number(config.get("HUGGINGFACE_HTTP_RETRY_BASE_MS")), 200, 120_000, 2_000);

  async function visionChat(
    model: string,
    prompt: string,
    imageBytes: Buffer,
    mimeType?: string
  ): Promise<AiChatResult> {
    const url = `${base}/chat/completions`;
    const b64 = imageBytes.toString("base64");
    const mime = mimeType && mimeType.startsWith("image/") ? mimeType : "image/png";
    const body = {
      model,
      messages: [
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: prompt },
            {
              type: "image_url" as const,
              image_url: { url: `data:${mime};base64,${b64}` },
            },
          ],
        },
      ],
    };
    hfLog.log(
      `visionChat POST ${url} model=${model} promptChars=${prompt.length} imageBytes=${imageBytes.length} mime=${mime}`
    );
    let lastStatus = 0;
    let lastRaw = "";
    for (let attempt = 0; attempt <= hfMaxRetries; attempt++) {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(defaultTimeout),
      });
      lastRaw = await r.text();
      lastStatus = r.status;
      if (r.ok) {
        const data = JSON.parse(lastRaw) as HuggingFaceChatResponse;
        hfLog.log(`visionChat OK model=${model} responseChars=${(data.choices?.[0]?.message?.content ?? "").length}`);
        return {
          text: data.choices?.[0]?.message?.content ?? "",
          usage: usageFromHuggingFace(data.usage),
        };
      }
      const retryable = TRANSIENT_HF_HTTP.has(r.status) && attempt < hfMaxRetries;
      hfLog.warn(
        `visionChat HTTP ${r.status} attempt ${attempt + 1}/${hfMaxRetries + 1} body=${briefHttpFailureBody(lastRaw)}`
      );
      if (!retryable) {
        throw new Error(`HuggingFace HTTP ${r.status}: ${briefHttpFailureBody(lastRaw, 600)}`);
      }
      const delay = hfRetryBaseMs * 2 ** attempt + Math.floor(Math.random() * 500);
      hfLog.warn(`visionChat retrying in ${delay}ms…`);
      await sleep(delay);
    }
    throw new Error(`HuggingFace HTTP ${lastStatus}: ${briefHttpFailureBody(lastRaw, 600)}`);
  }

  async function structureChat(
    model: string,
    messages: ChatMessage[],
    timeoutMs: number
  ): Promise<AiChatResult> {
    const url = `${base}/chat/completions`;
    const hfMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const body = {
      model,
      messages: hfMessages,
      response_format: { type: "json_object" as const },
    };
    hfLog.log(
      `structureChat POST ${url} model=${model} messages=${hfMessages.length} userChars=${String(hfMessages.at(-1)?.content ?? "").length}`
    );
    let lastStatus = 0;
    let lastRaw = "";
    for (let attempt = 0; attempt <= hfMaxRetries; attempt++) {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      lastRaw = await r.text();
      lastStatus = r.status;
      if (r.ok) {
        const data = JSON.parse(lastRaw) as HuggingFaceChatResponse;
        hfLog.log(`structureChat OK model=${model} responseChars=${(data.choices?.[0]?.message?.content ?? "").length}`);
        return {
          text: data.choices?.[0]?.message?.content ?? "",
          usage: usageFromHuggingFace(data.usage),
        };
      }
      const retryable = TRANSIENT_HF_HTTP.has(r.status) && attempt < hfMaxRetries;
      hfLog.warn(
        `structureChat HTTP ${r.status} attempt ${attempt + 1}/${hfMaxRetries + 1} body=${briefHttpFailureBody(lastRaw)}`
      );
      if (!retryable) {
        throw new Error(`HuggingFace HTTP ${r.status}: ${briefHttpFailureBody(lastRaw, 600)}`);
      }
      const delay = hfRetryBaseMs * 2 ** attempt + Math.floor(Math.random() * 500);
      hfLog.warn(`structureChat retrying in ${delay}ms…`);
      await sleep(delay);
    }
    throw new Error(`HuggingFace HTTP ${lastStatus}: ${briefHttpFailureBody(lastRaw, 600)}`);
  }

  return { visionChat, structureChat };
}

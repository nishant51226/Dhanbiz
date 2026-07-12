import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ChatMessage } from "../../ollama.js";
import type { AiChatResult, ExtractPipelineDeps } from "../types.js";

const openaiLog = new Logger("OpenAiProvider");

type OpenAiChatResponse = {
  choices?: { message?: { content?: string } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

function usageFromOpenAi(u: OpenAiChatResponse["usage"]): AiChatResult["usage"] {
  if (!u || typeof u !== "object") return null;
  return {
    inputTokens: u.prompt_tokens ?? null,
    outputTokens: u.completion_tokens ?? null,
    totalTokens: u.total_tokens ?? null,
    metadata: u as unknown as Record<string, unknown>,
  };
}

export function createOpenAiDeps(config: ConfigService): ExtractPipelineDeps {
  const apiKey = config.get<string>("OPENAI_API_KEY")?.trim() ?? "";
  const base = (config.get<string>("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(
    /\/$/,
    ""
  );
  const defaultTimeout =
    Number(config.get("OLLAMA_FETCH_TIMEOUT_MS")) || 15 * 60 * 1000;

  async function visionChat(
    model: string,
    prompt: string,
    imageBytes: Buffer,
    mimeType?: string
  ): Promise<AiChatResult> {
    const url = `${base}/chat/completions`;
    const b64 = imageBytes.toString("base64");
    const mime =
      mimeType && mimeType.startsWith("image/") ? mimeType : "image/png";
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
    openaiLog.log(
      `visionChat POST ${url} model=${model} imageBytes=${imageBytes.length} promptChars=${prompt.length}`
    );
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(defaultTimeout),
    });
    const raw = await r.text();
    if (!r.ok) {
      openaiLog.warn(`visionChat HTTP ${r.status}: ${raw.slice(0, 400)}`);
      throw new Error(`OpenAI HTTP ${r.status}: ${raw.slice(0, 2000)}`);
    }
    const data = JSON.parse(raw) as OpenAiChatResponse;
    openaiLog.log(`visionChat OK model=${model}`);
    return {
      text: data.choices?.[0]?.message?.content ?? "",
      usage: usageFromOpenAi(data.usage),
    };
  }

  async function structureChat(
    model: string,
    messages: ChatMessage[],
    timeoutMs: number
  ): Promise<AiChatResult> {
    const url = `${base}/chat/completions`;
    const openaiMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const body = {
      model,
      messages: openaiMessages,
      response_format: { type: "json_object" as const },
    };
    openaiLog.log(`structureChat POST ${url} model=${model} messages=${openaiMessages.length}`);
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const raw = await r.text();
    if (!r.ok) {
      openaiLog.warn(`structureChat HTTP ${r.status}: ${raw.slice(0, 400)}`);
      throw new Error(`OpenAI HTTP ${r.status}: ${raw.slice(0, 2000)}`);
    }
    const data = JSON.parse(raw) as OpenAiChatResponse;
    openaiLog.log(`structureChat OK model=${model}`);
    return {
      text: data.choices?.[0]?.message?.content ?? "",
      usage: usageFromOpenAi(data.usage),
    };
  }

  return { visionChat, structureChat };
}

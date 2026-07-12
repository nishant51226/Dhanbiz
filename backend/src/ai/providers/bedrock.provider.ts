import { Logger } from "@nestjs/common";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { ConfigService } from "@nestjs/config";
import type { ChatMessage } from "../../ollama.js";
import type { AiChatResult, ExtractPipelineDeps } from "../types.js";

const bedrockLog = new Logger("BedrockProvider");

function bedrockImageFormat(
  mimeType?: string
): "png" | "jpeg" | "gif" | "webp" {
  const m = mimeType?.toLowerCase() ?? "";
  if (m === "image/jpeg" || m === "image/jpg") return "jpeg";
  if (m === "image/gif") return "gif";
  if (m === "image/webp") return "webp";
  return "png";
}

function usageFromBedrock(u: unknown): AiChatResult["usage"] {
  if (!u || typeof u !== "object") return null;
  const o = u as Record<string, unknown>;
  const input = o.inputTokens ?? o.input_tokens;
  const output = o.outputTokens ?? o.output_tokens;
  const total = o.totalTokens ?? o.total_tokens;
  const inputTokens =
    typeof input === "number" && Number.isFinite(input) ? Math.floor(input) : null;
  const outputTokens =
    typeof output === "number" && Number.isFinite(output) ? Math.floor(output) : null;
  const totalTokens =
    typeof total === "number" && Number.isFinite(total) ? Math.floor(total) : null;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    metadata: o as Record<string, unknown>,
  };
}

function textFromBedrock(out: unknown): string {
  if (!out || typeof out !== "object") return "";
  const rec = out as Record<string, unknown>;
  const output = rec.output;
  if (!output || typeof output !== "object") return "";
  const message = (output as Record<string, unknown>).message;
  if (!message || typeof message !== "object") return "";
  const content = (message as Record<string, unknown>).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b: unknown) => {
      if (!b || typeof b !== "object") return "";
      const text = (b as Record<string, unknown>).text;
      return typeof text === "string" ? text : "";
    })
    .join("");
}

function usageFromBedrockOutput(out: unknown): AiChatResult["usage"] {
  if (!out || typeof out !== "object") return null;
  return usageFromBedrock((out as Record<string, unknown>).usage);
}

export function createBedrockDeps(config: ConfigService): ExtractPipelineDeps {
  const region =
    config.get<string>("AWS_REGION")?.trim() ||
    config.get<string>("AWS_DEFAULT_REGION")?.trim() ||
    config.get<string>("BEDROCK_REGION")?.trim() ||
    config.get<string>("BEDROCK_AWS_REGION")?.trim() ||
    "";
  const accessKeyId = config.get<string>("BEDROCK_AWS_ACCESS_KEY_ID")?.trim();
  const secretAccessKey = config.get<string>("BEDROCK_AWS_SECRET_ACCESS_KEY")?.trim();
  const sessionToken = config.get<string>("BEDROCK_AWS_SESSION_TOKEN")?.trim();
  const clientConfig = {
    region: region || undefined,
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey, sessionToken } } : {}),
  };
  const client = new BedrockRuntimeClient(clientConfig);

  const defaultTimeout = Number(config.get("OLLAMA_FETCH_TIMEOUT_MS")) || 15 * 60 * 1000;
  const visionTimeoutMs = (): number => {
    const v = Number(config.get("BEDROCK_VISION_REQUEST_TIMEOUT_MS") ?? process.env.BEDROCK_VISION_REQUEST_TIMEOUT_MS);
    if (Number.isFinite(v) && v > 0) return Math.floor(v);
    // Large PDF pages (1MB+ PNG) on qwen3-vl can exceed 5 min; default to full pipeline timeout.
    return defaultTimeout;
  };

  async function visionChat(
    model: string,
    prompt: string,
    imageBytes: Buffer,
    mimeType?: string
  ): Promise<AiChatResult> {
    bedrockLog.log(
      `visionChat region=${region || "(default)"} modelId=${model} imageBytes=${imageBytes.length} promptChars=${prompt.length}`,
    );
    const fmt = bedrockImageFormat(mimeType);
    const cmd = new ConverseCommand({
      modelId: model,
      messages: [
        {
          role: "user",
          content: [
            {
              image: {
                format: fmt,
                source: { bytes: new Uint8Array(imageBytes) },
              },
            },
            { text: prompt },
          ],
        },
      ],
    });
    const out: unknown = await client.send(cmd, {
      requestTimeout: visionTimeoutMs(),
    });
    const text = textFromBedrock(out);
    bedrockLog.log(`visionChat OK modelId=${model} responseChars=${text.length}`);
    return { text, usage: usageFromBedrockOutput(out) };
  }

  async function structureChat(
    model: string,
    messages: ChatMessage[],
    timeoutMs: number
  ): Promise<AiChatResult> {
    bedrockLog.log(
      `structureChat region=${region || "(default)"} modelId=${model} messages=${messages.length}`,
    );
    const systemParts: string[] = [];
    const conv: { role: "user" | "assistant"; content: { text: string }[] }[] = [];
    for (const m of messages) {
      if (m.role === "system") {
        systemParts.push(m.content);
      } else if (m.role === "user") {
        conv.push({ role: "user", content: [{ text: m.content }] });
      } else {
        conv.push({ role: "assistant", content: [{ text: m.content }] });
      }
    }
    const cmd = new ConverseCommand({
      modelId: model,
      ...(systemParts.length ? { system: [{ text: systemParts.join("\n\n") }] } : {}),
      messages: conv,
    });
    const out: unknown = await client.send(cmd, {
      requestTimeout: timeoutMs,
    });
    const text = textFromBedrock(out);
    bedrockLog.log(`structureChat OK modelId=${model} responseChars=${text.length}`);
    return { text, usage: usageFromBedrockOutput(out) };
  }

  return { visionChat, structureChat };
}

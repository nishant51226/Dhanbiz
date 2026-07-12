import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const ollamaProvLog = new Logger("OllamaProvider");
import {
  ollamaChat,
  OLLAMA_DEFAULT_FETCH_TIMEOUT_MS,
  structureOllamaChatExtra,
} from "../../ollama.js";
import type { AiChatResult, ExtractPipelineDeps } from "../types.js";

function ollamaUsage(r: { promptEvalCount?: number; evalCount?: number }): AiChatResult["usage"] {
  const input = r.promptEvalCount;
  const output = r.evalCount;
  if (input == null && output == null) return null;
  const inputTokens = input != null ? input : null;
  const outputTokens = output != null ? output : null;
  const totalTokens =
    inputTokens != null || outputTokens != null
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : null;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    metadata: {
      prompt_eval_count: input,
      eval_count: output,
    },
  };
}

export function createOllamaDeps(config: ConfigService): ExtractPipelineDeps {
  const base = config.get<string>("OLLAMA_HOST") ?? "http://127.0.0.1:11434";
  const visionTimeout =
    Number(config.get("OLLAMA_FETCH_TIMEOUT_MS")) || OLLAMA_DEFAULT_FETCH_TIMEOUT_MS;
  return {
    visionChat: async (model, prompt, imageBytes) => {
      ollamaProvLog.log(`visionChat host=${base} model=${model} imageBytes=${imageBytes.length}`);
      const b64 = imageBytes.toString("base64");
      const r = await ollamaChat(
        base,
        model,
        [{ role: "user", content: prompt, images: [b64] }],
        visionTimeout
      );
      ollamaProvLog.log(`visionChat OK model=${model} responseChars=${r.text.length}`);
      return { text: r.text, usage: ollamaUsage(r) };
    },
    structureChat: async (model, messages, timeoutMs) => {
      ollamaProvLog.log(`structureChat host=${base} model=${model} messages=${messages.length}`);
      const r = await ollamaChat(base, model, messages, timeoutMs, structureOllamaChatExtra());
      ollamaProvLog.log(`structureChat OK model=${model} responseChars=${r.text.length}`);
      return { text: r.text, usage: ollamaUsage(r) };
    },
  };
}

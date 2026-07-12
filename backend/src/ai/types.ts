import type { ChatMessage } from "../ollama.js";

export type AiProviderId = "ollama" | "openai" | "bedrock" | "huggingface";

export type AiCallUsage = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type AiChatResult = {
  text: string;
  usage?: AiCallUsage | null;
};

export type ExtractPipelineDeps = {
  /** `mimeType` e.g. image/png, image/jpeg — used by OpenAI/Bedrock data URLs / format. */
  visionChat: (
    model: string,
    prompt: string,
    imageBytes: Buffer,
    mimeType?: string
  ) => Promise<AiChatResult>;
  structureChat: (model: string, messages: ChatMessage[], timeoutMs: number) => Promise<AiChatResult>;
};

export type ProviderConfigEntry = {
  id: AiProviderId;
  visionModelDefault: string;
  structureModelDefault: string;
};

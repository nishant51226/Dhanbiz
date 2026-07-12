import { ConfigService } from "@nestjs/config";
import type { AiProviderId, ExtractPipelineDeps, ProviderConfigEntry } from "../types.js";
import { createBedrockDeps } from "./bedrock.provider.js";
import { createHuggingFaceDeps } from "./huggingface.provider.js";
import { createOllamaDeps } from "./ollama.provider.js";
import { createOpenAiDeps } from "./openai.provider.js";

function normalizeDefault(raw: string | undefined): AiProviderId {
  const v = raw?.trim().toLowerCase();
  if (v === "openai" || v === "bedrock" || v === "ollama" || v === "huggingface") return v;
  return "ollama";
}

export function isProviderEnabled(config: ConfigService, p: AiProviderId): boolean {
  if (p === "ollama") {
    return true;
  }
  if (p === "openai") {
    return Boolean(config.get<string>("OPENAI_API_KEY")?.trim());
  }
  if (p === "bedrock") {
    const region =
      config.get<string>("AWS_REGION")?.trim() ||
      config.get<string>("AWS_DEFAULT_REGION")?.trim() ||
      config.get<string>("BEDROCK_REGION")?.trim() ||
      config.get<string>("BEDROCK_AWS_REGION")?.trim();
    const vm = config.get<string>("BEDROCK_VISION_MODEL")?.trim();
    const sm = config.get<string>("BEDROCK_STRUCTURE_MODEL")?.trim();
    return Boolean(region && vm && sm);
  }
  if (p === "huggingface") {
    return Boolean(config.get<string>("HUGGINGFACE_API_KEY")?.trim());
  }
  return false;
}

/**
 * When the configured default is not usable, pick the next enabled provider.
 * Ollama is last so incomplete Bedrock config does not silently prefer local Ollama over cloud providers.
 */
function pickFirstEnabled(config: ConfigService): AiProviderId {
  const order: AiProviderId[] = ["bedrock", "openai", "huggingface", "ollama"];
  for (const p of order) {
    if (isProviderEnabled(config, p)) return p;
  }
  return "ollama";
}

function describeWhyProviderDisabled(config: ConfigService, p: AiProviderId): string {
  if (p === "bedrock") {
    const region =
      config.get<string>("AWS_REGION")?.trim() ||
      config.get<string>("AWS_DEFAULT_REGION")?.trim() ||
      config.get<string>("BEDROCK_REGION")?.trim() ||
      config.get<string>("BEDROCK_AWS_REGION")?.trim();
    const vm = config.get<string>("BEDROCK_VISION_MODEL")?.trim();
    const sm = config.get<string>("BEDROCK_STRUCTURE_MODEL")?.trim();
    const missing: string[] = [];
    if (!region) {
      missing.push("AWS_REGION, AWS_DEFAULT_REGION, BEDROCK_REGION, or BEDROCK_AWS_REGION");
    }
    if (!vm) missing.push("BEDROCK_VISION_MODEL");
    if (!sm) missing.push("BEDROCK_STRUCTURE_MODEL");
    return missing.length ? `missing ${missing.join("; ")}` : "not configured";
  }
  if (p === "openai") return "OPENAI_API_KEY not set";
  if (p === "huggingface") return "HUGGINGFACE_API_KEY not set";
  return "not enabled";
}

function pickDefaultOrFirstEnabled(config: ConfigService): AiProviderId {
  const want = normalizeDefault(config.get<string>("AI_PROVIDER_DEFAULT"));
  if (isProviderEnabled(config, want)) return want;
  const picked = pickFirstEnabled(config);
  if (picked !== want) {
    // eslint-disable-next-line no-console
    console.warn(
      `[docp] AI_PROVIDER_DEFAULT=${want} is not usable (${describeWhyProviderDisabled(config, want)}); using ${picked} instead.`,
    );
  }
  return picked;
}

/**
 * Job `ai_provider` null/invalid uses server default; invalid stored values fall back safely.
 * Rows with `ollama` were often created when Ollama was the implicit default — if the server default is now
 * `bedrock` and Bedrock is configured, use Bedrock so extraction matches `AI_PROVIDER_DEFAULT`.
 */
export function resolveEffectiveProvider(
  jobAiProvider: string | null | undefined,
  config: ConfigService
): AiProviderId {
  const defaultWant = normalizeDefault(config.get<string>("AI_PROVIDER_DEFAULT"));
  let raw = jobAiProvider?.trim().toLowerCase();
  if (
    raw === "ollama" &&
    defaultWant === "bedrock" &&
    isProviderEnabled(config, "bedrock")
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      "[docp] Job ai_provider=ollama ignored: AI_PROVIDER_DEFAULT=bedrock and Bedrock is configured. Clear jobs.ai_provider to silence this.",
    );
    raw = undefined;
  }
  if (raw === "ollama" || raw === "openai" || raw === "bedrock" || raw === "huggingface") {
    if (!isProviderEnabled(config, raw)) {
      return pickFirstEnabled(config);
    }
    return raw;
  }
  return pickDefaultOrFirstEnabled(config);
}

export function defaultVisionModel(config: ConfigService, p: AiProviderId): string {
  if (p === "ollama") {
    return config.get<string>("OLLAMA_VISION_MODEL") ?? "qwen2.5vl:3b";
  }
  if (p === "openai") {
    return config.get<string>("OPENAI_VISION_MODEL") ?? "gpt-4o";
  }
  if (p === "huggingface") {
    return config.get<string>("HUGGINGFACE_VISION_MODEL") ?? "Qwen/Qwen2.5-VL-7B-Instruct";
  }
  return config.get<string>("BEDROCK_VISION_MODEL") ?? "";
}

export function defaultStructureModel(config: ConfigService, p: AiProviderId): string {
  if (p === "ollama") {
    return config.get<string>("OLLAMA_STRUCTURE_MODEL") ?? "qwen2.5:3b";
  }
  if (p === "openai") {
    return config.get<string>("OPENAI_STRUCTURE_MODEL") ?? "gpt-4o-mini";
  }
  if (p === "huggingface") {
    return (
      config.get<string>("HUGGINGFACE_STRUCTURE_MODEL") ??
      "meta-llama/Llama-3.1-8B-Instruct"
    );
  }
  return config.get<string>("BEDROCK_STRUCTURE_MODEL") ?? "";
}

export function createDepsForProvider(
  config: ConfigService,
  provider: AiProviderId
): ExtractPipelineDeps {
  switch (provider) {
    case "ollama":
      return createOllamaDeps(config);
    case "openai":
      return createOpenAiDeps(config);
    case "bedrock":
      return createBedrockDeps(config);
    case "huggingface":
      return createHuggingFaceDeps(config);
  }
}

export function listEnabledProviders(config: ConfigService): ProviderConfigEntry[] {
  const out: ProviderConfigEntry[] = [];
  const order: AiProviderId[] = ["ollama", "openai", "bedrock", "huggingface"];
  for (const id of order) {
    if (!isProviderEnabled(config, id)) continue;
    out.push({
      id,
      visionModelDefault: defaultVisionModel(config, id),
      structureModelDefault: defaultStructureModel(config, id),
    });
  }
  return out;
}

export function defaultProviderForConfig(config: ConfigService): AiProviderId {
  return pickDefaultOrFirstEnabled(config);
}

/** Parses request body / query; invalid values return `null`. */
export function parseAiProviderId(raw: string | undefined): AiProviderId | null {
  const v = raw?.trim().toLowerCase();
  if (v === "ollama" || v === "openai" || v === "bedrock" || v === "huggingface") return v;
  return null;
}

export type EffectiveAiModelConfig = {
  provider: AiProviderId;
  visionModel: string;
  structureModel: string;
  providerFromJob: boolean;
  visionFromJob: boolean;
  structureFromJob: boolean;
};

/** Resolved provider + vision/structure models (job overrides, else env defaults for that provider). */
export function resolveEffectiveModels(
  config: ConfigService,
  opts?: {
    aiProvider?: string | null;
    visionModel?: string | null;
    structureModel?: string | null;
  },
): EffectiveAiModelConfig {
  const provider = resolveEffectiveProvider(opts?.aiProvider ?? null, config);
  const visionFromJob = Boolean(opts?.visionModel?.trim());
  const structureFromJob = Boolean(opts?.structureModel?.trim());
  const rawProvider = opts?.aiProvider?.trim().toLowerCase();
  const providerFromJob = Boolean(
    rawProvider === "ollama" ||
      rawProvider === "openai" ||
      rawProvider === "bedrock" ||
      rawProvider === "huggingface",
  );
  return {
    provider,
    visionModel: visionFromJob ? opts!.visionModel!.trim() : defaultVisionModel(config, provider),
    structureModel: structureFromJob
      ? opts!.structureModel!.trim()
      : defaultStructureModel(config, provider),
    providerFromJob,
    visionFromJob,
    structureFromJob,
  };
}

function modelSource(fromJob: boolean): "job" | "env-default" {
  return fromJob ? "job" : "env-default";
}

/** Single-line summary for Nest logs / diagnostics. */
export function formatEffectiveAiModelsLog(cfg: EffectiveAiModelConfig): string {
  return (
    `provider=${cfg.provider}(${modelSource(cfg.providerFromJob)}) ` +
    `vision=${cfg.visionModel}(${modelSource(cfg.visionFromJob)}) ` +
    `structure=${cfg.structureModel}(${modelSource(cfg.structureFromJob)})`
  );
}

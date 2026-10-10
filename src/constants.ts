import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { thinkingLevelMapFor } from "./utils.ts";

export const AMPERSAND_BASE_URL = "https://api.aiand.com/v1";

/**
 * ai& is an OpenAI-compatible multi-vendor gateway: model-specific reasoning
 * parameters arrive through the standard `reasoning_effort` field ("openai"
 * format), while the per-model accepted efforts come from the live catalog.
 */
export const AMPERSAND_COMPAT = {
  supportsDeveloperRole: false,
  supportsUsageInStreaming: true,
  maxTokensField: "max_completion_tokens",
  thinkingFormat: "openai",
} as const;

interface AmpersandFallbackModel {
  readonly id: string;
  readonly name: string;
  readonly input: ProviderModelConfig["input"];
  readonly reasoning: boolean;
  readonly contextWindow: number;
  readonly maxTokens: number;
  /** Accepted `reasoning_effort` values, empty when the model has no reasoning control. */
  readonly efforts: readonly string[];
  readonly cost: ProviderModelConfig["cost"];
}

/**
 * Current ai& hosted models (`GET /v1/models`), priced in USD per million
 * tokens and available before the authenticated refresh.
 */
type ChatModelConfig = Extract<ProviderModelConfig, { type?: "chat" }>;

const FALLBACK_CATALOG: readonly AmpersandFallbackModel[] = [
  {
    id: "deepseek-ai/deepseek-v4.1-flash",
    name: "DeepSeek V4.1 Flash",
    input: ["text", "image"],
    reasoning: true,
    contextWindow: 1_048_576,
    maxTokens: 384_000,
    efforts: ["none", "high", "max"],
    cost: { input: 0.3, output: 0.6, cacheRead: 0.02, cacheWrite: 0 },
  },
  {
    id: "zai-org/glm-5.3",
    name: "GLM 5.3",
    input: ["text"],
    reasoning: true,
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    efforts: ["low", "high", "max"],
    cost: { input: 1, output: 4, cacheRead: 0.3, cacheWrite: 0 },
  },
  {
    id: "zai-org/glm-5.3-flash",
    name: "GLM 5.3 Flash",
    input: ["text", "image"],
    reasoning: true,
    contextWindow: 1_048_550,
    maxTokens: 131_072,
    efforts: ["low", "high", "max"],
    cost: { input: 0.15, output: 0.5, cacheRead: 0.03, cacheWrite: 0 },
  },
  {
    id: "qwen/qwen3.8-27b",
    name: "Qwen 3.8 27B",
    input: ["text", "image"],
    reasoning: true,
    contextWindow: 262_144,
    maxTokens: 32_768,
    efforts: ["none", "low", "medium", "xhigh"],
    cost: { input: 0.4, output: 3, cacheRead: 0.2, cacheWrite: 0 },
  },
  {
    id: "moonshotai/kimi-k3",
    name: "Kimi K3",
    input: ["text", "image"],
    reasoning: true,
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    efforts: ["low", "high", "max"],
    cost: { input: 3, output: 12.5, cacheRead: 0.5, cacheWrite: 0 },
  },
  {
    id: "zai-org/glm-5.2",
    name: "GLM 5.2",
    input: ["text"],
    reasoning: true,
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    efforts: ["none", "high", "max"],
    cost: { input: 1, output: 4, cacheRead: 0.3, cacheWrite: 0 },
  },
  {
    id: "google/gemma-4-31b-it",
    name: "Gemma 4 31B IT",
    input: ["text", "image"],
    reasoning: true,
    contextWindow: 262_144,
    maxTokens: 32_768,
    efforts: ["none", "high"],
    cost: { input: 0.2, output: 0.5, cacheRead: 0.05, cacheWrite: 0 },
  },
  {
    id: "moonshotai/kimi-k2.7-code",
    name: "Kimi K2.7 Code",
    input: ["text", "image"],
    reasoning: true,
    contextWindow: 262_144,
    maxTokens: 262_144,
    efforts: ["high"],
    cost: { input: 0.75, output: 3.5, cacheRead: 0.2, cacheWrite: 0 },
  },
  {
    id: "motif-technologies/motif-3",
    name: "Motif 3",
    input: ["text"],
    reasoning: true,
    contextWindow: 262_144,
    maxTokens: 262_144,
    efforts: ["none", "high"],
    cost: { input: 0.5, output: 2, cacheRead: 0.2, cacheWrite: 0 },
  },
  {
    id: "deepseek-ai/deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    input: ["text"],
    reasoning: true,
    contextWindow: 1_048_576,
    maxTokens: 384_000,
    efforts: ["none", "high", "max"],
    cost: { input: 0.15, output: 0.25, cacheRead: 0.08, cacheWrite: 0 },
  },
  {
    id: "qwen/qwen3.6-27b",
    name: "Qwen 3.6 27B",
    input: ["text", "image"],
    reasoning: true,
    contextWindow: 262_144,
    maxTokens: 65_536,
    efforts: ["none", "high"],
    cost: { input: 0.32, output: 3.2, cacheRead: 0.2, cacheWrite: 0 },
  },
  {
    id: "deepseek-ai/deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    input: ["text"],
    reasoning: true,
    contextWindow: 1_048_576,
    maxTokens: 384_000,
    efforts: ["none", "high", "max"],
    cost: { input: 1, output: 2.5, cacheRead: 0.25, cacheWrite: 0 },
  },
  {
    id: "openai/gpt-oss-120b",
    name: "GPT OSS 120B",
    input: ["text"],
    reasoning: true,
    contextWindow: 131_072,
    maxTokens: 32_768,
    efforts: ["low", "medium", "high"],
    cost: { input: 0.15, output: 0.6, cacheRead: 0.08, cacheWrite: 0 },
  },
];

/** Fallback model metadata mirrors the live ai& catalog shape. */
export const FALLBACK_MODELS: ChatModelConfig[] = FALLBACK_CATALOG.map((model) => ({
  id: model.id,
  name: model.name,
  reasoning: model.reasoning,
  input: [...model.input],
  cost: { ...model.cost },
  contextWindow: model.contextWindow,
  maxTokens: model.maxTokens,
  thinkingLevelMap: model.efforts.length ? thinkingLevelMapFor(model.efforts) : undefined,
  compat: AMPERSAND_COMPAT,
}));

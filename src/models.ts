import type { ProviderConfig, ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { AMPERSAND_BASE_URL, AMPERSAND_COMPAT, FALLBACK_MODELS } from "./constants.ts";
import type { AmpersandApiModel, AmpersandModelsResponse } from "./types.ts";
import {
  displayName,
  isAmpersandEffort,
  nonNegativeNumber,
  positiveNumber,
  strings,
  thinkingLevelMapFor,
} from "./utils.ts";

type ChatModelConfig = Extract<ProviderModelConfig, { type?: "chat" }>;

/** Convert the ai& /models response into pi's model metadata. */
export function parseModelsResponse(payload: AmpersandModelsResponse): ChatModelConfig[] {
  if (!Array.isArray(payload.data)) return [];

  const known = new Map<string, ChatModelConfig>(
    FALLBACK_MODELS.map((item) => [item.id, item] as const),
  );
  return payload.data.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as AmpersandApiModel;
    if (typeof item.id !== "string" || item.id.length === 0) return [];

    const fallback = known.get(item.id);
    const capabilities = strings(item.capabilities);
    const modalities = strings(item.input_modalities);
    const reasoning = capabilities.includes("reasoning")
      || (fallback?.reasoning ?? false);
    const imageInput = modalities.includes("image") || capabilities.includes("vision")
      || (fallback?.input.includes("image") ?? false);
    const efforts = strings(item.reasoning_efforts).filter(isAmpersandEffort);

    return [{
      id: item.id,
      name: typeof item.name === "string" && item.name ? cleanModelName(item.name, item.id) : (fallback?.name ?? displayName(item.id)),
      reasoning,
      input: imageInput ? ["text", "image"] : ["text"],
      cost: {
        input: nonNegativeNumber(item.input_per_1m, fallback?.cost.input ?? 0),
        output: nonNegativeNumber(item.output_per_1m, fallback?.cost.output ?? 0),
        cacheRead: nonNegativeNumber(item.cached_input_per_1m, fallback?.cost.cacheRead ?? 0),
        cacheWrite: fallback?.cost.cacheWrite ?? 0,
      },
      contextWindow: positiveNumber(item.context_window, fallback?.contextWindow ?? 262_144),
      maxTokens: positiveNumber(item.max_output_tokens, fallback?.maxTokens ?? 131_072),
      thinkingLevelMap: reasoning
        ? (efforts.length ? thinkingLevelMapFor(efforts) : fallback?.thinkingLevelMap)
        : undefined,
      compat: AMPERSAND_COMPAT,
    } satisfies ChatModelConfig];
  });
}

/** The catalog nominates models like "deepseek-ai/DeepSeek-V4.1-Flash"; prefer the canonical display names. */
function cleanModelName(name: string, id: string): string {
  const known = FALLBACK_MODELS.find((model) => model.id === id);
  if (known) return known.name;
  const withoutVendor = name.includes("/") ? name.slice(name.indexOf("/") + 1) : name;
  return withoutVendor.split(/[-_.]/).join(" ");
}

export async function fetchModels(apiKey: string, signal?: AbortSignal): Promise<ChatModelConfig[]> {
  const timeout = AbortSignal.timeout(10_000);
  const response = await fetch(`${AMPERSAND_BASE_URL}/models`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) throw new Error(`ai& /models returned HTTP ${response.status}`);

  const models = parseModelsResponse(await response.json() as AmpersandModelsResponse);
  if (!models.length) throw new Error("ai& /models returned no models");
  return models;
}

export const refreshModels: NonNullable<ProviderConfig["refreshModels"]> = async (context) => {
  const persisted = context.stored?.models;
  const cached = persisted?.length ? [...persisted] as ChatModelConfig[] : FALLBACK_MODELS;
  const apiKey = context.credential?.type === "api_key" ? context.credential.key : undefined;
  if (!context.allowNetwork || context.signal?.aborted || !apiKey) return cached;

  try {
    const models = await fetchModels(apiKey, context.signal);
    await context.publish({ persist: { models: models as never, checkedAt: Date.now() } });
    return models;
  } catch {
    // Keep the last successful account-specific catalog through transient failures.
    return cached;
  }
};

import type { ProviderConfig, ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { AMPERSAND_BASE_URL, AMPERSAND_COMPAT, FALLBACK_DEFAULT_EFFORTS, FALLBACK_MODELS } from "./constants.ts";
import type { AmpersandApiModel, AmpersandModelsResponse } from "./types.ts";
import {
  canonicalModelId,
  displayName,
  isAmpersandEffort,
  isChatModelId,
  nonNegativeNumber,
  positiveNumber,
  strings,
  thinkingLevelMapFor,
} from "./utils.ts";

type ChatModelConfig = Extract<ProviderModelConfig, { type?: "chat" }>;

/** Transient upstream failures worth one more catalog fetch. */
const TRANSIENT_STATUS_CODES = new Set([429, 502, 503, 504]);

/** Backoff mirrors the sister copilot-chat bridge: cap 2s, Retry-After capped at 5s. */
export function retryDelayMs(attempt: number, retryAfter?: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(5_000, seconds * 1_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, Math.min(5_000, date - Date.now()));
  }
  return Math.min(2_000, 250 * 2 ** Math.max(0, attempt));
}

function networkCause(error: Error): string {
  const cause = (error as Error & { cause?: unknown }).cause;
  return cause instanceof Error ? `${cause.name}: ${cause.message} ${networkCause(cause)}` : "";
}

export function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error) || error.name === "AbortError") return false;
  return /fetch failed|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET|socket hang up/i
    .test(`${error.name}: ${error.message} ${networkCause(error)}`);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

/** At most three attempts; transient statuses and network errors are retried. */
export async function fetchWithRetry(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      if (attempt >= 2 || !isTransientNetworkError(error)) throw error;
      await sleep(retryDelayMs(attempt), signal);
      continue;
    }
    if (attempt >= 2 || !TRANSIENT_STATUS_CODES.has(response.status)) return response;
    await sleep(retryDelayMs(attempt, response.headers.get("retry-after")), signal);
  }
}

function firstPositiveNumber(values: readonly unknown[], fallback: number): number {
  for (const value of values) {
    const parsed = positiveNumber(value, 0);
    if (parsed > 0) return parsed;
  }
  return fallback;
}

function recordObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/**
 * Per-1M pricing: the nested `pricing` object wins per field, then the flat
 * `input_per_1m`-style decimal strings, then the bundled fallback.
 */
function parseCost(raw: AmpersandApiModel, fallbackCost: ChatModelConfig["cost"]): ChatModelConfig["cost"] {
  const pricing = recordObject(raw.pricing);
  const input = nonNegativeNumber(
    pricing?.prompt ?? pricing?.input_per_1m ?? pricing?.input ?? raw.input_per_1m,
    fallbackCost.input,
  );
  const output = nonNegativeNumber(
    pricing?.completion ?? pricing?.output_per_1m ?? pricing?.output ?? raw.output_per_1m,
    fallbackCost.output,
  );
  const cacheRead = nonNegativeNumber(
    pricing?.cache_prompt ?? raw.cached_input_per_1m,
    fallbackCost.cacheRead,
  );
  return { input, output, cacheRead, cacheWrite: 0 };
}

/** Models advertising image input by display name or id segment when no modality data exists. */
const VISION_NAME_PATTERN = /(?:vision|\bvl\b)/i;
const VISION_ID_PATTERN = /(?:^|[-/])vision(?:[-/.]|$)/;

/** Convert the ai& /models response into pi's model metadata. */
export function parseModelsResponse(payload: AmpersandModelsResponse): ChatModelConfig[] {
  if (!Array.isArray(payload.data)) return [];

  const known = new Map<string, ChatModelConfig>(
    FALLBACK_MODELS.map((item) => [item.id, item] as const),
  );
  return payload.data.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const item = raw as AmpersandApiModel;
    if (typeof item.id !== "string" || item.id.trim().length === 0) return [];
    // Embedders, rerankers, and other non-chat listings are not selectable.
    if (!isChatModelId(item.id)) return [];
    const id = canonicalModelId(item.id);

    const fallback = known.get(id);
    const capabilities = strings(item.capabilities);
    const modalities = strings(item.input_modalities);
    const architecture = recordObject(item.architecture);
    const archModalities = strings(architecture?.input_modalities);
    const reasoning = item.reasoning_effort === true
      || item.custom_reasoning === true
      || capabilities.includes("reasoning")
      || (fallback?.reasoning ?? false);
    // Explicit capability/modality data is authoritative; the vision name
    // heuristics apply only when the catalog reports no modality data.
    const imageInput = capabilities.length
      ? capabilities.includes("vision")
      : modalities.length || archModalities.length
        ? modalities.includes("image") || archModalities.includes("image")
        : (fallback?.input.includes("image") ?? false)
          || VISION_NAME_PATTERN.test(typeof item.name === "string" ? item.name : "")
          || VISION_ID_PATTERN.test(id);
    const efforts = strings(item.reasoning_efforts).filter(isAmpersandEffort);

    // Default effort: live nomination, then bundled per-model default, then last listed.
    const liveDefault = isAmpersandEffort(item.reasoning_effort_default)
      ? item.reasoning_effort_default
      : undefined;
    const defaultEffort = liveDefault && efforts.includes(liveDefault)
      ? liveDefault
      : FALLBACK_DEFAULT_EFFORTS[id] !== undefined && efforts.includes(FALLBACK_DEFAULT_EFFORTS[id])
        ? FALLBACK_DEFAULT_EFFORTS[id]
        : efforts.at(-1);

    return [{
      id,
      name: typeof item.name === "string" && item.name ? cleanModelName(item.name, id) : (fallback?.name ?? displayName(id)),
      reasoning,
      input: imageInput ? ["text", "image"] : ["text"],
      cost: parseCost(item, fallback?.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }),
      contextWindow: firstPositiveNumber(
        [item.context_window, item.context_length, item.max_context_tokens, item.max_model_len],
        fallback?.contextWindow ?? 262_144,
      ),
      maxTokens: firstPositiveNumber(
        [item.max_completion_tokens, item.max_output_tokens],
        fallback?.maxTokens ?? 131_072,
      ),
      thinkingLevelMap: reasoning
        ? (efforts.length ? thinkingLevelMapFor(efforts, defaultEffort) : fallback?.thinkingLevelMap)
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
  const response = await fetchWithRetry(
    `${AMPERSAND_BASE_URL}/models`,
    {
      headers: {
        Accept: "application/json, application/problem+json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    },
    signal,
  );
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

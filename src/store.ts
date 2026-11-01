/**
 * Reads pi's persisted provider catalogs (`<agentDir>/models-store.json`).
 *
 * pi resolves the startup model (`defaultProvider` / `defaultModel`, or the
 * model a resumed session used) before its first cache-only catalog refresh
 * lands. A provider registered with only the bundled fallback therefore cannot
 * resolve a model that exists only in the live catalog, and pi silently falls
 * back to another provider's default. Registering the persisted catalog up
 * front closes that race; `refreshModels` stays authoritative afterwards.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";

export interface ReadPersistedModelsOptions {
  /**
   * Drop rows without a string `baseUrl`. Required only for providers that
   * register no provider-level `baseUrl`: pi throws during `registerProvider`
   * for such rows, which fails the whole extension load.
   */
  readonly requireBaseUrl: boolean;
}

type ChatModelConfig = Extract<ProviderModelConfig, { type?: "chat" }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The chat catalog pi persisted for `providerId`, or `[]` when there is
 * nothing usable (no store, unreadable or malformed store, no entry, or no
 * model list). Never throws: this runs inside the extension factory.
 */
export function readPersistedProviderModels(
  providerId: string,
  options: ReadPersistedModelsOptions,
): ChatModelConfig[] {
  try {
    const raw = readFileSync(join(getAgentDir(), "models-store.json"), "utf8");
    const store: unknown = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
    if (!isRecord(store)) return [];
    const entry = store[providerId];
    if (!isRecord(entry) || !Array.isArray(entry.models)) return [];
    return entry.models.filter((model): model is ChatModelConfig =>
      isRecord(model)
      && typeof model.id === "string"
      && model.id.trim().length > 0
      && (model.type === undefined || model.type === "chat")
      && (!options.requireBaseUrl || typeof model.baseUrl === "string"));
  } catch {
    return [];
  }
}

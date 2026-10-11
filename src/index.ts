import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fetchBalance, formatBalance } from "./balance.ts";
import { AMPERSAND_BASE_URL, FALLBACK_MODELS } from "./constants.ts";
import { refreshModels } from "./models.ts";

export default function ampersandProvider(pi: ExtensionAPI): void {
  pi.registerProvider("ampersand", {
    name: "ai&",
    baseUrl: AMPERSAND_BASE_URL,
    apiKey: "$AMPERSAND_API_KEY",
    api: "openai-completions",
    authHeader: true,
    models: FALLBACK_MODELS,
    refreshModels,
  });

  pi.registerCommand("ampersand-balance", {
    description: "Show your ai& credit balance and request allowance",
    handler: async (_args, ctx) => {
      try {
        const model = ctx.modelRegistry.getModelsOfType("chat", "ampersand")[0] ?? ctx.model;
        if (!model) throw new Error("No ai& model is available; install the ampersand provider models first");
        const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
        if (!auth.ok || !auth.apiKey) {
          throw new Error("No ai& API key configured; set AMPERSAND_API_KEY or store a credential in auth.json");
        }
        const balance = await fetchBalance(auth.apiKey, ctx.signal);
        ctx.ui.notify(`ai& balance: ${formatBalance(balance)}`, "info");
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
}

export { AMPERSAND_BASE_URL, FALLBACK_MODELS, AMPERSAND_COMPAT } from "./constants.ts";
export { fetchModels, parseModelsResponse, refreshModels, fetchWithRetry, retryDelayMs, isTransientNetworkError } from "./models.ts";
export { fetchBalance, parseBalance, formatBalance, AMPERSAND_BALANCE_URL } from "./balance.ts";
export type { AmpersandBalance } from "./balance.ts";
export { thinkingLevelMapFor, isAmpersandEffort, isChatModelId, canonicalModelId } from "./utils.ts";
export type { AmpersandEffort } from "./types.ts";

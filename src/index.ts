import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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
}

export { AMPERSAND_BASE_URL, FALLBACK_MODELS, AMPERSAND_COMPAT } from "./constants.ts";
export { fetchModels, parseModelsResponse, refreshModels } from "./models.ts";
export { thinkingLevelMapFor, isAmpersandEffort } from "./utils.ts";
export type { AmpersandEffort } from "./utils.ts";

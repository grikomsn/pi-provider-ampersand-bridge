import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, ProviderConfig } from "@earendil-works/pi-coding-agent";
import ampersandProvider, {
  AMPERSAND_BASE_URL,
  FALLBACK_MODELS,
  fetchModels,
  parseModelsResponse,
} from "../src/index.ts";

test("registers an authenticated OpenAI-compatible provider", () => {
  let registration: { name: string; config: ProviderConfig } | undefined;
  let command: { name: string; description?: string } | undefined;
  const pi = {
    registerProvider(name: string, config: ProviderConfig) {
      registration = { name, config };
    },
    registerCommand(name: string, options: { description?: string }) {
      command = { name, description: options.description };
    },
  } as unknown as ExtensionAPI;

  ampersandProvider(pi);
  assert.equal(registration?.name, "ampersand");
  assert.equal(registration?.config.name, "ai&");
  assert.equal(registration?.config.baseUrl, AMPERSAND_BASE_URL);
  assert.equal(registration?.config.apiKey, "$AMPERSAND_API_KEY");
  assert.equal(registration?.config.api, "openai-completions");
  assert.equal(registration?.config.authHeader, true);
  assert.equal(registration?.config.models?.length, 13);
  assert.equal(typeof registration?.config.refreshModels, "function");
  assert.equal(command?.name, "ampersand-balance");
  assert.equal(typeof command?.description, "string");
});

test("exports the same catalog surface as the constants module", () => {
  assert.equal(FALLBACK_MODELS[0]?.id, "deepseek-ai/deepseek-v4.1-flash");
  assert.equal(parseModelsResponse({ data: [] }).length, 0);
  assert.equal(typeof fetchModels, "function");
});

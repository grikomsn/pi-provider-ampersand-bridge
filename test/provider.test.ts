import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI, ProviderConfig } from "@earendil-works/pi-coding-agent";
import ampersandProvider, {
  AMPERSAND_BASE_URL,
  FALLBACK_MODELS,
  fetchModels,
  parseModelsResponse,
} from "../src/index.ts";
import { withAgentDir } from "./helpers.ts";

function capture() {
  const registrations: Array<{ name: string; config: ProviderConfig }> = [];
  const pi = {
    registerProvider(name: string, config: ProviderConfig) {
      registrations.push({ name, config });
    },
    registerCommand() {},
  } as unknown as ExtensionAPI;
  return { pi, registrations };
}

test("registers an authenticated OpenAI-compatible provider", async () => {
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

  // No persisted catalog: the bundled fallback is registered.
  await withAgentDir(undefined, () => ampersandProvider(pi));
  assert.equal(registration?.name, "ampersand");
  assert.equal(registration?.config.name, "ai&");
  assert.equal(registration?.config.baseUrl, AMPERSAND_BASE_URL);
  assert.equal(registration?.config.apiKey, "$AMPERSAND_API_KEY");
  assert.equal(registration?.config.api, "openai-completions");
  assert.equal(registration?.config.authHeader, true);
  assert.equal(registration?.config.models?.length, 13);
  assert.equal(registration?.config.models, FALLBACK_MODELS);
  assert.equal(typeof registration?.config.refreshModels, "function");
  assert.equal(command?.name, "ampersand-balance");
  assert.equal(typeof command?.description, "string");
});

test("exports the same catalog surface as the constants module", () => {
  assert.equal(FALLBACK_MODELS[0]?.id, "deepseek-ai/deepseek-v4.1-flash");
  assert.equal(parseModelsResponse({ data: [] }).length, 0);
  assert.equal(typeof fetchModels, "function");
});

const liveOnly = {
  id: "vendor/live-only-model",
  name: "Live Only Model",
  reasoning: true,
  input: ["text"],
  cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 262_144,
  maxTokens: 32_768,
};

test("registration seeds pi's persisted catalog so a live-only default resolves at startup", async () => {
  const { pi, registrations } = capture();
  await withAgentDir({ ampersand: { models: [liveOnly], checkedAt: 1 } }, () => ampersandProvider(pi));
  assert.deepEqual(registrations[0]?.config.models, [liveOnly]);
  // The provider-level baseUrl/api cover rows persisted without their own.
  assert.equal(registrations[0]?.config.baseUrl, AMPERSAND_BASE_URL);
  assert.equal(registrations[0]?.config.api, "openai-completions");
});

test("registration falls back to the bundled catalog for an empty, foreign, or broken store", async () => {
  for (const store of [{ ampersand: { models: [] } }, { other: { models: [liveOnly] } }, "{not json", { ampersand: { models: ["junk"] } }]) {
    const { pi, registrations } = capture();
    await withAgentDir(store, () => ampersandProvider(pi));
    assert.equal(registrations[0]?.config.models, FALLBACK_MODELS);
  }
});

test("pi's model runtime resolves a seeded live-only model synchronously after registration", async () => {
  const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
  await withAgentDir({ ampersand: { models: [liveOnly], checkedAt: 1 } }, async () => {
    const dir = process.env.PI_CODING_AGENT_DIR!;
    const runtime = await ModelRuntime.create({
      authPath: join(dir, "auth.json"),
      modelsPath: join(dir, "models.json"),
      refreshOnCreate: false,
    });
    ampersandProvider({
      registerProvider: (name: string, config: ProviderConfig) => runtime.registerProvider(name, config),
      registerCommand() {},
    } as unknown as ExtensionAPI);
    // Startup model resolution reads the runtime synchronously, before any refresh lands.
    const model = runtime.getModel("ampersand", liveOnly.id);
    assert.equal(model?.id, liveOnly.id);
    assert.equal(model?.baseUrl, AMPERSAND_BASE_URL);
    assert.equal(model?.api, "openai-completions");
    // Let the registration's own cache-only refresh settle before the directory is removed.
    await runtime.refresh({ allowNetwork: false });
    assert.equal(runtime.getModel("ampersand", liveOnly.id)?.id, liveOnly.id);
  });
});

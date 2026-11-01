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

test("corrupt persisted rows never make pi's registration or refresh throw", async () => {
  const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
  const corrupt = [
    { ...liveOnly, id: "bad/api-empty", api: "" },
    { ...liveOnly, id: "bad/base-empty", baseUrl: "" },
    { ...liveOnly, id: "bad/base-number", baseUrl: 7 },
    { ...liveOnly, id: "bad/api-number", api: 7 },
  ];
  await withAgentDir({ ampersand: { models: [...corrupt, liveOnly], checkedAt: 1 } }, async () => {
    const dir = process.env.PI_CODING_AGENT_DIR!;
    const runtime = await ModelRuntime.create({
      authPath: join(dir, "auth.json"),
      modelsPath: join(dir, "models.json"),
      refreshOnCreate: false,
    });
    // ModelRuntime.registerProvider runs pi's validateExtensionProvider first.
    assert.doesNotThrow(() => ampersandProvider({
      registerProvider: (name: string, config: ProviderConfig) => runtime.registerProvider(name, config),
      registerCommand() {},
    } as unknown as ExtensionAPI));
    const models = runtime.getModels().filter((model) => model.provider === "ampersand");
    assert.deepEqual(models.map((model) => model.id), [liveOnly.id]);
    assert.ok(models.every((model) => model.baseUrl === AMPERSAND_BASE_URL && model.api === "openai-completions"));
    // The registration's cache-only refresh must publish cleanly too.
    const result = await runtime.refresh({ allowNetwork: false });
    assert.equal(result.errors.get("ampersand"), undefined);
    assert.deepEqual(
      runtime.getModels().filter((model) => model.provider === "ampersand").map((model) => model.id),
      [liveOnly.id],
    );
  });
});

test("the unfiltered corrupt rows really do break pi's registration (guards the guard)", async () => {
  const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
  await withAgentDir(undefined, async () => {
    const dir = process.env.PI_CODING_AGENT_DIR!;
    const runtime = await ModelRuntime.create({
      authPath: join(dir, "auth.json"),
      modelsPath: join(dir, "models.json"),
      refreshOnCreate: false,
    });
    const register = (row: Record<string, unknown>) => runtime.registerProvider("ampersand", {
      name: "ai&", baseUrl: AMPERSAND_BASE_URL, apiKey: "$AMPERSAND_API_KEY", api: "openai-completions",
      models: [{ ...liveOnly, ...row }] as never,
    });
    assert.throws(() => register({ api: "" }), /api/);
    assert.throws(() => register({ baseUrl: "" }), /baseUrl/);
  });
});

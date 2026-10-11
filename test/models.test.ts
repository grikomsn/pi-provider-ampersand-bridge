import assert from "node:assert/strict";
import test from "node:test";
import { AMPERSAND_BASE_URL, AMPERSAND_COMPAT, FALLBACK_MODELS } from "../src/constants.ts";
import { fetchModels, parseModelsResponse, refreshModels } from "../src/models.ts";

const LIVE_FIXTURE = {
  data: [
    {
      id: "deepseek-ai/deepseek-v4.1-flash",
      name: "deepseek-ai/DeepSeek-V4.1-Flash",
      context_window: 1_048_576,
      max_output_tokens: 384_000,
      capabilities: ["chat", "vision", "reasoning", "tool_calling"],
      reasoning_efforts: ["none", "high", "max"],
      reasoning_effort_default: "high",
      input_per_1m: "0.300000",
      output_per_1m: "0.600000",
      cached_input_per_1m: "0.020000",
    },
    {
      id: "zai-org/glm-5.3",
      name: "zai-org/glm-5.3",
      context_window: 1_048_576,
      max_output_tokens: 131_072,
      capabilities: ["reasoning", "tool_calling"],
      reasoning_efforts: ["low", "high", "max"],
      reasoning_effort_default: "max",
      input_per_1m: "1.000000",
      output_per_1m: "4.000000",
      cached_input_per_1m: "0.300000",
    },
    { object: "model-without-id" },
  ],
};

test("fallback metadata matches the current ai& catalog", () => {
  const models = new Map(FALLBACK_MODELS.map((model) => [model.id, model]));
  assert.equal(models.size, 13);

  const flash = models.get("deepseek-ai/deepseek-v4.1-flash");
  assert.equal(flash?.contextWindow, 1_048_576);
  assert.equal(flash?.maxTokens, 384_000);
  assert.deepEqual(flash?.input, ["text", "image"]);
  assert.deepEqual(flash?.cost, { input: 0.3, output: 0.6, cacheRead: 0.02, cacheWrite: 0 });
  assert.deepEqual(flash?.thinkingLevelMap, {
    off: "none", minimal: null, low: null, medium: "high", high: "high", xhigh: null, max: "max",
  });

  // GLM 5.3 has no disable switch: "off" is unsupported, max maps to itself.
  // Its ai& default effort is "max", which pi's default "medium" level steers to.
  assert.deepEqual(models.get("zai-org/glm-5.3")?.thinkingLevelMap, {
    off: null, minimal: null, low: "low", medium: "max", high: "high", xhigh: null, max: "max",
  });

  // Kimi K2.7 Code only accepts "high": max falls back to the highest effort.
  assert.deepEqual(models.get("moonshotai/kimi-k2.7-code")?.thinkingLevelMap, {
    off: null, minimal: null, low: null, medium: "high", high: "high", xhigh: null, max: "high",
  });

  const compat = models.get("zai-org/glm-5.3")?.compat as Record<string, unknown>;
  assert.equal(compat?.thinkingFormat, "openai");
  assert.equal(compat?.maxTokensField, "max_completion_tokens");
  assert.equal(compat?.supportsDeveloperRole, false);
  assert.equal(compat?.supportsUsageInStreaming, true);
});

test("fallback base URL points at the ai& gateway", () => {
  assert.equal(AMPERSAND_BASE_URL, "https://api.aiand.com/v1");
});

test("parses every model and uses live metadata", () => {
  const models = parseModelsResponse(LIVE_FIXTURE);
  assert.equal(models.length, 2);

  assert.deepEqual(models[0], {
    id: "deepseek-ai/deepseek-v4.1-flash",
    name: "DeepSeek V4.1 Flash",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0.3, output: 0.6, cacheRead: 0.02, cacheWrite: 0 },
    contextWindow: 1_048_576,
    maxTokens: 384_000,
    thinkingLevelMap: {
      off: "none", minimal: null, low: null, medium: "high", high: "high", xhigh: null, max: "max",
    },
    compat: AMPERSAND_COMPAT,
  });

  assert.deepEqual(models[1]?.input, ["text"]);
  assert.equal(models[1]?.name, "GLM 5.3");
  assert.deepEqual(models[1]?.cost, { input: 1, output: 4, cacheRead: 0.3, cacheWrite: 0 });
});

test("keeps fallback metadata when /models returns the basic OpenAI shape", () => {
  const [model] = parseModelsResponse({ data: [{ id: "openai/gpt-oss-120b" }] });
  assert.equal(model?.name, "GPT OSS 120B");
  assert.equal(model?.contextWindow, 131_072);
  assert.equal(model?.maxTokens, 32_768);
  assert.equal(model?.reasoning, true);
  assert.equal(model?.cost.input, 0.15);
});

test("derives fresh thinking maps for unknown models and drops malformed entries", () => {
  const models = parseModelsResponse({
    data: [
      {
        id: "future-labs/future-1",
        name: "future-labs/future-1",
        capabilities: ["reasoning"],
        reasoning_efforts: ["none", "medium", "xhigh"],
        reasoning_effort_default: "xhigh",
        reasoning_effort: "invalid",
        input_per_1m: "2", output_per_1m: "8", cached_input_per_1m: "1",
      },
      { id: "future-labs/plain" },
      null,
      [1],
    ],
  });
  assert.equal(models.length, 2);
  const [future, plain] = models;
  assert.equal(future?.contextWindow, 262_144);
  assert.deepEqual(future?.thinkingLevelMap, {
    off: "none", minimal: null, low: null, medium: "medium", high: null, xhigh: "xhigh", max: "xhigh",
  });
  assert.equal(plain?.reasoning, false);
  assert.equal(plain?.thinkingLevelMap, undefined);
});

test("ignores empty payloads", () => {
  assert.deepEqual(parseModelsResponse({}), []);
  assert.deepEqual(parseModelsResponse({ data: [] }), []);
});

test("fetches /models with bearer authentication", async () => {
  const originalFetch = globalThis.fetch;
  let request: { input: string; init?: RequestInit } | undefined;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    request = { input: String(input), init };
    return new Response(JSON.stringify({ data: [{ id: "deepseek-ai/deepseek-v4-new" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const models = await fetchModels("secret");
    assert.equal(request?.input, `${AMPERSAND_BASE_URL}/models`);
    assert.equal((request?.init?.headers as Record<string, string>).Authorization, "Bearer secret");
    assert.equal(models[0]?.id, "deepseek-ai/deepseek-v4-new");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("refresh publishes every discovered model and keeps the persisted catalog", async () => {
  let persisted: { models: readonly unknown[]; checkedAt?: number } | undefined;
  const context = () => ({
    allowNetwork: true,
    signal: new AbortController().signal,
    credential: { type: "api_key" as const, key: "secret" },
    stored: persisted ? { ...persisted } : undefined,
    async publish(publication: { persist?: unknown }) {
      if (publication.persist) persisted = publication.persist as typeof persisted;
      return true;
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    data: [{ id: "deepseek-ai/deepseek-a" }, { id: "deepseek-ai/deepseek-b" }],
  }), { status: 200 })) as typeof fetch;

  try {
    const discovered = await refreshModels(context() as never);
    assert.deepEqual(discovered.map((model) => model.id), ["deepseek-ai/deepseek-a", "deepseek-ai/deepseek-b"]);
    assert.deepEqual([...(persisted?.models ?? [])].map((model) => (model as { id: string }).id), [
      "deepseek-ai/deepseek-a", "deepseek-ai/deepseek-b",
    ]);

    globalThis.fetch = (async () => new Response("unavailable", { status: 503 })) as typeof fetch;
    const cached = await refreshModels(context() as never);
    assert.deepEqual(cached.map((model) => model.id), ["deepseek-ai/deepseek-a", "deepseek-ai/deepseek-b"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("refresh falls back when no resolved credential is available", async () => {
  const fallback = await refreshModels({
    allowNetwork: true,
    signal: new AbortController().signal,
    async publish() { return true; },
  } as never);
  assert.equal(fallback, FALLBACK_MODELS);
});

test("accepts the live field aliases the sister bridge accepts", () => {
  const [aliased] = parseModelsResponse({
    data: [{
      id: "future-labs/aliased",
      context_length: 500_000,
      max_completion_tokens: 16_384,
      pricing: { prompt: "1.5", completion: "6", cache_prompt: "0.25" },
      capabilities: ["reasoning"],
      reasoning_efforts: ["low", "high"],
    }],
  });
  assert.equal(aliased?.contextWindow, 500_000);
  assert.equal(aliased?.maxTokens, 16_384);
  assert.deepEqual(aliased?.cost, { input: 1.5, output: 6, cacheRead: 0.25, cacheWrite: 0 });

  const [flat] = parseModelsResponse({
    data: [{
      id: "future-labs/flat",
      max_context_tokens: 128_000,
      max_model_len: undefined,
      input_per_1m: "0.4",
      output_per_1m: "1.2",
      cached_input_per_1m: "0.1",
    }],
  });
  assert.equal(flat?.contextWindow, 128_000);
  assert.deepEqual(flat?.cost, { input: 0.4, output: 1.2, cacheRead: 0.1, cacheWrite: 0 });
});

test("detects image input from architecture modalities and vision names", () => {
  const [fromArchitecture] = parseModelsResponse({
    data: [{ id: "future-labs/multimodal", architecture: { input_modalities: ["text", "image"] } }],
  });
  assert.deepEqual(fromArchitecture?.input, ["text", "image"]);

  const [fromName] = parseModelsResponse({ data: [{ id: "future-labs/qwen-vision" }] });
  assert.deepEqual(fromName?.input, ["text", "image"]);

  const [explicitTextOnly] = parseModelsResponse({
    data: [{ id: "future-labs/vision-named", input_modalities: ["text"] }],
  });
  assert.deepEqual(explicitTextOnly?.input, ["text"]);
});

test("steers pi's default medium level to the catalog default effort", () => {
  // Live default applies when it is in the effort list.
  const [liveDefault] = parseModelsResponse({
    data: [{
      id: "future-labs/reasoner",
      capabilities: ["reasoning"],
      reasoning_efforts: ["low", "high", "max"],
      reasoning_effort_default: "max",
    }],
  });
  assert.equal(liveDefault?.thinkingLevelMap?.medium, "max");

  // Invalid live default is ignored and the last listed effort is used.
  const [badDefault] = parseModelsResponse({
    data: [{
      id: "future-labs/reasoner-2",
      capabilities: ["reasoning"],
      reasoning_efforts: ["none", "high"],
      reasoning_effort_default: "turbo",
    }],
  });
  assert.equal(badDefault?.thinkingLevelMap?.medium, "high");

  // Missing live default falls back to the bundled per-model default.
  const [fallbackDefault] = parseModelsResponse({
    data: [{ id: "moonshotai/kimi-k3", reasoning_efforts: ["low", "high", "max"] }],
  });
  assert.equal(fallbackDefault?.thinkingLevelMap?.medium, "max");

  // Models that accept "medium" natively keep it.
  const [nativeMedium] = parseModelsResponse({
    data: [{
      id: "future-labs/native",
      capabilities: ["reasoning"],
      reasoning_efforts: ["low", "medium", "high"],
      reasoning_effort_default: "high",
    }],
  });
  assert.equal(nativeMedium?.thinkingLevelMap?.medium, "medium");
});

test("drops non-chat listings and canonicalizes ids", () => {
  const models = parseModelsResponse({
    data: [
      { id: "future-labs/text-embedding" },
      { id: "vendor/rerank-v2" },
      { id: "vendor/image-gen" },
      { id: "vendor/audio-tiny" },
      { id: "  DeepSeek-AI/DeepSeek-V4.1-Flash  ", context_window: 999 },
      { id: "deepseek-ai/deepseek-v4.1-flash" },
    ],
  });
  assert.deepEqual(models.map((model) => model.id), [
    "deepseek-ai/deepseek-v4.1-flash",
    "deepseek-ai/deepseek-v4.1-flash",
  ]);
  // Mixed-case ids canonicalize onto the bundled fallback row.
  assert.equal(models[0]?.contextWindow, 999);
  assert.equal(models[0]?.name, "DeepSeek V4.1 Flash");
});

test("retries transient /models failures and sends problem+json accept", async () => {
  const originalFetch = globalThis.fetch;
  const accept: string[] = [];
  let calls = 0;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    accept.push(String((init?.headers as Record<string, string>).Accept));
    if (calls < 3) return new Response("overloaded", { status: 503 });
    return new Response(JSON.stringify({ data: [{ id: "deepseek-ai/deepseek-v4-new" }] }), { status: 200 });
  }) as typeof fetch;

  try {
    const models = await fetchModels("secret");
    assert.equal(calls, 3);
    assert.equal(accept[0], "application/json, application/problem+json");
    assert.equal(models[0]?.id, "deepseek-ai/deepseek-v4-new");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("gives up after three attempts on persistent transient failures", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("rate limited", { status: 429, headers: { "retry-after": "0" } });
  }) as typeof fetch;

  try {
    await assert.rejects(fetchModels("secret"), /HTTP 429/);
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not retry non-transient failures", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("denied", { status: 401 });
  }) as typeof fetch;

  try {
    await assert.rejects(fetchModels("secret"), /HTTP 401/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

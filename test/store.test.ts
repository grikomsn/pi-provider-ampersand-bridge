import assert from "node:assert/strict";
import test from "node:test";

import { readPersistedProviderModels, usablePersistedModels } from "../src/store.ts";
import { withAgentDir } from "./helpers.ts";

const row = {
  id: "vendor/live-only-model",
  name: "Live Only Model",
  reasoning: true,
  input: ["text"],
  cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 262_144,
  maxTokens: 32_768,
  compat: { maxTokensField: "max_completion_tokens" },
};
const lax = { requireBaseUrl: false } as const;
const strict = { requireBaseUrl: true } as const;

test("reads the persisted catalog for a provider", async () => {
  await withAgentDir({ ampersand: { models: [row], checkedAt: 1 } }, () => {
    assert.deepEqual(readPersistedProviderModels("ampersand", lax), [row]);
  });
});

test("returns [] when no store has been written yet", async () => {
  await withAgentDir(undefined, () => {
    assert.deepEqual(readPersistedProviderModels("ampersand", lax), []);
  });
});

test("returns [] for a malformed store instead of throwing", async () => {
  await withAgentDir("{not json", () => {
    assert.deepEqual(readPersistedProviderModels("ampersand", lax), []);
  });
});

test("returns [] when the store root is not an object", async () => {
  for (const store of ["[]", "null", "42", '"text"']) {
    await withAgentDir(store, () => {
      assert.deepEqual(readPersistedProviderModels("ampersand", lax), []);
    });
  }
});

test("accepts a store written with a byte-order mark", async () => {
  await withAgentDir(`﻿${JSON.stringify({ ampersand: { models: [row] } })}`, () => {
    assert.deepEqual(readPersistedProviderModels("ampersand", lax), [row]);
  });
});

test("returns [] when the provider has no persisted entry", async () => {
  await withAgentDir({ poolside: { models: [row] } }, () => {
    assert.deepEqual(readPersistedProviderModels("ampersand", lax), []);
  });
});

test("returns [] when the entry does not carry a model list", async () => {
  for (const entry of [{ checkedAt: 1 }, { models: "nope" }, null, [row]]) {
    await withAgentDir({ ampersand: entry }, () => {
      assert.deepEqual(readPersistedProviderModels("ampersand", lax), []);
    });
  }
});

test("drops junk rows and rows without a usable id", async () => {
  await withAgentDir(
    { ampersand: { models: [row, "junk", null, 7, [row], { name: "no id" }, { id: "" }, { id: "   " }, { id: 3 }] } },
    () => {
      assert.deepEqual(readPersistedProviderModels("ampersand", lax), [row]);
    },
  );
});

test("drops non-chat rows", async () => {
  const chat = { ...row, id: "vendor/explicit-chat", type: "chat" };
  await withAgentDir(
    { ampersand: { models: [row, chat, { ...row, id: "vendor/img", type: "image" }, { ...row, id: "vendor/cls", type: "classifier" }] } },
    () => {
      assert.deepEqual(readPersistedProviderModels("ampersand", lax), [row, chat]);
    },
  );
});

test("keeps rows without baseUrl unless the caller requires one", async () => {
  const withBase = { ...row, id: "vendor/with-base", baseUrl: "https://api.aiand.com/v1" };
  await withAgentDir({ ampersand: { models: [row, withBase] } }, () => {
    assert.deepEqual(readPersistedProviderModels("ampersand", lax), [row, withBase]);
    assert.deepEqual(readPersistedProviderModels("ampersand", strict), [withBase]);
  });
});

test("resolves the store lazily from PI_CODING_AGENT_DIR", async () => {
  await withAgentDir({ ampersand: { models: [row] } }, async () => {
    assert.equal(readPersistedProviderModels("ampersand", lax).length, 1);
    await withAgentDir(undefined, () => {
      assert.deepEqual(readPersistedProviderModels("ampersand", lax), []);
    });
  });
});

// Shapes that pi's registerProvider rejects (empty api/baseUrl) or that would
// silently replace the provider-level values (non-string api/baseUrl).
const corrupt = [
  { ...row, id: "bad/api-empty", api: "" },
  { ...row, id: "bad/api-blank", api: "   " },
  { ...row, id: "bad/api-number", api: 7 },
  { ...row, id: "bad/api-object", api: {} },
  { ...row, id: "bad/base-empty", baseUrl: "" },
  { ...row, id: "bad/base-number", baseUrl: 7 },
  { ...row, id: "bad/base-bool", baseUrl: false },
];

test("drops rows whose own api or baseUrl is set but unusable", () => {
  const nulls = { ...row, id: "ok/nulls", api: null, baseUrl: null };
  const strings = { ...row, id: "ok/strings", api: "openai-completions", baseUrl: "https://api.aiand.com/v1" };
  assert.deepEqual(usablePersistedModels([...corrupt, row, nulls, strings], lax), [row, nulls, strings]);
  // requireBaseUrl still demands a string baseUrl on top of that.
  assert.deepEqual(usablePersistedModels([...corrupt, row, nulls, strings], strict), [strings]);
});

test("usablePersistedModels tolerates a non-array model list", () => {
  for (const value of [undefined, null, "x", 3, { 0: row }]) {
    assert.deepEqual(usablePersistedModels(value, lax), []);
  }
});

test("the store reader applies the same filter", async () => {
  await withAgentDir({ ampersand: { models: [...corrupt, row] } }, () => {
    assert.deepEqual(readPersistedProviderModels("ampersand", lax), [row]);
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import { fetchModels, fetchWithRetry, isTransientNetworkError } from "../src/models.ts";

async function withFetch(stub: typeof fetch, fn: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

/** A transient response whose body records whether it was cancelled. */
function trackedResponse(status: number, cancelled: boolean[]): Response {
  const index = cancelled.push(false) - 1;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new TextEncoder().encode("busy"));
    },
    cancel() {
      cancelled[index] = true;
    },
  });
  return new Response(body, { status, headers: { "retry-after": "0" } });
}

test("cancels the body of every response it retries", async () => {
  const cancelled: boolean[] = [];
  let calls = 0;
  await withFetch((async () => {
    calls += 1;
    if (calls < 3) return trackedResponse(503, cancelled);
    return new Response(JSON.stringify({ data: [{ id: "vendor/model" }] }), { status: 200 });
  }) as typeof fetch, async () => {
    const models = await fetchModels("secret");
    assert.equal(models[0]?.id, "vendor/model");
    assert.equal(calls, 3);
    assert.deepEqual(cancelled, [true, true]);
  });
});

test("returns the final transient response unconsumed after the last attempt", async () => {
  const cancelled: boolean[] = [];
  await withFetch((async () => trackedResponse(502, cancelled)) as typeof fetch, async () => {
    const response = await fetchWithRetry("https://api.aiand.com/v1/models", {});
    assert.equal(response.status, 502);
    assert.deepEqual(cancelled, [true, true, false]);
    await response.body?.cancel();
  });
});

test("a body that cannot be cancelled does not break the retry", async () => {
  let calls = 0;
  await withFetch((async () => {
    calls += 1;
    if (calls === 1) {
      const response = new Response("busy", { status: 503, headers: { "retry-after": "0" } });
      response.body?.getReader(); // locked: cancel() rejects
      return response;
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch, async () => {
    const response = await fetchWithRetry("https://api.aiand.com/v1/models", {});
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
  });
});

test("credential-bearing catalog requests refuse redirects", async () => {
  let init: RequestInit | undefined;
  await withFetch((async (_input: string | URL | Request, value?: RequestInit) => {
    init = value;
    return new Response(JSON.stringify({ data: [{ id: "vendor/model" }] }), { status: 200 });
  }) as typeof fetch, async () => {
    await fetchModels("secret");
    assert.equal(init?.redirect, "error");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer secret");
  });
});

test("classifies string causes as transient network errors", () => {
  assert.equal(isTransientNetworkError(new TypeError("network error", { cause: "ECONNRESET" })), true);
  assert.equal(isTransientNetworkError(new TypeError("boom", { cause: "something else" })), false);
  const nested = new TypeError("fetch failed", { cause: new Error("outer", { cause: "socket hang up" }) });
  assert.equal(isTransientNetworkError(nested), true);
  const abort = new Error("fetch failed");
  abort.name = "AbortError";
  assert.equal(isTransientNetworkError(abort), false);
});

test("survives a self-referential cause chain", () => {
  const error = new Error("weird") as Error & { cause?: unknown };
  error.cause = error;
  assert.equal(isTransientNetworkError(error), false);
});

test("retries network errors whose cause is a string", async () => {
  let calls = 0;
  await withFetch((async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("network error", { cause: "ECONNREFUSED" });
    return new Response(JSON.stringify({ data: [{ id: "vendor/model" }] }), { status: 200 });
  }) as typeof fetch, async () => {
    const models = await fetchModels("secret");
    assert.equal(calls, 2);
    assert.equal(models[0]?.id, "vendor/model");
  });
});

test("aborting during backoff stops retrying immediately", async () => {
  const controller = new AbortController();
  let calls = 0;
  await withFetch((async () => {
    calls += 1;
    // Long Retry-After so the test would hang for seconds without abort-aware backoff.
    setTimeout(() => controller.abort(new Error("caller gave up")), 10);
    return new Response("busy", { status: 503, headers: { "retry-after": "5" } });
  }) as typeof fetch, async () => {
    const started = Date.now();
    await assert.rejects(
      fetchWithRetry("https://api.aiand.com/v1/models", { signal: controller.signal }, controller.signal),
      /caller gave up/,
    );
    assert.equal(calls, 1);
    assert.ok(Date.now() - started < 1_000);
  });
});

test("an already-aborted request signal skips backoff", async () => {
  const controller = new AbortController();
  controller.abort(new Error("already aborted"));
  let calls = 0;
  await withFetch((async () => {
    calls += 1;
    return new Response("busy", { status: 503, headers: { "retry-after": "5" } });
  }) as typeof fetch, async () => {
    await assert.rejects(
      fetchWithRetry("https://api.aiand.com/v1/models", { signal: controller.signal }),
      /already aborted/,
    );
    assert.equal(calls, 1);
  });
});

test("the request timeout also ends backoff", async () => {
  let calls = 0;
  await withFetch((async () => {
    calls += 1;
    return new Response("busy", { status: 503, headers: { "retry-after": "5" } });
  }) as typeof fetch, async () => {
    const started = Date.now();
    await assert.rejects(
      fetchWithRetry("https://api.aiand.com/v1/models", { signal: AbortSignal.timeout(20) }),
      (error: Error) => error.name === "TimeoutError",
    );
    assert.equal(calls, 1);
    assert.ok(Date.now() - started < 1_000);
  });
});

test("a refused redirect is not retried", async () => {
  let calls = 0;
  await withFetch((async () => {
    calls += 1;
    // The exact shape undici throws for `redirect: "error"`.
    throw new TypeError("fetch failed", { cause: new Error("unexpected redirect") });
  }) as typeof fetch, async () => {
    await assert.rejects(fetchModels("secret"), /fetch failed/);
    assert.equal(calls, 1);
  });
  assert.equal(isTransientNetworkError(new TypeError("fetch failed", { cause: new Error("unexpected redirect") })), false);
});

test("a real redirecting server is refused once, without retries", async () => {
  const { createServer } = await import("node:http");
  let hits = 0;
  const server = createServer((_request, response) => {
    hits += 1;
    response.writeHead(302, { location: "https://example.invalid/steal" });
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as { port: number };
    await assert.rejects(
      fetchWithRetry(`http://127.0.0.1:${port}/v1/models`, { redirect: "error", headers: { Authorization: "Bearer secret" } }),
      (error: Error) => error instanceof TypeError && /unexpected redirect/.test(String((error.cause as Error)?.message)),
    );
    assert.equal(hits, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("a body whose cancel never settles does not stall the retry", async () => {
  let calls = 0;
  await withFetch((async () => {
    calls += 1;
    if (calls === 1) {
      const body = new ReadableStream<Uint8Array>({ cancel: () => new Promise<void>(() => {}) });
      return new Response(body, { status: 503, headers: { "retry-after": "0" } });
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch, async () => {
    const response = await fetchWithRetry("https://api.aiand.com/v1/models", { signal: AbortSignal.timeout(2_000) });
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
  });
});

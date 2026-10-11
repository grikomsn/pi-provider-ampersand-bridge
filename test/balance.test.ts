import assert from "node:assert/strict";
import test from "node:test";
import { AMPERSAND_BALANCE_URL, fetchBalance, formatBalance, parseBalance } from "../src/balance.ts";
import { retryDelayMs } from "../src/models.ts";

test("parses balance payloads with both key spellings", () => {
  assert.deepEqual(parseBalance({ balance: "12.5", currency: "usd", usable_requests: 40 }), {
    credits: 12.5,
    currency: "usd",
    usableRequests: 40,
  });
  assert.deepEqual(parseBalance({ credits: 3, currency: "jpy", usable_requests: null }), {
    credits: 3,
    currency: "jpy",
    usableRequests: null,
  });
  // Unknown currency is dropped; pay-as-you-go accounts report no credits.
  assert.deepEqual(parseBalance({ usable_requests: 7 }), { usableRequests: 7 });
  assert.equal(parseBalance({}), undefined);
  assert.equal(parseBalance("nope"), undefined);
});

test("fetches /billing/balance outside the versioned API", async () => {
  const originalFetch = globalThis.fetch;
  let request: { input: string; init?: RequestInit } | undefined;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    request = { input: String(input), init };
    return new Response(JSON.stringify({ balance: "42.00", currency: "usd", usable_requests: null }), {
      status: 200,
    });
  }) as typeof fetch;

  try {
    const balance = await fetchBalance("secret");
    assert.equal(request?.input, AMPERSAND_BALANCE_URL);
    assert.equal(AMPERSAND_BALANCE_URL, "https://api.aiand.com/billing/balance");
    assert.equal((request?.init?.headers as Record<string, string>).Authorization, "Bearer secret");
    assert.equal(formatBalance(balance), "$42.00 USD credits");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("formats balances across currencies and allowances", () => {
  assert.equal(formatBalance({ credits: 1000, currency: "jpy" }), "¥1,000 JPY credits");
  assert.equal(formatBalance({ usableRequests: 1234 }), "1,234 requests remaining today");
  assert.equal(formatBalance({ usableRequests: null }), "pay-as-you-go account");
});

test("retry delays honor Retry-After and cap backoff", () => {
  assert.equal(retryDelayMs(0), 250);
  assert.equal(retryDelayMs(1), 500);
  assert.equal(retryDelayMs(3), 2_000);
  assert.equal(retryDelayMs(10), 2_000);
  assert.equal(retryDelayMs(0, "2"), 2_000);
  assert.equal(retryDelayMs(0, "60"), 5_000);
  const until = new Date(Date.now() + 60_000).toUTCString();
  assert.equal(retryDelayMs(0, until), 5_000);
});

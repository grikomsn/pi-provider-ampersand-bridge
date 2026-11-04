import { appendFile } from "node:fs/promises";

// Loaded only by the isolated packed-extension test host (`installed.test.ts`).
// Every outbound request is answered locally; nothing can reach a service.
export default function installTestFetch(): void {
  const log = process.env.AMPERSAND_TEST_FETCH_LOG!;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== "https://api.aiand.com" || url.pathname !== "/v1/chat/completions") {
      await appendFile(log, `unexpected ${url.origin}${url.pathname}\n`);
      throw new TypeError(`unexpected request to ${url.origin}${url.pathname}`);
    }
    const payload = JSON.parse(String(init?.body)) as { model?: string; stream?: boolean };
    const headers = new Headers(init?.headers);
    await appendFile(log, `chat ${payload.model} auth=${headers.get("authorization") === "Bearer ampersand-regression-test-key"}\n`);
    const chunk = {
      id: "ampersand-test", object: "chat.completion.chunk", created: 1,
      model: payload.model,
      choices: [{ index: 0, delta: { role: "assistant", content: "PACKED_AMPERSAND_OK" }, finish_reason: null }],
    };
    const end = {
      ...chunk,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(end)}\n\ndata: [DONE]\n\n`, {
      headers: { "content-type": "text/event-stream" },
    });
  };
}

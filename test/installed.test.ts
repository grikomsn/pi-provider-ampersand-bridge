import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { FALLBACK_MODELS } from "../src/constants.ts";
import { parseModelsResponse } from "../src/models.ts";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

// A model the live catalog lists but the bundled fallback does not.
const LIVE_ONLY_ID = "vendor-e2e/live-only-model";

test("packed provider honours a saved default on a live-only model through bundled pi", { timeout: 60_000 }, async () => {
  assert.ok(!FALLBACK_MODELS.some((model) => model.id === LIVE_ONLY_ID));
  const root = await mkdtemp(join(tmpdir(), "ampersand-packed-test-"));
  const repository = fileURLToPath(new URL("..", import.meta.url));
  const cli = fileURLToPath(new URL("./bundle/cli.js", import.meta.resolve("@earendil-works/pi-coding-agent")));
  try {
    execFileSync(npm, ["pack", "--ignore-scripts", "--pack-destination", root], {
      cwd: repository, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
    const archives = (await readdir(root)).filter((name) => name.endsWith(".tgz"));
    assert.equal(archives.length, 1);
    execFileSync("tar", ["-xzf", join(root, archives[0]!), "-C", root]);
    const fixture = join(root, "fake-fetch.ts");
    await copyFile(new URL("./fixtures/fake-fetch.ts", import.meta.url), fixture);

    const agent = join(root, "agent");
    await mkdir(agent);
    await writeFile(join(agent, "settings.json"), JSON.stringify({
      quietStartup: true,
      checkForUpdates: false,
      defaultProvider: "ampersand",
      defaultModel: LIVE_ONLY_ID,
    }));
    // What a previous successful refresh would have persisted for this model.
    const [persisted] = parseModelsResponse({ data: [{
      id: LIVE_ONLY_ID,
      name: "Live Only Model",
      context_length: 131_072,
      max_output_tokens: 16_384,
      reasoning_efforts: ["none", "high"],
    }] });
    await writeFile(join(agent, "models-store.json"), JSON.stringify({
      ampersand: { models: [persisted], checkedAt: Date.now() },
    }));

    const log = join(root, "fetch.log");
    await writeFile(log, "");
    const child = spawnSync(process.execPath, [
      cli, "--offline", "--no-extensions", "-e", fixture, "-e", join(root, "package"),
      "--no-mcp", "--no-skills", "--no-context-files", "--no-prompt-templates", "--no-themes",
      "--no-approve", "--no-session", "--no-tools",
      "--mode", "json", "-p", "Reply with OK.",
    ], {
      cwd: root, encoding: "utf8", timeout: 40_000,
      env: {
        PATH: process.env.PATH, HOME: root, TERM: "xterm-256color",
        PI_CODING_AGENT_DIR: agent, PI_TELEMETRY: "0", PI_OFFLINE: "1",
        XDG_CONFIG_HOME: root, XDG_DATA_HOME: root, XDG_STATE_HOME: root, XDG_CACHE_HOME: root,
        AMPERSAND_API_KEY: "ampersand-regression-test-key", AMPERSAND_TEST_FETCH_LOG: log,
      },
    });
    const requests = await readFile(log, "utf8");
    assert.equal(child.status, 0, `bundled pi exited with ${child.status}; requests: ${requests.trim() || "none"}`);
    assert.ok(!/Cannot find module|failed to load|extension error/i.test(child.stdout + child.stderr),
      "packed extension failed to load under the bundled host");
    // The saved default, not a fallback model, served the request.
    assert.equal(requests, `chat ${LIVE_ONLY_ID} auth=true\n`);
    const events = child.stdout.split("\n").flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
    assert.ok(events.some((event) => event.type === "message_end" && event.message?.role === "assistant"
      && event.message.stopReason === "stop"
      && event.message.content?.some((part: { type: string; text?: string }) => part.type === "text" && part.text === "PACKED_AMPERSAND_OK")),
    "packed extension did not complete the synthetic streamed response");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

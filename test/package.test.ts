import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

test("npm package ships the extension entry and never test files", () => {
  const output = execFileSync(npm, ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  const [{ files }] = JSON.parse(output) as [{ files: Array<{ path: string }> }];
  const paths = files.map((file) => file.path);

  assert.ok(paths.includes("src/index.ts"));
  assert.ok(!paths.some((path) => path.startsWith("test/")));
  assert.ok(!paths.some((path) => path.startsWith(".github/")));
  assert.ok(!paths.some((path) => path.startsWith(".env")));
});

test("pi manifest points at the extension entry", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    pi?: { extensions?: string[] };
    scripts?: Record<string, string>;
  };
  assert.deepEqual(manifest.pi?.extensions, ["./src/index.ts"]);
  assert.match(manifest.scripts?.test ?? "", /--test test\/\*\.test\.ts/);
});

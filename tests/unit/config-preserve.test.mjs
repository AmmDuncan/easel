// A theme toggle must not erase the panel's own keys (hotkey, projectRoots).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("writeConfig keeps unknown keys like panel.hotkey", () => {
  const home = mkdtempSync(join(tmpdir(), "easel-cfg-"));
  mkdirSync(join(home, ".easel"));
  const file = join(home, ".easel", "config.json");
  writeFileSync(file, JSON.stringify({ preset: "aurora", theme: "light", density: "carded", panel: { hotkey: "ctrl+option+space" } }));
  const script = `import("${join(process.cwd(), "dist/config-store.js")}").then(m => m.writeConfig({ theme: "dark" }))`;
  const r = spawnSync(process.execPath, ["-e", script], { env: { ...process.env, HOME: home } });
  assert.equal(r.status, 0, String(r.stderr));
  const saved = JSON.parse(readFileSync(file, "utf-8"));
  assert.equal(saved.theme, "dark");
  assert.deepEqual(saved.panel, { hotkey: "ctrl+option+space" });
});

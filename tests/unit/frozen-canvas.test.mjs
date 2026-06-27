/**
 * Frozen-canvas regression guard.
 *
 * A pushed card is an immutable snapshot: its light/dark mode (and preset /
 * density) are sealed at render time and must NEVER reflow when the user
 * toggles Easel's global theme. The mechanism:
 *   1. applyConfig() no longer broadcasts theme/preset/density into rendered
 *      iframes (the old `broadcastConfigToIframes` posting `easel:config`).
 *   2. The in-iframe message listeners (default wrapper + injectBridge) honour
 *      only `easel:print` — they no longer apply config/theme live.
 *   3. The render path seals each card to `push.theme` (explicit) or a snapshot
 *      of the current global theme.
 *   4. The data path (session-store.appendPush) persists a validated `theme`,
 *      and the MCP push tool exposes + forwards it.
 *
 * These assertions read the BUILT artifacts so no single branch can silently
 * regress the freeze (same philosophy as contrast-guard.test.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = (p) => readFileSync(resolve(__dirname, "../../dist", p), "utf-8");

const viewer = dist("client/viewer.js");
const sessionStore = dist("session-store.js");
const mcp = dist("mcp.js");

test("viewer no longer broadcasts config into rendered iframes", () => {
  // The old freeze-breaker: posting easel:config to each tracked iframe so a
  // global toggle rewrote every card. That broadcast must be gone.
  assert.ok(
    !/type:\s*["']easel:config["']/.test(viewer),
    "viewer.js still posts an easel:config message into iframes — the global toggle would flip existing cards",
  );
  assert.ok(
    !/function broadcastConfigToIframes/.test(viewer),
    "broadcastConfigToIframes is still defined — the per-iframe config broadcast should be removed entirely",
  );
});

test("render path seals each card's theme at push time", () => {
  assert.ok(
    /sealedTheme/.test(viewer) && /push\.theme/.test(viewer),
    "render path no longer seals push.theme into the wrapper — cards must snapshot their mode, not track the host",
  );
});

test("in-iframe listeners honour print but not live config/theme", () => {
  // Print must survive (it's not a canvas mutation). Live config/theme apply
  // must NOT — that's what kept cards adaptive.
  assert.ok(/easel:print/.test(viewer), "easel:print handling was lost from the iframe listeners");
  assert.ok(
    !/e\.data\.type\s*===\s*["']easel:config["']/.test(viewer),
    "an iframe listener still applies easel:config live — cards must be frozen",
  );
  assert.ok(
    !/e\.data\.type===['"]easel:config['"]/.test(viewer),
    "the injectBridge iframe listener still applies easel:config live — cards must be frozen",
  );
});

test("session-store validates + persists a per-push theme", () => {
  assert.ok(
    /input\.theme\s*===\s*["']light["']/.test(sessionStore) &&
      /input\.theme\s*===\s*["']dark["']/.test(sessionStore),
    "appendPush no longer validates input.theme to light|dark",
  );
});

test("MCP push tool exposes and forwards the theme param", () => {
  assert.ok(
    /enum:\s*\[\s*["']light["']\s*,\s*["']dark["']\s*\]/.test(mcp),
    "push inputSchema is missing the theme enum (light|dark)",
  );
  assert.ok(/theme:\s*args\.theme/.test(mcp), "pushToServer no longer forwards args.theme to /api/push");
});

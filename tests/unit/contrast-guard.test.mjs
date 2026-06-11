/**
 * Contrast-guard regression guard.
 *
 * The bug class: a push author hand-rolls a dark code container
 * (`<div style="background:#0b0f17">...</div>`) without using easel's
 * `.code` / `.terminal` primitives. The wrapper's base text inherits a
 * light-mode ink (`light-dark(#111, ...)`) against the dark panel, so the
 * code becomes near-invisible in light host mode — only spans with
 * explicit syntax colours survive. This has been the #1 recurring bug for
 * months despite a prominent call-out in the push MCP description.
 *
 * The guard: an in-iframe contrast scan runs after fonts ready + 400ms
 * settle, walks text-bearing elements, computes WCAG contrast ratio
 * between each one's text colour and its effective (climbed-past-
 * transparent) background, flags ratios < 3:1, and posts
 * `easel:contrast-warn` to the parent. Parent stamps an amber `⚠
 * contrast` chip on the push card with the offender list in the tooltip.
 *
 * These tests assert, by reading the built client, that the guard is
 * shipped, wired into every wrapper render path, and that the parent
 * handles the message — so no single render branch can silently lose it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const viewer = readFileSync(
  resolve(__dirname, "../../dist/client/viewer.js"),
  "utf8",
);
const css = readFileSync(
  resolve(__dirname, "../../dist/client/viewer.css"),
  "utf8",
);

function contrastGuardBody() {
  const start = viewer.indexOf("function contrastGuardScript(pushId)");
  assert.notEqual(start, -1, "contrastGuardScript() should exist");
  const end = viewer.indexOf("\n  }", start);
  return viewer.slice(start, end);
}

test("contrast guard implements WCAG ratio + climbs to effective background", () => {
  const body = contrastGuardBody();
  assert.match(body, /lum\(/, "must compute relative luminance");
  assert.match(body, /contrast\(/, "must compute contrast ratio");
  assert.match(body, /effBg\(/, "must climb to the effective background");
  assert.match(body, /ratio<3/, "must flag at the 3:1 WCAG floor");
  assert.match(body, /querySelectorAll\('\*'\)/, "must walk all elements");
});

test("contrast guard posts easel:contrast-warn with offender samples", () => {
  const body = contrastGuardBody();
  assert.match(body, /easel:contrast-warn/);
  assert.match(body, /samples:offenders\.slice/, "samples must be bounded");
  assert.match(body, /console\.warn/, "must also log in the iframe DevTools");
});

test("contrast guard names the code primitive (namespaced) in the warning", () => {
  const body = contrastGuardBody();
  assert.match(
    body,
    /easel-code/,
    "warning text must point authors at the namespaced .easel-code primitive",
  );
  assert.match(body, /terminal/);
});

test("reserved-class guard warns when a primitive name lands on an inline/table element", () => {
  const body = contrastGuardBody();
  assert.match(body, /reserved primitive class/, "must emit a reserved-class warning");
  assert.match(body, /scanReserved/, "reserved scan function must be defined and run");
  // the inline/table tags that signal an accidental collision
  assert.match(body, /SPAN:1[\s\S]*TD:1/, "must target inline/table tags");
});

test("contrast guard is injected into ALL render paths", () => {
  // buildDefaultWrapper has two branches (app-fidelity + presentation) and
  // injectBridge has its own path. Each must reach the guard, or a push
  // through that path will skip the check silently.
  const injections = viewer.match(/contrastGuardScript\(pushId\)/g) || [];
  assert.ok(
    injections.length >= 3,
    `expected ≥3 contrastGuardScript injections (app-fidelity, presentation, injectBridge); found ${injections.length}`,
  );
});

test("parent listens for easel:contrast-warn and stamps a chip", () => {
  assert.match(
    viewer,
    /easel:contrast-warn[\s\S]{0,200}stampContrastWarning/,
    "parent message handler must dispatch to stampContrastWarning",
  );
  assert.match(viewer, /function stampContrastWarning/);
  assert.match(viewer, /push-warn/, "chip must use the push-warn class");
});

test("push-warn chip has CSS for both themes", () => {
  assert.match(css, /\.push-warn\s*\{/);
  assert.match(
    css,
    /data-theme="dark"\][\s\S]{0,80}\.push-warn/,
    "dark theme must override the warn chip colours",
  );
});

/**
 * 100vh height auto-guard regression guard.
 *
 * The bug class: a push author gives the root `height: 100vh` — the
 * idiomatic way to write a full-screen app shell. Inside easel the `vh`
 * unit resolves against the push iframe (which has no intrinsic
 * viewport), so a viewport-relative root collapses to the iframe's
 * default ~150px and the screen crops mid-content. Two different local
 * render-window sizes produced pixel-identical (collapsed) cards,
 * proving the author's intended viewport never reaches easel.
 *
 * The guard: the in-iframe self-measure bridge reports, alongside the
 * existing floored `height`, a NON-floored `content` height and the
 * iframe's own `vp` (viewport). A parent-side phase machine
 * (applyMeasuredSize) leaves normal cards untouched — they size to
 * `height` exactly as before — but when content exactly fills the
 * viewport (the vh-lock signature) it probes at a distinct viewport and,
 * if content tracks it, pins the card to the 900px desktop canvas
 * instead of letting it collapse.
 *
 * These tests assert, by reading the BUILT client, that the bridge ships
 * the extra signals and the parent phase machine is wired into the size
 * message path — so no refactor can silently drop the guard.
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

test("self-measure bridge reports non-floored content height and viewport", () => {
  const start = viewer.indexOf("function selfMeasureScript(pushId)");
  assert.ok(start !== -1, "selfMeasureScript must exist");
  const body = viewer.slice(start, start + 1400);
  assert.match(body, /content:content\(\)/, "must post a `content` height");
  assert.match(body, /vp:vp\(\)/, "must post the iframe `vp` (viewport)");
  // content() must NOT floor to documentElement.scrollHeight (the viewport
  // floor) — it walks body children bottoms so short content stays short and
  // viewport-locked content reads as exactly the viewport.
  assert.match(
    body,
    /function content\(\)\{[^]*b\.children/,
    "content() must measure child bottoms, not the viewport-floored html.scrollHeight",
  );
  assert.match(
    body,
    /function vp\(\)\{return document\.documentElement\.clientHeight/,
    "vp() must report the iframe's own viewport height",
  );
});

test("size message is routed through the auto-guard phase machine", () => {
  assert.match(
    viewer,
    /easel:size[^]*applyMeasuredSize\(iframe, data\)/,
    "the easel:size handler must call applyMeasuredSize",
  );
});

test("applyMeasuredSize implements the probe → pin phase machine", () => {
  const start = viewer.indexOf("function applyMeasuredSize(iframe, data)");
  assert.ok(start !== -1, "applyMeasuredSize must exist");
  const fn = viewer.slice(start, start + 2600);
  for (const phase of ['"initial"', '"probing"', '"tracking"', '"pinned"']) {
    assert.ok(fn.includes(phase), `phase machine must handle ${phase}`);
  }
  assert.match(
    fn,
    /EASEL_DESKTOP_CANVAS/,
    "viewport-locked roots must pin to the desktop canvas",
  );
  assert.match(
    fn,
    /EASEL_PROBE_PX/,
    "ambiguous (content==viewport) roots must be probed at a distinct viewport",
  );
});

test("normal cards size from non-floored content with the historical floor", () => {
  // trackedHeight must use the non-floored `content` (not the viewport-floored
  // `height`) so a probed-then-released card can't get stuck at the probe
  // viewport, and must keep the 150px historical minimum.
  assert.match(
    viewer,
    /function trackedHeight\(content\)\s*\{[^}]*EASEL_MIN_CARD_PX[^}]*content/,
    "trackedHeight must floor content at EASEL_MIN_CARD_PX",
  );
  assert.match(
    viewer,
    /EASEL_MIN_CARD_PX = 150/,
    "the historical card floor must stay at 150px",
  );
});

test("desktop-canvas pin matches the .window.desktop min-height (900)", () => {
  assert.match(
    viewer,
    /EASEL_DESKTOP_CANVAS = 900/,
    "the pinned canvas height must stay in sync with .window.desktop (900px)",
  );
});

test("per-push size state is cleaned up when a card is removed", () => {
  assert.match(
    viewer,
    /iframeSizeState\.delete\(pushId\)/,
    "removeCardFromDom must drop the iframe's size state",
  );
});

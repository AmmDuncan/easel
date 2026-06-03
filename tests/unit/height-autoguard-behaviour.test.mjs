/**
 * 100vh auto-guard — BEHAVIOURAL test.
 *
 * The shape test (height-autoguard.test.mjs) proves the guard SHIPS. This
 * one proves it WORKS: it extracts the real applyMeasuredSize + helpers
 * from the built client and drives them through the same feedback loop the
 * browser produces — the iframe self-measures, the parent sets a height,
 * which changes the iframe viewport, which triggers a re-measure — until
 * the height converges. We assert the converged height for each scenario.
 *
 * Modelling the bridge: each scenario reports what its HTML would measure
 * at a given viewport `vp`:
 *   • intrinsic content  → content is fixed; floored height = max(content, vp)
 *   • viewport-locked     → content tracks the viewport (content = vp)
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

// Extract the self-contained block: consts + setIframeHeight + trackedHeight
// + applyMeasuredSize + iframeSizeState, up to (not including) the message
// listener. Eval it and hand back applyMeasuredSize bound to that scope.
function loadApplyMeasuredSize() {
  const start = viewer.indexOf("const EASEL_DESKTOP_CANVAS");
  const end = viewer.indexOf('window.addEventListener("message"', start);
  assert.ok(start !== -1 && end !== -1, "auto-guard block must be locatable");
  const block = viewer.slice(start, end);
  // eslint-disable-next-line no-new-func
  return new Function(block + "\nreturn applyMeasuredSize;")();
}

const INITIAL_VP = 150; // the push iframe's default height before any sizing

// Drive the measure → size → re-measure loop until the height converges.
// `report(vp)` returns the {height, content, vp} the bridge would post when
// the iframe viewport is `vp`. Returns the converged pixel height.
function converge(report, { staleDuringProbe = false } = {}) {
  const apply = loadApplyMeasuredSize();
  const iframe = { style: { height: "" }, _id: "p" + Math.random() };
  let vp = INITIAL_VP;
  let last = null;
  for (let i = 0; i < 12; i++) {
    apply(iframe, { pushId: iframe._id, ...report(vp) });
    const h = parseInt(iframe.style.height, 10) || 0;
    // Simulate a stale pre-resize message arriving mid-probe (carries the old
    // viewport): the guard must ignore it, not mis-decide on it.
    if (staleDuringProbe && i === 0) {
      apply(iframe, { pushId: iframe._id, height: INITIAL_VP, content: report(INITIAL_VP).content, vp: INITIAL_VP });
    }
    if (h === last) return h; // converged
    last = h;
    vp = h; // setting the height changes the iframe's viewport
  }
  return last;
}

const intrinsic = (n) => (vp) => ({ height: Math.max(n, vp), content: n, vp });
const viewportLocked = () => (vp) => ({ height: vp, content: vp, vp });

test("flowing content taller than the floor sizes to its content", () => {
  assert.equal(converge(intrinsic(300)), 300);
  assert.equal(converge(intrinsic(640)), 640);
});

test("short content keeps the 150px historical floor", () => {
  assert.equal(converge(intrinsic(80)), 150);
});

test("explicit px height is respected exactly", () => {
  assert.equal(converge(intrinsic(1100)), 1100);
});

test("a 100vh (viewport-locked) root pins to the 900px desktop canvas, not a collapsed stub", () => {
  assert.equal(converge(viewportLocked()), 900);
});

test("100vh decision is stable even with a stale mid-probe measurement", () => {
  assert.equal(converge(viewportLocked(), { staleDuringProbe: true }), 900);
});

test("content that coincidentally equals the initial viewport is NOT mistaken for 100vh", () => {
  // content == 150 == initial vp triggers the probe, but at the probe viewport
  // the content stays 150 (intrinsic) → released to its real height, not 900.
  assert.equal(converge(intrinsic(150)), 150);
});

test("a min-height:100vh shell with real overflow content sizes to the content, never probed down", () => {
  // content (1400) never equals the viewport at any step → straight to tracking.
  assert.equal(converge(intrinsic(1400)), 1400);
});

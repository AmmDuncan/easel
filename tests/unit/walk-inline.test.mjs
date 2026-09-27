import { test } from "node:test";
import assert from "node:assert/strict";
import { inlineWalkHtml } from "../../dist/inline-images.js";
import { sampleWalk } from "./walk-validate.test.mjs";

function markerInliner(html) {
  return Promise.resolve({ html: `${html}[INLINED]`, inlined: 1, failed: [] });
}

test("inlineWalkHtml passes every html field of every step through the inliner", async () => {
  const walk = sampleWalk();
  walk.steps[0].picture_html = "<img>";
  walk.steps[0].example_html = "<p>ex</p>";
  const out = await inlineWalkHtml(walk, markerInliner);
  for (const step of out.steps) {
    assert.ok(step.body_html.endsWith("[INLINED]"), `body_html for ${step.id}`);
    assert.ok(step.slower_html.endsWith("[INLINED]"), `slower_html for ${step.id}`);
    assert.ok(step.why_html.endsWith("[INLINED]"), `why_html for ${step.id}`);
  }
  assert.ok(out.steps[0].picture_html.endsWith("[INLINED]"));
  assert.ok(out.steps[0].example_html.endsWith("[INLINED]"));
});

test("inlineWalkHtml leaves absent optional fields absent", async () => {
  const walk = sampleWalk(1);
  delete walk.steps[0].picture_html;
  delete walk.steps[0].example_html;
  const out = await inlineWalkHtml(walk, markerInliner);
  assert.equal(out.steps[0].picture_html, undefined);
  assert.equal(out.steps[0].example_html, undefined);
});

test("inlineWalkHtml also covers asked sub-steps in the array", async () => {
  const walk = sampleWalk(1);
  walk.steps.push({
    id: "s1-a1", parent: "s1", asked: true, name: "Q", takeaway: "T",
    body_html: "<p>a</p>", slower_html: "", why_html: "", sources: [],
  });
  const out = await inlineWalkHtml(walk, markerInliner);
  assert.ok(out.steps[1].body_html.endsWith("[INLINED]"));
});

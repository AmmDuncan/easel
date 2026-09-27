import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWalkInput, WALK_LIMITS } from "../../dist/walk-types.js";

export function sampleWalk(n = 3) {
  const steps = Array.from({ length: n }, (_, i) => ({
    id: `s${i + 1}`, name: `Step ${i + 1}`, takeaway: `Takeaway ${i + 1}`,
    body_html: "<p>body</p>", slower_html: "<p>slower</p>", why_html: "<p>why</p>",
    sources: [{ label: "spec", ref: "docs/spec.md#x" }],
  }));
  return {
    title: "Waivers TRD", kind: "trd",
    orient: {
      question: "How does a waiver move?", answer: "Officer drafts, supervisor approves, ledger updates.",
      minutes: 6, map: steps.map((s) => ({ stepId: s.id, name: s.name, takeaway: s.takeaway, suggested: true })),
    },
    steps, check: [{ prompt: "Who approves?", expected: "Supervisor" }],
    recap: ["Supervisor approves"], actions: ["Read the API contract"], sources: [{ label: "spec", ref: "docs/spec.md" }],
  };
}

test("accepts a valid walk", () => {
  const r = parseWalkInput(sampleWalk());
  assert.equal(r.ok, true);
});

test("refuses more than 12 steps with a readable reason", () => {
  const r = parseWalkInput(sampleWalk(WALK_LIMITS.steps + 1));
  assert.equal(r.ok, false);
  assert.match(r.error, /steps/);
});

test("refuses a map entry pointing at a missing step", () => {
  const w = sampleWalk();
  w.orient.map[0].stepId = "nope";
  const r = parseWalkInput(w);
  assert.equal(r.ok, false);
  assert.match(r.error, /nope/);
});

test("refuses duplicate step ids", () => {
  const w = sampleWalk();
  w.steps[1].id = "s1";
  const r = parseWalkInput(w);
  assert.equal(r.ok, false);
  assert.match(r.error, /duplicate/i);
});

test("refuses more than 3 check prompts", () => {
  const w = sampleWalk();
  w.check = Array.from({ length: 4 }, () => ({ prompt: "p", expected: "e" }));
  assert.equal(parseWalkInput(w).ok, false);
});

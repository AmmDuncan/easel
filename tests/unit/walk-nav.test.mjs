import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultPicked, liveSummary, minutesFor, pickedOrder, progressRatio, rowSummary, topSteps } from "../../src/client/walk-nav.js";

const walk = {
  orient: {
    minutes: 5,
    map: [
      { stepId: "a", suggested: true }, { stepId: "b", suggested: false }, { stepId: "c", suggested: true },
      { stepId: "d", suggested: true }, { stepId: "e", suggested: true }, { stepId: "f", suggested: false },
      { stepId: "g", suggested: true },
    ],
  },
  steps: ["a", "b", "c", "d", "e", "f", "g"].map((id) => ({ id, name: id.toUpperCase() })),
};

test("answer sub-steps are not top-level steps", () => {
  const withAnswer = { ...walk, steps: [...walk.steps.slice(0, 2), { id: "b1", parent: "b", name: "Answer" }, ...walk.steps.slice(2)] };
  assert.equal(topSteps(withAnswer).length, 7);
});

test("default pick is the suggested steps, or all when none are suggested", () => {
  assert.deepEqual(defaultPicked(walk), ["a", "c", "d", "e", "g"]);
  const none = { ...walk, orient: { ...walk.orient, map: walk.orient.map.map((m) => ({ ...m, suggested: false })) } };
  assert.equal(defaultPicked(none).length, 7);
});

test("picked order follows the walk, not the pick order", () => {
  assert.deepEqual(pickedOrder(walk, ["g", "a"]).map((s) => s.id), ["a", "g"]);
});

test("minutes scale with steps and never drop under 1", () => {
  assert.equal(minutesFor(walk, 7), 5);
  assert.equal(minutesFor(walk, 5), 4);
  assert.equal(minutesFor(walk, 1), 1);
  assert.equal(minutesFor(walk, 0), 1);
});

test("a step missing from the orient map is picked by default", () => {
  const extra = { ...walk, steps: [...walk.steps, { id: "h", name: "H" }] };
  assert.deepEqual(defaultPicked(extra), ["a", "c", "d", "e", "g", "h"]);
});

test("a walk with no steps still reports at least 1 minute", () => {
  assert.equal(minutesFor({ ...walk, steps: [] }, 0), 1);
});

const five = ["a", "c", "d", "e", "g"];

test("live summary reports the picked step and the time left from it", () => {
  assert.deepEqual(liveSummary(walk, { stage: "walk", picked: five, current: 0 }), { stage: "walk", step: 1, of: 5, stepName: "A", minutesLeft: 4 });
  assert.deepEqual(liveSummary(walk, { stage: "walk", picked: five, current: 4 }), { stage: "walk", step: 5, of: 5, stepName: "G", minutesLeft: 1 });
});

test("live summary clamps the current index on both sides", () => {
  assert.deepEqual(liveSummary(walk, { picked: five, current: -3 }), { stage: "walk", step: 1, of: 5, stepName: "A", minutesLeft: 4 });
  assert.deepEqual(liveSummary(walk, { picked: [], current: 99 }), { stage: "walk", step: 5, of: 5, stepName: "G", minutesLeft: 1 });
});

test("live summary on Orient or Say it back names the stage, not a step", () => {
  assert.deepEqual(liveSummary(walk, { stage: "orient", picked: five, current: 2 }), { stage: "orient", step: 0, of: 5, stepName: "", minutesLeft: 4 });
  assert.deepEqual(liveSummary(walk, { stage: "check", picked: five, current: 4 }), { stage: "check", step: 5, of: 5, stepName: "", minutesLeft: 0 });
});

test("live summary falls back to every step when the picked ids no longer exist", () => {
  assert.deepEqual(liveSummary(walk, { picked: ["zz"], current: 0 }), { stage: "walk", step: 1, of: 7, stepName: "A", minutesLeft: 5 });
});

test("progress ratio is 0 for an empty walk and exact otherwise", () => {
  assert.equal(progressRatio(0, 0), 0);
  assert.equal(progressRatio(1, 5), 0.2);
  assert.equal(progressRatio(5, 5), 1);
});

test("row summary maps a list row onto the live summary shape, stage first", () => {
  assert.deepEqual(rowSummary({ stage: "walk", current: 2, steps: 5 }), { stage: "walk", step: 3, of: 5, stepName: "", minutesLeft: null });
  assert.deepEqual(rowSummary({ stage: "walk", current: 9, steps: 5 }), { stage: "walk", step: 5, of: 5, stepName: "", minutesLeft: null });
  assert.deepEqual(rowSummary({ stage: "check", current: 3, steps: 5 }), { stage: "check", step: 5, of: 5, stepName: "", minutesLeft: null });
  assert.deepEqual(rowSummary({ stage: "orient", current: 3, steps: 5 }), { stage: "orient", step: 0, of: 5, stepName: "", minutesLeft: null });
});

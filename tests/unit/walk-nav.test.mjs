import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultPicked, liveSummary, minutesFor, pickedOrder, topSteps } from "../../src/client/walk-nav.js";

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

test("live summary reports the picked step and the time left from it", () => {
  const s = liveSummary(walk, { picked: ["a", "c", "d", "e", "g"], current: 0 });
  assert.deepEqual(s, { step: 1, of: 5, stepName: "A", minutesLeft: 4 });
  const last = liveSummary(walk, { picked: ["a", "c", "d", "e", "g"], current: 4 });
  assert.deepEqual(last, { step: 5, of: 5, stepName: "G", minutesLeft: 1 });
});

test("live summary clamps a stale current index and falls back to the default pick", () => {
  assert.equal(liveSummary(walk, { picked: [], current: 99 }).step, 5);
});

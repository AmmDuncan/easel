import { test } from "node:test";
import assert from "node:assert/strict";
import { walkOpenAction } from "../../dist/mcp.js";

test("panel listening -> no open", () => {
  assert.equal(walkOpenAction(1, true), "none");
  assert.equal(walkOpenAction(2, false), "none");
});

test("no listener, panel built -> launch panel", () => {
  assert.equal(walkOpenAction(0, true), "launch-panel");
});

test("no listener, no panel -> browser fallback", () => {
  assert.equal(walkOpenAction(0, false), "open-browser");
});

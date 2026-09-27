import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const LINT = join(ROOT, "skills", "walk", "walk-lint.mjs");
const HISTORY = join(ROOT, "skills", "walk", "walk-history.mjs");
const FIXTURES = join(ROOT, "tests", "fixtures");

function runLint(fixture) {
  return spawnSync("node", [LINT, join(FIXTURES, fixture)], { encoding: "utf-8" });
}

function runHistory(args, env) {
  return spawnSync("node", [HISTORY, ...args], { encoding: "utf-8", env: { ...process.env, ...env } });
}

test("lint: valid walk fixture passes", () => {
  const r = runLint("walk-how-walks-work.json");
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "WALK OK");
});

test("lint: rejects 13 steps", () => {
  const r = runLint("walk-bad-too-many-steps.json");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /steps: 13 steps, must be 1\.\.12/);
});

test("lint: rejects 2-sentence takeaway", () => {
  const r = runLint("walk-bad-two-sentence-takeaway.json");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /step arrive: takeaway is 2 sentences/);
});

test("lint: rejects <script> in body_html", () => {
  const r = runLint("walk-bad-script.json");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /<script/);
});

test("lint: rejects onerror= attribute", () => {
  const r = runLint("walk-bad-onerror.json");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /on\*= attribute/);
});

test("lint: rejects missing source", () => {
  const r = runLint("walk-bad-missing-source.json");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /needs at least 1 source/);
});

test("lint: rejects 5-column compare table", () => {
  const r = runLint("walk-bad-wide-table.json");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /wk-compare table has 5 columns, max 4/);
});

test("lint: rejects 20-word answer", () => {
  const r = runLint("walk-bad-long-answer.json");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /orient\.answer: 20 words, max 15/);
});

test("lint: rejects map stepId that doesn't exist", () => {
  const r = runLint("walk-bad-missing-map-target.json");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /stepId "does-not-exist" matches no step/);
});

test("history: empty history is FRESH", () => {
  const dir = mkdtempSync(join(tmpdir(), "walk-history-"));
  const historyFile = join(dir, "walk-history.jsonl");
  try {
    const r = runHistory(["check", join(FIXTURES, "walk-how-walks-work.json")], { WALK_HISTORY: historyFile });
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), "FRESH");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("history: different title, same shape sequence -> STALE", async () => {
  const dir = mkdtempSync(join(tmpdir(), "walk-history-"));
  const historyFile = join(dir, "walk-history.jsonl");
  try {
    const walkFile = join(FIXTURES, "walk-how-walks-work.json");
    const add = runHistory(["add", walkFile], { WALK_HISTORY: historyFile });
    assert.equal(add.status, 0);

    // Same picture shapes, different title.
    const renamed = join(dir, "renamed-walk.json");
    const fs = await import("node:fs");
    const walk = JSON.parse(fs.readFileSync(walkFile, "utf-8"));
    walk.title = "A totally different title";
    fs.writeFileSync(renamed, JSON.stringify(walk));

    const check = runHistory(["check", renamed], { WALK_HISTORY: historyFile });
    assert.equal(check.status, 1);
    assert.match(check.stdout, /^STALE: same picture shapes as "How walks work"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("history: different shape sequence -> FRESH", async () => {
  const dir = mkdtempSync(join(tmpdir(), "walk-history-"));
  const historyFile = join(dir, "walk-history.jsonl");
  try {
    const walkFile = join(FIXTURES, "walk-how-walks-work.json");
    const add = runHistory(["add", walkFile], { WALK_HISTORY: historyFile });
    assert.equal(add.status, 0);

    const fs = await import("node:fs");
    const walk = JSON.parse(fs.readFileSync(walkFile, "utf-8"));
    walk.title = "Different title, different shapes";
    walk.steps = walk.steps.map((s) => ({ ...s, picture_html: "<div class=\"wk-stats\"></div>" }));
    const differentShapes = join(dir, "different-shapes-walk.json");
    fs.writeFileSync(differentShapes, JSON.stringify(walk));

    const check = runHistory(["check", differentShapes], { WALK_HISTORY: historyFile });
    assert.equal(check.status, 0);
    assert.equal(check.stdout.trim(), "FRESH");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("history: same title -> FRESH even with same shapes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "walk-history-"));
  const historyFile = join(dir, "walk-history.jsonl");
  try {
    const walkFile = join(FIXTURES, "walk-how-walks-work.json");
    const add = runHistory(["add", walkFile], { WALK_HISTORY: historyFile });
    assert.equal(add.status, 0);

    const check = runHistory(["check", walkFile], { WALK_HISTORY: historyFile });
    assert.equal(check.status, 0);
    assert.equal(check.stdout.trim(), "FRESH");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createWalk, findWalk, saveProgress, listProjects, listWalks, readJson, writeJson } from "../../dist/walk-store.js";
import { sampleWalk } from "./walk-validate.test.mjs";

const proj = { slug: "dvla", label: "dvla", path: "/x/dvla" };
const meta = { sessionId: null, cwd: "/x/dvla" };

test("create then find returns the walk with fresh waiting progress", () => {
  const root = mkdtempSync(join(tmpdir(), "walks-"));
  const w = createWalk(root, sampleWalk(), proj, meta);
  const got = findWalk(root, w.id);
  assert.equal(got.walk.title, "Waivers TRD");
  assert.equal(got.progress.stage, "orient");
  assert.equal(got.progress.startedAt, null);
  assert.equal(got.progress.current, 0);
});

test("progress merges and bumps updatedAt", () => {
  const root = mkdtempSync(join(tmpdir(), "walks-"));
  const w = createWalk(root, sampleWalk(), proj, meta);
  const p = saveProgress(root, w.id, { stage: "walk", current: 2, startedAt: 1, steps: { s1: "got" } });
  assert.equal(p.current, 2);
  assert.equal(p.steps.s1, "got");
  assert.equal(findWalk(root, w.id).progress.current, 2);
});

test("finishedAt is set once on done, survives later ticks, and clears on leaving done", () => {
  const root = mkdtempSync(join(tmpdir(), "walks-"));
  const w = createWalk(root, sampleWalk(), proj, meta);
  assert.equal(saveProgress(root, w.id, { stage: "walk", startedAt: 1 }).finishedAt, null);
  const done = saveProgress(root, w.id, { stage: "done" });
  assert.equal(typeof done.finishedAt, "number");
  writeJson(join(root, "dvla", `${w.id}.progress.json`), { ...done, finishedAt: 5 });
  const ticked = saveProgress(root, w.id, { actionsDone: [0] });
  assert.equal(ticked.finishedAt, 5);
  assert.notEqual(ticked.updatedAt, 5);
  assert.equal(listWalks(root, "dvla")[0].finishedAt, 5);
  assert.equal(saveProgress(root, w.id, { stage: "check" }).finishedAt, null);
});

test("progress for unknown id writes nothing", () => {
  const root = mkdtempSync(join(tmpdir(), "walks-"));
  assert.equal(saveProgress(root, "w_nope", { current: 1 }), null);
  assert.deepEqual(readdirSync(root), []);
});

test("project summary counts waiting / in progress / done and lists resume rows", () => {
  const root = mkdtempSync(join(tmpdir(), "walks-"));
  const a = createWalk(root, sampleWalk(), proj, meta);
  const b = createWalk(root, sampleWalk(), proj, meta);
  createWalk(root, sampleWalk(), proj, meta);
  saveProgress(root, a.id, { stage: "walk", startedAt: 1, current: 1 });
  saveProgress(root, b.id, { stage: "done", startedAt: 1 });
  const [s] = listProjects(root);
  assert.equal(s.slug, "dvla");
  assert.deepEqual([s.waiting, s.inProgress, s.done], [1, 1, 1]);
  assert.deepEqual(s.resume.map((r) => [r.walkId, r.step, r.total]), [[a.id, 1, 3]]);
});

test("empty root lists no projects; unknown slug lists null", () => {
  const root = mkdtempSync(join(tmpdir(), "walks-"));
  assert.deepEqual(listProjects(root), []);
  assert.equal(listWalks(root, "nope"), null);
});

test("store root does not live under sessions (sweeper cannot reach it)", () => {
  const root = mkdtempSync(join(tmpdir(), "walks-"));
  createWalk(root, sampleWalk(), proj, meta);
  assert.ok(existsSync(join(root, "dvla", "project.json")));
});

test("resume total counts only picked steps; open actions count done walks' unticked actions", () => {
  const root = mkdtempSync(join(tmpdir(), "walks-"));
  const w = sampleWalk(5);
  w.actions = ["a", "b", "c"];
  const inProg = createWalk(root, w, proj, meta);
  const finished = createWalk(root, w, proj, meta);
  saveProgress(root, inProg.id, { stage: "walk", startedAt: 1, current: 1, picked: ["s1", "s3"] });
  saveProgress(root, finished.id, { stage: "done", startedAt: 1, actionsDone: [0] });
  const [s] = listProjects(root);
  assert.deepEqual(s.resume.map((r) => [r.step, r.total]), [[1, 2]]);
  assert.equal(s.openActions, 2);
  const summaries = listWalks(root, "dvla");
  assert.equal(summaries.find((x) => x.id === inProg.id).steps, 2);
  assert.equal(summaries.find((x) => x.id === finished.id).openActions, 2);
  assert.equal(summaries.find((x) => x.id === inProg.id).openActions, 0);
});

test("writeJson leaves no .tmp- file behind and the target is valid JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "walks-atomic-"));
  const file = join(dir, "x.json");
  writeJson(file, { a: 1 });
  const names = readdirSync(dir);
  assert.deepEqual(names, ["x.json"]);
  assert.deepEqual(readJson(file), { a: 1 });
});

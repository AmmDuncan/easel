import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createWalk, findWalk, listProjects, listWalks, saveProgress, readJson, writeJson } from "../../dist/walk-store.js";
import {
  trashWalk, restoreTrash, moveWalk, renameProject, clearDone, trashProject, sweepWalks,
} from "../../dist/walk-cleanup.js";
import { sampleWalk } from "./walk-validate.test.mjs";

const proj = { slug: "dvla", label: "dvla", path: "/x/dvla" };
const other = { slug: "easel", label: "easel", path: "/x/easel" };
const meta = { sessionId: null, cwd: "/x/dvla" };

function freshRoot() {
  return mkdtempSync(join(tmpdir(), "walks-cleanup-"));
}

test("delete then restore returns byte-identical walk and progress files", () => {
  const root = freshRoot();
  const w = createWalk(root, sampleWalk(), proj, meta);
  const walkPath = join(root, "dvla", `${w.id}.json`);
  const progressPath = join(root, "dvla", `${w.id}.progress.json`);
  const beforeWalk = readFileSync(walkPath, "utf-8");
  const beforeProgress = readFileSync(progressPath, "utf-8");

  const trashId = trashWalk(root, w.id);
  assert.ok(trashId);
  assert.equal(existsSync(walkPath), false);

  const restored = restoreTrash(root, trashId);
  assert.deepEqual(restored, { restored: [w.id] });
  assert.equal(readFileSync(walkPath, "utf-8"), beforeWalk);
  assert.equal(readFileSync(progressPath, "utf-8"), beforeProgress);
});

test("restoring the same trash id twice: second is not-found", () => {
  const root = freshRoot();
  const w = createWalk(root, sampleWalk(), proj, meta);
  const trashId = trashWalk(root, w.id);
  assert.deepEqual(restoreTrash(root, trashId), { restored: [w.id] });
  assert.equal(restoreTrash(root, trashId), "not-found");
});

test("restoring when the target already exists is a conflict", () => {
  const root = freshRoot();
  const w = createWalk(root, sampleWalk(), proj, meta);
  const trashId = trashWalk(root, w.id);
  // recreate a walk at the same path so the restore target collides
  writeJson(join(root, "dvla", `${w.id}.json`), { id: w.id, project: "dvla" });
  assert.equal(restoreTrash(root, trashId), "conflict");
});

test("trashWalk on an unknown walk returns null", () => {
  const root = freshRoot();
  assert.equal(trashWalk(root, "w_nope"), null);
});

test("moveWalk relocates a walk to another project", () => {
  const root = freshRoot();
  createWalk(root, sampleWalk(), other, meta); // ensure "easel" project exists
  const w = createWalk(root, sampleWalk(), proj, meta);
  const result = moveWalk(root, w.id, "easel");
  assert.deepEqual(result, { project: "easel" });
  assert.equal(existsSync(join(root, "dvla", `${w.id}.json`)), false);
  assert.equal(existsSync(join(root, "easel", `${w.id}.json`)), true);
  const found = findWalk(root, w.id);
  assert.equal(found.walk.project, "easel");
});

test("moveWalk to an unknown project reports the error", () => {
  const root = freshRoot();
  const w = createWalk(root, sampleWalk(), proj, meta);
  assert.equal(moveWalk(root, w.id, "nope"), "unknown-project");
});

test("moveWalk of an unknown walk reports the error", () => {
  const root = freshRoot();
  createWalk(root, sampleWalk(), other, meta);
  assert.equal(moveWalk(root, "w_nope", "easel"), "unknown-walk");
});

test("renameProject validates length and updates the label", () => {
  const root = freshRoot();
  createWalk(root, sampleWalk(), proj, meta);
  assert.equal(renameProject(root, "dvla", ""), "invalid");
  assert.equal(renameProject(root, "dvla", "x".repeat(61)), "invalid");
  const ok = renameProject(root, "dvla", "DVLA");
  assert.equal(ok.label, "DVLA");
  assert.equal(ok.slug, "dvla");
  assert.equal(renameProject(root, "nope", "X"), "unknown");
});

test("clearDone moves only done walks into one trash entry and returns the count", () => {
  const root = freshRoot();
  const a = createWalk(root, sampleWalk(), proj, meta);
  const b = createWalk(root, sampleWalk(), proj, meta);
  const c = createWalk(root, sampleWalk(), proj, meta);
  saveProgress(root, a.id, { stage: "done", startedAt: 1 });
  saveProgress(root, b.id, { stage: "done", startedAt: 1 });
  saveProgress(root, c.id, { stage: "walk", startedAt: 1, current: 1 });

  const result = clearDone(root, "dvla");
  assert.equal(result.count, 2);
  assert.ok(result.trashId);
  assert.equal(existsSync(join(root, "dvla", `${a.id}.json`)), false);
  assert.equal(existsSync(join(root, "dvla", `${b.id}.json`)), false);
  assert.equal(existsSync(join(root, "dvla", `${c.id}.json`)), true);
});

test("clearDone with nothing to clear returns a null trashId and zero count", () => {
  const root = freshRoot();
  const a = createWalk(root, sampleWalk(), proj, meta);
  saveProgress(root, a.id, { stage: "walk", startedAt: 1, current: 1 });
  assert.deepEqual(clearDone(root, "dvla"), { trashId: null, count: 0 });
});

test("trashProject removes the project from listProjects; restore brings it back", () => {
  const root = freshRoot();
  createWalk(root, sampleWalk(), proj, meta);
  assert.equal(listProjects(root).some((p) => p.slug === "dvla"), true);

  const trashId = trashProject(root, "dvla");
  assert.ok(trashId);
  assert.equal(listProjects(root).some((p) => p.slug === "dvla"), false);

  const restored = restoreTrash(root, trashId);
  assert.deepEqual(restored, { restored: ["dvla"] });
  assert.equal(listProjects(root).some((p) => p.slug === "dvla"), true);
});

test("sweepWalks purges a stale trash entry, expires a 91-day-done walk, keeps a 91-day-waiting walk", () => {
  const root = freshRoot();
  const done = createWalk(root, sampleWalk(), proj, meta);
  const waiting = createWalk(root, sampleWalk(), proj, meta);
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  // 91-day-old done walk
  saveProgress(root, done.id, { stage: "done", startedAt: now - 91 * day });
  const doneProgressPath = join(root, "dvla", `${done.id}.progress.json`);
  const doneProgress = readJson(doneProgressPath);
  writeJson(doneProgressPath, { ...doneProgress, updatedAt: now - 91 * day });

  // 91-day-old waiting walk (never started) -- must be kept regardless of age
  const waitingProgressPath = join(root, "dvla", `${waiting.id}.progress.json`);
  const waitingProgress = readJson(waitingProgressPath);
  writeJson(waitingProgressPath, { ...waitingProgress, updatedAt: now - 91 * day });

  // 8-day-old trash entry
  const trashId = trashWalk(root, createWalk(root, sampleWalk(), proj, meta).id);
  const metaPath = join(root, ".trash", trashId, "meta.json");
  const trashMeta = readJson(metaPath);
  writeJson(metaPath, { ...trashMeta, at: now - 8 * day });

  const result = sweepWalks(root, now);
  assert.equal(result.purgedTrash, 1);
  assert.equal(result.expiredWalks, 1);
  assert.equal(existsSync(join(root, "dvla", `${done.id}.json`)), false);
  assert.equal(existsSync(join(root, "dvla", `${waiting.id}.json`)), true);
  assert.equal(existsSync(join(root, ".trash", trashId)), false);
});

test("trashProject/clearDone/renameProject/moveWalk reject traversal and unknown slugs", () => {
  const root = freshRoot();
  createWalk(root, sampleWalk(), proj, meta);
  assert.equal(trashProject(root, "../../etc"), null);
  assert.equal(clearDone(root, "../../etc"), "unknown");
  assert.equal(renameProject(root, "../../etc", "X"), "unknown");
  const w = createWalk(root, sampleWalk(), proj, meta);
  assert.equal(moveWalk(root, w.id, "../../etc"), "unknown-project");
});

test("restoreTrash rejects a malformed trashId", () => {
  const root = freshRoot();
  assert.equal(restoreTrash(root, "../../etc"), "not-found");
  assert.equal(restoreTrash(root, "not-a-trash-id"), "not-found");
});

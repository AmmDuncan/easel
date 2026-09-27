import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sampleWalk } from "./walk-validate.test.mjs";

const home = mkdtempSync(join(tmpdir(), "easel-cleanup-http-"));
const port = 20000 + Math.floor(Math.random() * 20000);
const base = `http://127.0.0.1:${port}`;
let child;
let token;

before(async () => {
  child = spawn(process.execPath, ["dist/http-entry.js"], {
    env: { ...process.env, HOME: home, EASEL_PORT: String(port) }, stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  token = readFileSync(join(home, ".easel", "token"), "utf-8").trim();
});

after(() => child.kill());

function withToken(headers = {}) {
  return { "content-type": "application/json", "x-easel-token": token, ...headers };
}

async function createWalk() {
  const r = await fetch(`${base}/api/walks`, {
    method: "POST", headers: withToken(), body: JSON.stringify({ walk: sampleWalk() }),
  });
  assert.equal(r.status, 201);
  return (await r.json()).id;
}

test("DELETE /api/walks/:id without token is 403", async () => {
  const id = await createWalk();
  const r = await fetch(`${base}/api/walks/${id}`, { method: "DELETE" });
  assert.equal(r.status, 403);
});

test("DELETE /api/walks/:id unknown is 404", async () => {
  const r = await fetch(`${base}/api/walks/w_nope`, { method: "DELETE", headers: withToken() });
  assert.equal(r.status, 404);
});

test("DELETE /api/walks/:id then restore round trip", async () => {
  const id = await createWalk();
  const del = await fetch(`${base}/api/walks/${id}`, { method: "DELETE", headers: withToken() });
  assert.equal(del.status, 200);
  const { trashId } = await del.json();
  assert.ok(trashId);

  const restore = await fetch(`${base}/api/trash/${trashId}/restore`, { method: "POST", headers: withToken() });
  assert.equal(restore.status, 200);
  assert.deepEqual((await restore.json()).restored, [id]);
});

test("POST /api/trash/:id/restore unknown is 404", async () => {
  const r = await fetch(`${base}/api/trash/t_nope/restore`, { method: "POST", headers: withToken() });
  assert.equal(r.status, 404);
});

test("POST /api/walks/:id/move without token is 403", async () => {
  const id = await createWalk();
  const r = await fetch(`${base}/api/walks/${id}/move`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project: "dvla" }),
  });
  assert.equal(r.status, 403);
});

test("POST /api/walks/:id/move to an unknown project is 404", async () => {
  const id = await createWalk();
  const r = await fetch(`${base}/api/walks/${id}/move`, {
    method: "POST", headers: withToken(), body: JSON.stringify({ project: "nope" }),
  });
  assert.equal(r.status, 404);
});

test("POST /api/walks/:id/move to its current project is a 200 no-op", async () => {
  const id = await createWalk(); // lands in "misc" (no cwd)
  const r = await fetch(`${base}/api/walks/${id}/move`, {
    method: "POST", headers: withToken(), body: JSON.stringify({ project: "misc" }),
  });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).project, "misc");
});

test("PATCH /api/projects/:slug without token is 403", async () => {
  await createWalk();
  const r = await fetch(`${base}/api/projects/misc`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ label: "X" }),
  });
  assert.equal(r.status, 403);
});

test("PATCH /api/projects/:slug bad label is 400", async () => {
  await createWalk();
  const r = await fetch(`${base}/api/projects/misc`, {
    method: "PATCH", headers: withToken(), body: JSON.stringify({ label: "" }),
  });
  assert.equal(r.status, 400);
});

test("PATCH /api/projects/:slug unknown project is 404", async () => {
  const r = await fetch(`${base}/api/projects/nope`, {
    method: "PATCH", headers: withToken(), body: JSON.stringify({ label: "X" }),
  });
  assert.equal(r.status, 404);
});

test("PATCH /api/projects/:slug renames the label", async () => {
  await createWalk();
  const r = await fetch(`${base}/api/projects/misc`, {
    method: "PATCH", headers: withToken(), body: JSON.stringify({ label: "Misc renamed" }),
  });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).label, "Misc renamed");
});

test("POST /api/projects/:slug/clear-done without token is 403", async () => {
  const r = await fetch(`${base}/api/projects/misc/clear-done`, { method: "POST" });
  assert.equal(r.status, 403);
});

test("POST /api/projects/:slug/clear-done unknown project is 404", async () => {
  const r = await fetch(`${base}/api/projects/nope-project/clear-done`, { method: "POST", headers: withToken() });
  assert.equal(r.status, 404);
});

test("POST /api/projects/:slug/clear-done with none done returns zero count", async () => {
  await createWalk();
  const r = await fetch(`${base}/api/projects/misc/clear-done`, { method: "POST", headers: withToken() });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.trashId, null);
  assert.equal(j.count, 0);
});

test("DELETE /api/projects/:slug without token is 403", async () => {
  const r = await fetch(`${base}/api/projects/misc`, { method: "DELETE" });
  assert.equal(r.status, 403);
});

test("DELETE /api/projects/:slug unknown is 404", async () => {
  const r = await fetch(`${base}/api/projects/never-existed`, { method: "DELETE", headers: withToken() });
  assert.equal(r.status, 404);
});

test("DELETE /api/projects/:slug trashes the project then restore brings it back", async () => {
  const id = await createWalk();
  const cwd = join(home, "work/studios/dvla-clear-me");
  const r2 = await fetch(`${base}/api/walks`, {
    method: "POST", headers: withToken(), body: JSON.stringify({ cwd, walk: sampleWalk() }),
  });
  const { project } = await r2.json();

  const del = await fetch(`${base}/api/projects/${project}`, { method: "DELETE", headers: withToken() });
  assert.equal(del.status, 200);
  const { trashId } = await del.json();
  assert.ok(trashId);

  const list = await (await fetch(`${base}/api/projects`)).json();
  assert.equal(list.some((p) => p.slug === project), false);

  const restore = await fetch(`${base}/api/trash/${trashId}/restore`, { method: "POST", headers: withToken() });
  assert.equal(restore.status, 200);
  assert.deepEqual((await restore.json()).restored, [project]);
  // the very first walk (`id`) is untouched by this project's delete/restore
  const got = await (await fetch(`${base}/api/walks/${id}`)).json();
  assert.ok(got.walk);
});

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sampleWalk } from "./walk-validate.test.mjs";

const home = mkdtempSync(join(tmpdir(), "easel-http-"));
const port = 20000 + Math.floor(Math.random() * 20000);
const base = `http://127.0.0.1:${port}`;
let child;
let token;

before(async () => {
  child = spawn(process.execPath, ["dist/http-entry.js"], {
    env: { ...process.env, HOME: home, EASEL_PORT: String(port) }, stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const panel = await (await fetch(`${base}/panel`)).text();
  token = readFileSync(join(home, ".easel", "token"), "utf-8").trim();
  assert.ok(panel.includes(token), "panel html carries the token");
});

after(() => child.kill());

const post = (body, headers = {}) => fetch(`${base}/api/walks`, {
  method: "POST", headers: { "content-type": "application/json", "x-easel-token": token, ...headers },
  body: JSON.stringify(body),
});

test("POST without token is 403 and stores nothing", async () => {
  const r = await fetch(`${base}/api/walks`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ walk: sampleWalk() }),
  });
  assert.equal(r.status, 403);
  assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
});

test("POST from a foreign origin is 403 even with token", async () => {
  const r = await post({ walk: sampleWalk() }, { origin: "https://evil.example" });
  assert.equal(r.status, 403);
});

test("invalid walk is 400 with reason", async () => {
  const r = await post({ walk: sampleWalk(13) });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /steps/);
});

test("create -> global event -> list -> progress round trip", async () => {
  const ctrl = new AbortController();
  const ev = await fetch(`${base}/events`, { signal: ctrl.signal });
  const reader = ev.body.getReader();
  const cwd = join(home, "work/studios/dvla/dvla-self-service");
  const r = await post({ cwd, walk: sampleWalk() });
  assert.equal(r.status, 201);
  const { id, project, url, globalClients } = await r.json();
  assert.equal(project, "dvla");
  assert.equal(url, `/panel/w/${id}`);
  assert.equal(globalClients, 1);
  let text = "";
  while (!text.includes("event: walk")) {
    const { value } = await reader.read();
    text += new TextDecoder().decode(value);
  }
  assert.match(text, new RegExp(id));
  ctrl.abort();

  const projects = await (await fetch(`${base}/api/projects`)).json();
  assert.equal(projects[0].slug, "dvla");
  assert.equal(projects[0].waiting, 1);

  const put = await fetch(`${base}/api/walks/${id}/progress`, {
    method: "PUT", headers: { "content-type": "application/json", "x-easel-token": token },
    body: JSON.stringify({ stage: "walk", startedAt: Date.now(), current: 1 }),
  });
  assert.equal((await put.json()).current, 1);
  const got = await (await fetch(`${base}/api/walks/${id}`)).json();
  assert.equal(got.progress.current, 1);
});

test("progress for unknown walk is 404", async () => {
  const r = await fetch(`${base}/api/walks/w_nope/progress`, {
    method: "PUT", headers: { "content-type": "application/json", "x-easel-token": token },
    body: JSON.stringify({ current: 1 }),
  });
  assert.equal(r.status, 404);
});

test("global /events clients are not counted as session tabs by /api/push", async () => {
  const ctrl = new AbortController();
  await fetch(`${base}/events`, { signal: ctrl.signal });
  const r = await fetch(`${base}/api/push`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: "s-test", html: "<p>x</p>" }),
  });
  const j = await r.json();
  assert.equal(j.otherTabs, 0);
  ctrl.abort();
});

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { sampleWalk } from "./walk-validate.test.mjs";

const FAKE_CLAUDE = fileURLToPath(new URL("../fixtures/fake-claude.mjs", import.meta.url));

async function startServer(mode) {
  const home = mkdtempSync(join(tmpdir(), "easel-ask-http-"));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["dist/http-entry.js"], {
    env: { ...process.env, HOME: home, EASEL_PORT: String(port), EASEL_CLAUDE_BIN: FAKE_CLAUDE, FAKE_CLAUDE_MODE: mode },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  const token = readFileSync(join(home, ".easel", "token"), "utf-8").trim();
  return { child, base, token };
}

async function createWalk(base, token) {
  const r = await fetch(`${base}/api/walks`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-easel-token": token },
    body: JSON.stringify({ walk: sampleWalk() }),
  });
  assert.equal(r.status, 201);
  return (await r.json()).id;
}

function ask(base, token, id, body, headers = {}) {
  return fetch(`${base}/api/walks/${id}/ask`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-easel-token": token, ...headers },
    body: JSON.stringify(body),
  });
}

let ok;
let fail;
let slow;

before(async () => {
  [ok, fail, slow] = await Promise.all([startServer("ok"), startServer("fail"), startServer("slow")]);
});

after(() => {
  ok.child.kill();
  fail.child.kill();
  slow.child.kill();
});

test("ask without token is 403", async () => {
  const id = await createWalk(ok.base, ok.token);
  const r = await fetch(`${ok.base}/api/walks/${id}/ask`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ stepId: "s1", question: "Why?" }),
  });
  assert.equal(r.status, 403);
});

test("empty question is 400", async () => {
  const id = await createWalk(ok.base, ok.token);
  const r = await ask(ok.base, ok.token, id, { stepId: "s1", question: "  " });
  assert.equal(r.status, 400);
});

test("unknown stepId is 400", async () => {
  const id = await createWalk(ok.base, ok.token);
  const r = await ask(ok.base, ok.token, id, { stepId: "nope", question: "Why?" });
  assert.equal(r.status, 400);
});

test("unknown walk is 404", async () => {
  const r = await ask(ok.base, ok.token, "w_nope", { stepId: "s1", question: "Why?" });
  assert.equal(r.status, 404);
});

test("ok ask inserts an answered sub-step after the parent, twice in a row", async () => {
  const id = await createWalk(ok.base, ok.token);
  const r1 = await ask(ok.base, ok.token, id, { stepId: "s1", question: "Does a second supervisor approve?" });
  assert.equal(r1.status, 200);
  const { step: step1 } = await r1.json();
  assert.equal(step1.id, "s1-a1");
  assert.equal(step1.parent, "s1");
  assert.equal(step1.asked, true);
  assert.equal(step1.takeaway, "No, a second supervisor must approve.");

  const r2 = await ask(ok.base, ok.token, id, { stepId: "s1", question: "Second question?" });
  assert.equal(r2.status, 200);
  const { step: step2 } = await r2.json();
  assert.equal(step2.id, "s1-a2");
  assert.equal(step2.parent, "s1");

  const got = await (await fetch(`${ok.base}/api/walks/${id}`)).json();
  const ids = got.walk.steps.map((s) => s.id);
  assert.deepEqual(ids, ["s1", "s1-a1", "s1-a2", "s2", "s3"]);
  assert.equal(got.walk.asks.length, 2);
  assert.equal(got.walk.asks[0].outcome, "ok");
  assert.ok(got.walk.asks[0].ms >= 0);
  assert.deepEqual(got.progress.picked, []);
});

test("fail mode returns 502, leaves steps unchanged, logs an error outcome", async () => {
  const id = await createWalk(fail.base, fail.token);
  const r = await ask(fail.base, fail.token, id, { stepId: "s1", question: "Why?" });
  assert.equal(r.status, 502);
  const got = await (await fetch(`${fail.base}/api/walks/${id}`)).json();
  assert.equal(got.walk.steps.length, 3);
  assert.equal(got.walk.asks.length, 1);
  assert.equal(got.walk.asks[0].outcome, "error");
});

test("after a 502 the ask lock is released for the next ask", async () => {
  const id = await createWalk(fail.base, fail.token);
  const r1 = await ask(fail.base, fail.token, id, { stepId: "s1", question: "First?" });
  assert.equal(r1.status, 502);
  const r2 = await ask(fail.base, fail.token, id, { stepId: "s1", question: "Second?" });
  assert.notEqual(r2.status, 409);
  assert.equal(r2.status, 502);
});

test("two asks fired at once on the same walk: exactly one 409", async () => {
  const id = await createWalk(slow.base, slow.token);
  const [r1, r2] = await Promise.all([
    ask(slow.base, slow.token, id, { stepId: "s1", question: "One?" }),
    ask(slow.base, slow.token, id, { stepId: "s1", question: "Two?" }),
  ]);
  const statuses = [r1.status, r2.status].sort();
  assert.deepEqual(statuses, [200, 409]);
});

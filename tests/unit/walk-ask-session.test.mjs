import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { SEND_ARGS, pickIdleSession, settleAnswer, startAnswerClock, waitForSessionAnswer } from "../../dist/walk-ask-session.js";
import { sampleWalk } from "./walk-validate.test.mjs";

const FAKE_CLAUDE = fileURLToPath(new URL("../fixtures/fake-claude.mjs", import.meta.url));
const SID = "11111111-2222-3333-4444-555555555555";
const row = (over = {}) => ({ sessionId: SID, name: "stock walk", pid: 42, status: "idle", ...over });

test("pickIdleSession returns the walk's session when it is live and idle", () => {
  assert.deepEqual(pickIdleSession(JSON.stringify([row()]), SID), { name: "stock walk", pid: 42 });
});

test("pickIdleSession reads the { agents: [...] } form too", () => {
  assert.deepEqual(pickIdleSession(JSON.stringify({ agents: [row()] }), SID), { name: "stock walk", pid: 42 });
});

test("pickIdleSession refuses a busy, pid-less, missing or ambiguous session", () => {
  assert.equal(pickIdleSession(JSON.stringify([row({ status: "busy" })]), SID), null);
  assert.equal(pickIdleSession(JSON.stringify([row({ pid: undefined })]), SID), null);
  assert.equal(pickIdleSession(JSON.stringify([row({ sessionId: "other" })]), SID), null);
  assert.equal(pickIdleSession(JSON.stringify([row(), row({ sessionId: "other" })]), SID), null);
  assert.equal(pickIdleSession("not json", SID), null);
});

test("a delivered answer resolves the wait; an unknown or settled id is refused", async () => {
  const answer = { takeaway: "Yes.", body_html: "<p>Yes.</p>", sources: [] };
  const waiting = waitForSessionAnswer("a1");
  assert.equal(settleAnswer("a1", answer), true);
  assert.deepEqual(await waiting, answer);
  assert.equal(settleAnswer("a1", answer), false);
});

test("the answer clock only runs once started, then resolves null", async () => {
  const waiting = waitForSessionAnswer("a2");
  startAnswerClock("a2", 20);
  assert.equal(await waiting, null);
  assert.equal(settleAnswer("a2", { takeaway: "late", body_html: "", sources: [] }), false);
});

test("pickIdleSession skips a session that is blocked waiting on Ammiel", () => {
  assert.equal(pickIdleSession(JSON.stringify([row({ state: "blocked" })]), SID), null);
  assert.deepEqual(pickIdleSession(JSON.stringify([row({ state: "done" })]), SID), { name: "stock walk", pid: 42 });
});

test("the send helper can only use SendMessage, with no MCP servers and no prompts", () => {
  assert.deepEqual(SEND_ARGS.slice(SEND_ARGS.indexOf("--tools"), SEND_ARGS.indexOf("--tools") + 2), ["--tools", "ToolSearch,SendMessage"]);
  assert.ok(SEND_ARGS.includes("--strict-mcp-config"));
  assert.equal(SEND_ARGS[SEND_ARGS.indexOf("--permission-mode") + 1], "dontAsk");
});

const servers = [];
after(() => servers.forEach((c) => c.kill()));

async function startServer(env, walkExtra = { canAnswer: true }) {
  const home = mkdtempSync(join(tmpdir(), "easel-ask-session-"));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["dist/http-entry.js"], {
    env: { ...process.env, HOME: home, EASEL_PORT: String(port), EASEL_CLAUDE_BIN: FAKE_CLAUDE, EASEL_ASK_SESSION: "", ...env },
    stdio: "ignore",
  });
  servers.push(child);
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  const token = readFileSync(join(home, ".easel", "token"), "utf-8").trim();
  const headers = { "content-type": "application/json", "x-easel-token": token };
  const created = await fetch(`${base}/api/walks`, { method: "POST", headers, body: JSON.stringify({ sessionId: SID, walk: sampleWalk(), ...walkExtra }) });
  const { id } = await created.json();
  const walk = await (await fetch(`${base}/api/walks/${id}`)).json();
  const stepId = (walk.walk ?? walk).steps[0].id;
  const ask = () => fetch(`${base}/api/walks/${id}/ask`, { method: "POST", headers, body: JSON.stringify({ stepId, question: "Why?" }) });
  return { base, headers, ask };
}

test("an idle originating session answers the question, marked as answered by the session", async () => {
  const s = await startServer({ FAKE_ROSTER: JSON.stringify([row()]), FAKE_SESSION: "answer" });
  const r = await s.ask();
  assert.equal(r.status, 200);
  const { step } = await r.json();
  assert.equal(step.takeaway, "From the session that made it.");
  assert.equal(step.answeredBy, "session");
});

test("a session that never answers falls back to the fresh call", async () => {
  const s = await startServer({ FAKE_ROSTER: JSON.stringify([row()]), FAKE_SESSION: "silent", EASEL_SESSION_ANSWER_MS: "300" });
  const { step } = await (await s.ask()).json();
  assert.equal(step.takeaway, "No, a second supervisor must approve.");
  assert.equal(step.answeredBy, undefined);
});

test("a busy session is skipped and the fresh call answers", async () => {
  const s = await startServer({ FAKE_ROSTER: JSON.stringify([row({ status: "busy" })]), FAKE_SESSION: "answer" });
  const { step } = await (await s.ask()).json();
  assert.equal(step.answeredBy, undefined);
});

test("a walk from an older easel (no walk_answer tool) never routes to its session", async () => {
  const s = await startServer({ FAKE_ROSTER: JSON.stringify([row()]), FAKE_SESSION: "answer" }, {});
  const { step } = await (await s.ask()).json();
  assert.equal(step.answeredBy, undefined);
});

test("an answer for a question nobody is waiting on is accepted but not delivered", async () => {
  const s = await startServer({});
  const r = await fetch(`${s.base}/api/asks/nope/answer`, {
    method: "POST",
    headers: s.headers,
    body: JSON.stringify({ takeaway: "x", body_html: "<p>x</p>" }),
  });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { delivered: false });
});

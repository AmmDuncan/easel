import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { ASK_ARGS, parseAskOutput, runAsk } from "../../dist/walk-ask.js";

const FAKE_CLAUDE = fileURLToPath(new URL("../fixtures/fake-claude.mjs", import.meta.url));

function okEnvelope(result) {
  return JSON.stringify({ type: "result", is_error: false, result });
}

test("ASK_ARGS is exactly the required arg array", () => {
  assert.deepEqual(ASK_ARGS, [
    "-p",
    "--model",
    "sonnet",
    "--output-format",
    "json",
    "--restricted",
    "--strict-mcp-config",
    "--tools",
    "Read,Grep,Glob",
    "--permission-mode",
    "dontAsk",
    "--no-session-persistence",
  ]);
});

test("parseAskOutput parses a fenced json block inside the result envelope", () => {
  const stdout = okEnvelope('```json\n{"takeaway":"t","body_html":"<p>b</p>","sources":[{"label":"L","ref":"R"}]}\n```');
  const parsed = parseAskOutput(stdout);
  assert.deepEqual(parsed, { takeaway: "t", body_html: "<p>b</p>", sources: [{ label: "L", ref: "R" }] });
});

test("parseAskOutput parses a bare {...} span in result", () => {
  const stdout = okEnvelope('here you go {"takeaway":"t","body_html":"<p>b</p>"} thanks');
  const parsed = parseAskOutput(stdout);
  assert.deepEqual(parsed, { takeaway: "t", body_html: "<p>b</p>", sources: [] });
});

test("parseAskOutput returns null on garbage", () => {
  assert.equal(parseAskOutput("not json"), null);
});

test("parseAskOutput returns null when is_error is true", () => {
  const stdout = JSON.stringify({ type: "result", is_error: true, result: "{}" });
  assert.equal(parseAskOutput(stdout), null);
});

test("parseAskOutput returns null when takeaway is missing", () => {
  const stdout = okEnvelope('{"body_html":"<p>b</p>"}');
  assert.equal(parseAskOutput(stdout), null);
});

// child_process.spawn() snapshots process.env synchronously when called, so
// it's enough to set the mode, call runAsk (which spawns before its first
// await), and restore the env right away — no need to wait for the child to
// finish, and no cross-test race via an async afterEach hook.
function withFakeClaudeMode(mode, fn) {
  const prev = process.env.FAKE_CLAUDE_MODE;
  process.env.FAKE_CLAUDE_MODE = mode;
  const promise = fn();
  if (prev === undefined) {
    delete process.env.FAKE_CLAUDE_MODE;
  } else {
    process.env.FAKE_CLAUDE_MODE = prev;
  }
  return promise;
}

test("runAsk ok with the fake claude in ok mode", async () => {
  const r = await withFakeClaudeMode("ok", () =>
    runAsk({ bin: FAKE_CLAUDE, cwd: process.cwd(), prompt: "hi", timeoutMs: 5000 }));
  assert.equal(r.ok, true);
  const parsed = parseAskOutput(r.stdout);
  assert.equal(parsed.takeaway, "No, a second supervisor must approve.");
});

test("runAsk fail mode returns ok:false containing stderr", async () => {
  const r = await withFakeClaudeMode("fail", () =>
    runAsk({ bin: FAKE_CLAUDE, cwd: process.cwd(), prompt: "hi", timeoutMs: 5000 }));
  assert.equal(r.ok, false);
  assert.match(r.error, /boom/);
});

test("runAsk hang mode times out", async () => {
  const start = Date.now();
  const r = await withFakeClaudeMode("hang", () =>
    runAsk({ bin: FAKE_CLAUDE, cwd: process.cwd(), prompt: "hi", timeoutMs: 300 }));
  assert.equal(r.ok, false);
  assert.equal(r.timeout, true);
  assert.ok(Date.now() - start < 2000);
});

test("runAsk with an unknown binary reports ok:false", async () => {
  const r = await runAsk({
    bin: join(tmpdir(), "definitely-not-a-real-binary-xyz"),
    cwd: process.cwd(),
    prompt: "hi",
    timeoutMs: 5000,
  });
  assert.equal(r.ok, false);
});

test("a question with shell metacharacters reaches the child verbatim on stdin", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ask-stdin-"));
  const out = join(dir, "stdin.txt");
  const nasty = '"; rm -rf ~ #';
  process.env.FAKE_CLAUDE_STDIN_OUT = out;
  const r = await withFakeClaudeMode("ok", () =>
    runAsk({ bin: FAKE_CLAUDE, cwd: process.cwd(), prompt: nasty, timeoutMs: 5000 }));
  delete process.env.FAKE_CLAUDE_STDIN_OUT;
  assert.equal(r.ok, true);
  assert.equal(readFileSync(out, "utf-8"), nasty);
});

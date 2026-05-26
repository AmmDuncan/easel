/**
 * Session-id resolution: the tier order that decides which easel session a tool
 * call belongs to. The regression these tests lock down: when a non-Claude-Code
 * MCP client (opencode, Cursor, …) runs in a cwd that ALSO holds Claude Code
 * transcripts, the tier-4 transcript scan must NOT fire — otherwise it latches
 * onto whichever transcript was touched last and the resolved session drifts on
 * every tool call. Run with `npm test` (builds first, then node --test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveClaudeSessionId } from "../../dist/session-id.js";

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

let clock = Math.floor(Date.now() / 1000) - 10_000;

function fakeHome(cwd) {
  const home = mkdtempSync(join(tmpdir(), "easel-home-"));
  const proj = join(home, ".claude", "projects", cwd.replace(/\//g, "-"));
  mkdirSync(proj, { recursive: true });
  writeFileSync(join(proj, `${A}.jsonl`), "{}");
  writeFileSync(join(proj, `${B}.jsonl`), "{}");
  // Baseline both to old, distinct times so only an explicit touch() after this
  // decides which is newest (writeFileSync stamps real-now, which would dominate).
  touch(proj, A);
  touch(proj, B);
  return { home, proj };
}
/** Mark `id` as the newest transcript with a strictly-increasing, whole-second mtime. */
function touch(proj, id) {
  clock += 100; // wide, distinct gaps so there are no second-resolution ties
  utimesSync(join(proj, `${id}.jsonl`), clock, clock);
}

const CWD = "/Users/x/work/proj";

test("non-CC client: stable id that does NOT drift when transcripts change", () => {
  const { home, proj } = fakeHome(CWD);
  const opts = { homeDir: home, cwd: CWD, ppid: 4242, env: {} };
  touch(proj, A);
  const first = resolveClaudeSessionId(opts);
  touch(proj, B); // a different transcript is now newest
  const second = resolveClaudeSessionId(opts);
  assert.equal(first, second, "id must not drift when the newest transcript changes");
  assert.notEqual(first, A);
  assert.notEqual(first, B, "must not adopt an unrelated CC transcript id");
});

test("non-CC client: same ppid → same id (survives MCP child restart)", () => {
  const { home } = fakeHome(CWD);
  const a = resolveClaudeSessionId({ homeDir: home, cwd: CWD, ppid: 999, env: {} });
  const b = resolveClaudeSessionId({ homeDir: home, cwd: CWD, ppid: 999, env: {} });
  assert.equal(a, b);
});

test("Claude Code (CLAUDECODE=1): tier-4 scan picks the newest transcript", () => {
  const { home, proj } = fakeHome(CWD);
  const opts = { homeDir: home, cwd: CWD, ppid: 4242, env: { CLAUDECODE: "1" } };
  touch(proj, A);
  assert.equal(resolveClaudeSessionId(opts), A);
  touch(proj, B);
  assert.equal(resolveClaudeSessionId(opts), B);
});

test("Claude Code via CLAUDE_CODE_ENTRYPOINT also enables the scan", () => {
  const { home, proj } = fakeHome(CWD);
  touch(proj, A);
  const opts = { homeDir: home, cwd: CWD, ppid: 4242, env: { CLAUDE_CODE_ENTRYPOINT: "cli" } };
  assert.equal(resolveClaudeSessionId(opts), A);
});

test("explicit EASEL_SESSION_ID overrides everything", () => {
  const { home } = fakeHome(CWD);
  const opts = { homeDir: home, cwd: CWD, ppid: 4242, env: { EASEL_SESSION_ID: "explicit-123", CLAUDECODE: "1" } };
  assert.equal(resolveClaudeSessionId(opts), "explicit-123");
});

test("CLAUDE_CODE_SESSION_ID env wins over transcript scan", () => {
  const { home, proj } = fakeHome(CWD);
  touch(proj, A);
  const opts = { homeDir: home, cwd: CWD, ppid: 4242, env: { CLAUDE_CODE_SESSION_ID: "cc-env-id", CLAUDECODE: "1" } };
  assert.equal(resolveClaudeSessionId(opts), "cc-env-id");
});

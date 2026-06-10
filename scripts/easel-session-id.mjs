#!/usr/bin/env node
// easel-session-id.mjs — SessionStart hook for Claude Code.
//
// Does three things:
//   1. Captures Claude's session_id (passed as JSON on stdin per the hooks
//      spec) into ~/.easel/hook/cc-session-<ppid>.txt so the easel MCP
//      adapter can resolve it by parent PID.
//   2. Outputs `additionalContext` JSON so the agent always sees the easel
//      conventions at the start of every chat — even when the chat never
//      triggers the using-easel skill via content shape.
//   3. Checks (cached, every 24h) whether the local install is behind
//      origin/main and appends an "updates available" line.
//
// Ported from bash to drop the jq dependency.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HOME = homedir();
const LEGACY_ROOT = join(HOME, ".claude-display");
const DATA_ROOT = join(HOME, ".easel");

// One-time migration from the project's prior name. Idempotent.
if (existsSync(LEGACY_ROOT) && !existsSync(DATA_ROOT)) {
  try {
    renameSync(LEGACY_ROOT, DATA_ROOT);
  } catch {
    // best-effort; downstream mkdir handles it
  }
}

function readStdinSync() {
  try {
    return readFileSync(0, "utf-8");
  } catch {
    return "";
  }
}

function parseSessionId(raw) {
  try {
    const obj = JSON.parse(raw);
    return typeof obj?.session_id === "string" ? obj.session_id : "";
  } catch {
    return "";
  }
}

const input = readStdinSync();
const sessionId = parseSessionId(input);

if (sessionId) {
  const hookDir = join(DATA_ROOT, "hook");
  mkdirSync(hookDir, { recursive: true });
  writeFileSync(join(hookDir, `cc-session-${process.ppid}.txt`), `${sessionId}\n`);
}

// Suppressed sessions (e.g. the ammiels-bot dispatcher tick set
// EASEL_SUPPRESS_SESSION=1) get NO convention reminder: the MCP no-ops every
// tool, so nagging the agent to label/push would only waste a tool call. Exit
// before emitting additionalContext.
if (process.env.EASEL_SUPPRESS_SESSION === "1") {
  process.exit(0);
}

// --- staleness check (cached, every 24h) ------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const INSTALL_DIR = resolve(__dirname, "..");
const CACHE_FILE = join(DATA_ROOT, "update-check");
const NOW = Math.floor(Date.now() / 1000);

function git(args, opts = {}) {
  const r = spawnSync("git", ["-C", INSTALL_DIR, ...args], {
    encoding: "utf-8",
    timeout: opts.timeoutMs ?? 800,
  });
  if (r.status !== 0) return "";
  return (r.stdout ?? "").trim();
}

let localSha = "";
let remoteSha = "";
if (existsSync(join(INSTALL_DIR, ".git"))) {
  localSha = git(["rev-parse", "HEAD"]);

  let lastCheck = 0;
  let lastRemote = "";
  if (existsSync(CACHE_FILE)) {
    try {
      const [line1 = "", line2 = ""] = readFileSync(CACHE_FILE, "utf-8").split("\n");
      lastCheck = Number.parseInt(line1, 10) || 0;
      lastRemote = line2.trim();
    } catch {
      // ignore — cache miss is fine
    }
  }

  if (NOW - lastCheck > 86400) {
    const lsRemote = git(["ls-remote", "origin", "main"], { timeoutMs: 2000 });
    remoteSha = lsRemote.split(/\s+/)[0] ?? "";
    if (remoteSha) {
      try {
        mkdirSync(DATA_ROOT, { recursive: true });
        writeFileSync(CACHE_FILE, `${NOW}\n${remoteSha}\n`);
      } catch {
        // best-effort cache write
      }
    }
  } else {
    remoteSha = lastRemote;
  }
}

const updateLine =
  localSha && remoteSha && localSha !== remoteSha
    ? "\n\nUPDATE AVAILABLE — local easel is behind origin/main. Run `easel update` to pull, build, and re-wire setup. Mention this to the user once if they bring up easel; otherwise it's just FYI."
    : "";

// --- additionalContext reminder ---------------------------------------------
const reminder = `easel is registered as an MCP for this session. Tools available:
mcp__easel__push, mcp__easel__open, mcp__easel__config, mcp__easel__label.

CONVENTION — label every session early.
Call mcp__easel__label({ label: "<short human name>" }) as soon as the
user's intent is clear in this chat, and NO LATER than your first
mcp__easel__push call. Sessions without labels show up as the cwd
basename in the switcher (e.g. "dvla"), which is unfindable when
multiple tabs are open. Re-call label when the work's theme shifts
meaningfully. Format: 1–8 words, sentence case, no trailing punctuation,
mention the artefact not the verb (good: "RegistrationNumberInput
extraction"; bad: "Extracting RegistrationNumberInput").

When pushing visual content (mockup, diagram, comparison, long
explanation, diff, multi-step status), use mcp__easel__push proactively
— do not ask permission. Reply in chat with one line: "pushed to easel
↗ — #N". The full style guide lives in the using-easel skill.${updateLine}`;

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: reminder,
    },
  }),
);

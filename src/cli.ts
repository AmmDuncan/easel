#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { ensureHttpServer } from "./server-manager.js";
import { resolveClaudeSessionId } from "./session-id.js";
import { HOOK_DIR, DATA_ROOT } from "./paths.js";
import { registerSession } from "./session-store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

function help() {
  console.log(`claude-display — live browser feed for Claude Code sessions

Usage:
  claude-display open            ensure server is running, open this session's tab
  claude-display open --quiet    same but no stdout (for SessionStart hook)
  claude-display url             print this session's URL
  claude-display setup           install SessionStart hook + register MCP in ~/.claude/settings.json
  claude-display server          run the HTTP server in the foreground (debug)
  claude-display version
`);
}

async function cmdOpen(quiet: boolean) {
  mkdirSync(HOOK_DIR, { recursive: true });
  mkdirSync(DATA_ROOT, { recursive: true });

  const { port } = await ensureHttpServer();
  const sessionId = resolveClaudeSessionId();
  if (!sessionId) {
    if (!quiet) {
      console.error(
        "[claude-display] couldn't resolve a Claude session id yet — hook may not have fired. Server is running on port " +
          port +
          ".",
      );
    }
    return;
  }
  registerSession(sessionId);
  const url = `http://localhost:${port}/s/${sessionId}`;
  openInBrowser(url);
  if (!quiet) console.log(url);
}

async function cmdUrl() {
  const { port } = await ensureHttpServer();
  const sessionId = resolveClaudeSessionId();
  if (!sessionId) {
    console.error("[claude-display] no session id resolved.");
    process.exitCode = 1;
    return;
  }
  console.log(`http://localhost:${port}/s/${sessionId}`);
}

function openInBrowser(url: string) {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  const args = platform === "win32" ? ["", url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.unref();
  } catch (err) {
    console.error(`[claude-display] couldn't open browser: ${(err as Error).message}`);
  }
}

function cmdSetup() {
  mkdirSync(HOOK_DIR, { recursive: true });

  const settingsPath = join(homedir(), ".claude", "settings.json");
  const hookScript = resolve(PROJECT_ROOT, "scripts", "claude-display-session-id.sh");
  const mcpEntry = resolve(PROJECT_ROOT, "dist", "mcp.js");
  const cliEntry = resolve(PROJECT_ROOT, "bin", "claude-display");

  if (!existsSync(hookScript)) {
    console.error(`[claude-display] hook script missing at ${hookScript}`);
    process.exitCode = 1;
    return;
  }

  const settings = existsSync(settingsPath)
    ? (JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<string, unknown>)
    : {};

  const mcpServers = (settings.mcpServers as Record<string, unknown>) ?? {};
  mcpServers["display"] = {
    command: "node",
    args: [mcpEntry],
  };
  settings.mcpServers = mcpServers;

  const hooks = (settings.hooks as Record<string, unknown>) ?? {};
  const sessionStart = (hooks.SessionStart as unknown[]) ?? [];
  const hookEntryShell = { type: "command", command: `bash ${hookScript}` };
  const hookEntryOpen = { type: "command", command: `${cliEntry} open --quiet` };

  const containsCommand = (arr: unknown[], substr: string) =>
    arr.some(
      (e) =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as { command?: unknown }).command === "string" &&
        ((e as { command: string }).command).includes(substr),
    );

  if (!containsCommand(sessionStart, "claude-display-session-id.sh")) {
    sessionStart.push(hookEntryShell);
  }
  if (!containsCommand(sessionStart, "claude-display") && !containsCommand(sessionStart, cliEntry)) {
    sessionStart.push(hookEntryOpen);
  }
  hooks.SessionStart = sessionStart;
  settings.hooks = hooks;

  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  console.log(`[claude-display] updated ${settingsPath}`);
  console.log(`  - mcpServers.display → node ${mcpEntry}`);
  console.log(`  - SessionStart hooks: id-capture + open --quiet`);
  console.log(`Restart your Claude Code session to activate.`);
}

async function cmdServer() {
  const { startHttpServer } = await import("./http-server.js");
  startHttpServer();
  process.stdin.resume();
}

function cmdVersion() {
  const pkg = JSON.parse(
    readFileSync(resolve(PROJECT_ROOT, "package.json"), "utf-8"),
  ) as { version: string };
  console.log(pkg.version);
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  switch (cmd) {
    case "open":
      await cmdOpen(rest.includes("--quiet"));
      return;
    case "url":
      await cmdUrl();
      return;
    case "setup":
      cmdSetup();
      return;
    case "server":
      await cmdServer();
      return;
    case "version":
    case "--version":
    case "-v":
      cmdVersion();
      return;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      help();
      return;
    default:
      console.error(`unknown command: ${cmd}`);
      help();
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[claude-display cli] fatal:", err);
  process.exit(1);
});

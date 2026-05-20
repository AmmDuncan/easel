#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
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
  console.log(`easel — live browser feed for Claude Code for Claude Code sessions

Usage:
  easel open            ensure server is running, open this session's tab (or skip if a tab is already alive)
  easel open --quiet    same but no stdout (for SessionStart hook)
  easel open --force    always open a new browser tab regardless of presence
  easel url             print this session's URL
  easel config                    print current { preset, theme }
  easel config preset paper       set preset to paper | aurora | slate
  easel config theme dark         set theme to light | dark
  easel config preset aurora theme light   set both at once
  easel setup           install SessionStart hook + register MCP in ~/.claude/settings.json
  easel server          run the HTTP server in the foreground (debug)
  easel version
`);
}

async function cmdOpen(opts: { quiet: boolean; force: boolean }) {
  mkdirSync(HOOK_DIR, { recursive: true });
  mkdirSync(DATA_ROOT, { recursive: true });

  const { port } = await ensureHttpServer();
  const sessionId = resolveClaudeSessionId();
  if (!sessionId) {
    if (!opts.quiet) {
      console.error(
        "[easel] couldn't resolve a Claude session id yet — hook may not have fired. Server is running on port " +
          port +
          ".",
      );
    }
    return;
  }
  registerSession(sessionId);
  await registerSessionWithServer(port, sessionId);

  const url = `http://localhost:${port}/s/${sessionId}`;
  const shouldOpen = opts.force || (await tabsAlive(port)) === 0;
  if (shouldOpen) {
    openInBrowser(url);
    if (!opts.quiet) console.log(url);
  } else if (!opts.quiet) {
    console.log(
      `[easel] tab already open — registered session ${sessionId.slice(0, 8)} silently. Use the topbar switcher to view it, or 'easel open --force' for a new window.`,
    );
  }
}

async function tabsAlive(port: number): Promise<number> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/presence`, {
      signal: AbortSignal.timeout(800),
    });
    if (!r.ok) return 0;
    const data = (await r.json()) as { tabs?: number };
    return typeof data.tabs === "number" ? data.tabs : 0;
  } catch {
    return 0;
  }
}

async function registerSessionWithServer(
  port: number,
  sessionId: string,
): Promise<void> {
  try {
    await fetch(`http://127.0.0.1:${port}/api/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, cwd: process.cwd() }),
      signal: AbortSignal.timeout(1200),
    });
  } catch {
    /* non-fatal — the session is still usable */
  }
}

async function cmdUrl() {
  const { port } = await ensureHttpServer();
  const sessionId = resolveClaudeSessionId();
  if (!sessionId) {
    console.error("[easel] no session id resolved.");
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
    console.error(`[easel] couldn't open browser: ${(err as Error).message}`);
  }
}

function cmdSetup() {
  mkdirSync(HOOK_DIR, { recursive: true });

  const settingsPath = join(homedir(), ".claude", "settings.json");
  const hookScript = resolve(PROJECT_ROOT, "scripts", "easel-session-id.sh");
  const mcpEntry = resolve(PROJECT_ROOT, "dist", "mcp.js");
  const cliEntry = resolve(PROJECT_ROOT, "bin", "easel");

  if (!existsSync(hookScript)) {
    console.error(`[easel] hook script missing at ${hookScript}`);
    process.exitCode = 1;
    return;
  }

  // 1. Register the MCP via the Claude Code CLI (writes ~/.claude.json).
  //    Falling back to a direct edit if the CLI isn't on PATH.
  registerMcp(mcpEntry);

  // 1b. Install the `using-display` skill so agents discover how to call display_push.
  installSkill();

  // 2. Add SessionStart hooks to ~/.claude/settings.json (hooks DO belong here).
  const settings = existsSync(settingsPath)
    ? (JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<string, unknown>)
    : {};
  // Drop any prior mcpServers.display entry — it lives in ~/.claude.json now.
  if (settings.mcpServers && typeof settings.mcpServers === "object") {
    delete (settings.mcpServers as Record<string, unknown>)["display"];
  }

  const hooks = (settings.hooks as Record<string, unknown>) ?? {};
  let sessionStart = (hooks.SessionStart as unknown[]) ?? [];

  // Drop any legacy entries from prior versions (claude-display-session-id.sh,
  // bin/claude-display, etc) before re-adding the current ones.
  const isLegacy = (block: unknown): boolean => {
    const inner = (block as { hooks?: unknown[]; command?: unknown })?.hooks ?? [block];
    if (!Array.isArray(inner)) return false;
    return inner.some((h) => {
      const cmd = (h as { command?: unknown })?.command;
      if (typeof cmd !== "string") return false;
      return (
        cmd.includes("claude-display-session-id.sh") ||
        cmd.includes("bin/claude-display ")
      );
    });
  };
  sessionStart = sessionStart.filter((b) => !isLegacy(b));

  const idCaptureBlock = {
    hooks: [{ type: "command", command: `bash ${hookScript}` }],
  };
  const autoOpenBlock = {
    hooks: [{ type: "command", command: `${cliEntry} open --quiet` }],
  };

  const containsBlockMatching = (substr: string) =>
    sessionStart.some((block) => {
      const inner = (block as { hooks?: unknown[]; command?: unknown })?.hooks ?? [block];
      return (Array.isArray(inner) ? inner : []).some(
        (h) =>
          typeof h === "object" &&
          h !== null &&
          typeof (h as { command?: unknown }).command === "string" &&
          ((h as { command: string }).command).includes(substr),
      );
    });

  if (!containsBlockMatching("easel-session-id.sh")) {
    sessionStart.push(idCaptureBlock);
  }
  if (!containsBlockMatching("easel") || !containsBlockMatching("open --quiet")) {
    sessionStart.push(autoOpenBlock);
  }
  hooks.SessionStart = sessionStart;
  settings.hooks = hooks;

  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  console.log(`[easel] setup complete`);
  console.log(`  - MCP registered at user scope (\`claude mcp list\` to verify)`);
  console.log(`  - SessionStart hooks added to ${settingsPath}`);
  console.log(`Restart Claude Code (fully quit + relaunch) to activate.`);
}

function installSkill(): void {
  const src = resolve(PROJECT_ROOT, "skills", "using-easel", "SKILL.md");
  if (!existsSync(src)) {
    console.warn(`[easel] skill source missing at ${src} — skipping skill install`);
    return;
  }
  const destDir = join(homedir(), ".claude", "skills", "using-easel");
  const dest = join(destDir, "SKILL.md");
  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, dest);
  // Remove the legacy skill from prior versions if it exists.
  const legacy = join(homedir(), ".claude", "skills", "using-display");
  if (existsSync(legacy)) {
    try {
      rmSync(legacy, { recursive: true, force: true });
    } catch {
      /* swallow */
    }
  }
  console.log(`  - using-easel skill installed to ${dest}`);
}

function registerMcp(mcpEntry: string): void {
  // Try `claude mcp add` first — that's the supported path and writes to ~/.claude.json.
  // Re-add idempotently by removing first (CLI errors if the name already exists).
  const trySpawn = (args: string[]) => {
    try {
      const r = spawnSync("claude", args, {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return r.status === 0;
    } catch {
      return false;
    }
  };
  // Drop any old registrations from prior versions.
  trySpawn(["mcp", "remove", "display", "--scope", "user"]);
  trySpawn(["mcp", "remove", "easel", "--scope", "user"]);
  const added = trySpawn([
    "mcp",
    "add",
    "--scope",
    "user",
    "easel",
    "node",
    mcpEntry,
  ]);
  if (added) return;

  // Fallback: patch ~/.claude.json directly.
  const userConfigPath = join(homedir(), ".claude.json");
  const config = existsSync(userConfigPath)
    ? (JSON.parse(readFileSync(userConfigPath, "utf-8")) as Record<string, unknown>)
    : {};
  const mcpServers = (config.mcpServers as Record<string, unknown>) ?? {};
  delete mcpServers["display"];
  mcpServers["easel"] = {
    type: "stdio",
    command: "node",
    args: [mcpEntry],
  };
  config.mcpServers = mcpServers;
  writeFileSync(userConfigPath, JSON.stringify(config, null, 2));
}

async function cmdConfig(args: string[]) {
  const { port } = await ensureHttpServer();
  if (args.length === 0) {
    const r = await fetch(`http://127.0.0.1:${port}/api/config`);
    const data = (await r.json()) as { config: unknown };
    console.log(JSON.stringify(data.config, null, 2));
    return;
  }
  const body: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const val = args[i + 1];
    if (!key || !val) continue;
    if (key === "preset" || key === "theme" || key === "density") body[key] = val;
  }
  if (Object.keys(body).length === 0) {
    console.error(
      "usage: easel config [preset paper|aurora|slate] [theme light|dark] [density carded|flat]",
    );
    process.exitCode = 1;
    return;
  }
  const r = await fetch(`http://127.0.0.1:${port}/api/config`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await r.json()) as { config: unknown };
  console.log(JSON.stringify(data.config, null, 2));
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
      await cmdOpen({
        quiet: rest.includes("--quiet"),
        force: rest.includes("--force"),
      });
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
    case "config":
      await cmdConfig(rest);
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
  console.error("[easel cli] fatal:", err);
  process.exit(1);
});

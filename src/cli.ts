#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { ensureHttpServer, readLock } from "./server-manager.js";
import { resolveClaudeSessionId } from "./session-id.js";
import { HOOK_DIR, DATA_ROOT } from "./paths.js";
import { registerSession } from "./session-store.js";
import {
  type ClientName,
  listClients,
  setupClient,
} from "./client-setup.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const NPM_PKG = "@ammduncan/easel";

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
  easel setup                              install Claude Code hook + register MCP in ~/.claude/settings.json
  easel setup --client cursor              register MCP in ~/.cursor/mcp.json
  easel setup --client claude-desktop      register MCP in ~/Library/Application Support/Claude/claude_desktop_config.json
  easel setup --client windsurf            register MCP in ~/.codeium/windsurf/mcp_config.json
  easel setup --client codex               register MCP in ~/.codex/config.toml + copy skill to ~/.codex/skills/
  easel update          clone installs: git pull + build + setup · npm installs: npm install -g @latest + setup
  easel mcp             run the stdio MCP server in the foreground (used by clients)
  easel restart         kill the running HTTP server and respawn it (picks up new builds/paths)
  easel server          run the HTTP server in the foreground (debug)
  easel version
`);
}

async function cmdOpen(opts: { quiet: boolean; force: boolean }) {
  mkdirSync(HOOK_DIR, { recursive: true });
  mkdirSync(DATA_ROOT, { recursive: true });

  const { port } = await ensureHttpServer();
  const sessionId = resolveClaudeSessionId();
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

function binResolvesOnPath(): boolean {
  const cmd = process.platform === "win32" ? "where" : "which";
  try {
    const r = spawnSync(cmd, ["easel"], { encoding: "utf-8" });
    return r.status === 0 && r.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

function pkgVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(PROJECT_ROOT, "package.json"), "utf-8"),
    ) as { version?: string };
    return pkg.version ?? "latest";
  } catch {
    return "latest";
  }
}

function globalPkgDir(): string | null {
  try {
    const r = spawnSync("npm", ["root", "-g"], { encoding: "utf-8" });
    if (r.status !== 0) return null;
    const dir = join(r.stdout.trim(), NPM_PKG);
    return existsSync(dir) ? dir : null;
  } catch {
    return null;
  }
}

// Re-runs setup from the globally installed copy so its registrations point at
// the global paths. Returns false if there is no global copy to delegate to.
function rerunSetupFromGlobal(): boolean {
  const dir = globalPkgDir();
  if (!dir) {
    return false;
  }
  const r = spawnSync("node", [join(dir, "dist", "cli.js"), "setup"], {
    stdio: "inherit",
    env: { ...process.env, EASEL_SETUP_CHILD: "1" },
  });
  return r.status === 0;
}

// Make bare `easel` work after setup, as the README documents. Clone installs
// get `npm link`. npx-cache installs get a real global install — the cache is
// pruned unpredictably — and setup is then re-run from the global copy so the
// MCP/hook registrations point at paths that survive pruning.
// Returns true when setup was fully delegated to the global copy.
function ensureBinOnPath(): boolean {
  const inNpxCache = PROJECT_ROOT.split(sep).includes("_npx");
  if (!inNpxCache) {
    if (binResolvesOnPath()) {
      return false;
    }
    const r = spawnSync("npm", ["link", "--silent", "--no-audit", "--no-fund"], {
      cwd: PROJECT_ROOT,
      stdio: "ignore",
    });
    if (r.status === 0) {
      console.log("  - linked `easel` into the global bin (npm link)");
    } else {
      console.warn(
        `  - couldn't put \`easel\` on PATH — run \`npm link\` in ${PROJECT_ROOT}`,
      );
    }
    return false;
  }

  const version = pkgVersion();
  console.log(
    `[easel] installing ${NPM_PKG}@${version} globally so \`easel\` is on PATH…`,
  );
  const installed = spawnSync(
    "npm",
    ["install", "-g", "--silent", "--no-audit", "--no-fund", `${NPM_PKG}@${version}`],
    { stdio: "inherit" },
  );
  if (installed.status !== 0 || !rerunSetupFromGlobal()) {
    console.warn(
      `  - global install failed — \`easel\` won't be on PATH; run \`npm install -g ${NPM_PKG}\` manually`,
    );
    return false;
  }
  return true;
}

function cmdSetup() {
  // Put `easel` on PATH first — for npx-cache runs this delegates the whole
  // setup to a freshly installed global copy (so registered paths outlive the
  // cache), in which case there's nothing left to do here.
  if (!process.env.EASEL_SETUP_CHILD) {
    if (ensureBinOnPath()) {
      return;
    }
  }

  mkdirSync(HOOK_DIR, { recursive: true });

  const settingsPath = join(homedir(), ".claude", "settings.json");
  const hookScript = resolve(PROJECT_ROOT, "scripts", "easel-session-id.mjs");
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

  // 1b. Install the `using-easel` skill so agents discover when/how to push.
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

  // Drop legacy entries from prior versions (the old bash hook, paths under the
  // claude-display name) AND the prior autoOpenBlock (which opened a tab at
  // SessionStart — replaced by MCP-side auto-open on first push as of 0.2.14).
  const isLegacy = (block: unknown): boolean => {
    const inner = (block as { hooks?: unknown[]; command?: unknown })?.hooks ?? [block];
    if (!Array.isArray(inner)) return false;
    return inner.some((h) => {
      const cmd = (h as { command?: unknown })?.command;
      if (typeof cmd !== "string") return false;
      return (
        cmd.includes("claude-display-session-id.sh") ||
        cmd.includes("easel-session-id.sh") ||
        cmd.includes("bin/claude-display ") ||
        // Prior `easel open --quiet` SessionStart hook — superseded by
        // MCP-side first-push auto-open.
        (cmd.includes("easel") && cmd.includes("open --quiet"))
      );
    });
  };
  sessionStart = sessionStart.filter((b) => !isLegacy(b));

  const idCaptureBlock = {
    hooks: [{ type: "command", command: `node ${hookScript}` }],
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

  if (!containsBlockMatching("easel-session-id.mjs")) {
    sessionStart.push(idCaptureBlock);
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

function cmdUpdate(): void {
  console.log("[easel] checking for updates…");
  const run = (cmd: string, args: string[]) =>
    spawnSync(cmd, args, { stdio: "inherit", cwd: PROJECT_ROOT });

  // npm/global installs have no git checkout — update from the registry and
  // re-run setup from the new copy so registrations track the new paths.
  if (!existsSync(join(PROJECT_ROOT, ".git"))) {
    const installed = run("npm", [
      "install",
      "-g",
      "--no-audit",
      "--no-fund",
      `${NPM_PKG}@latest`,
    ]);
    if (installed.status !== 0) {
      console.error("[easel] npm install -g failed");
      process.exitCode = 1;
      return;
    }
    rerunSetupFromGlobal();
    console.log("[easel] updated. Restart Claude Code to pick up tool/skill changes.");
    return;
  }

  let r = run("git", ["fetch", "--quiet", "origin", "main"]);
  if (r.status !== 0) {
    console.error("[easel] git fetch failed");
    process.exitCode = 1;
    return;
  }
  r = run("git", ["pull", "--ff-only", "--quiet", "origin", "main"]);
  if (r.status !== 0) {
    console.error("[easel] git pull failed (local changes? merge conflict?)");
    process.exitCode = 1;
    return;
  }
  r = run("npm", ["install", "--silent", "--no-audit", "--no-fund"]);
  if (r.status !== 0) {
    console.error("[easel] npm install failed");
    process.exitCode = 1;
    return;
  }
  r = run("npm", ["run", "build", "--silent"]);
  if (r.status !== 0) {
    console.error("[easel] build failed");
    process.exitCode = 1;
    return;
  }
  // Re-run setup so any new hook/skill conventions take effect.
  cmdSetup();
  console.log("[easel] updated. Restart Claude Code to pick up tool/skill changes.");
}

async function cmdRestart() {
  const lock = readLock();
  if (lock?.pid) {
    try {
      process.kill(lock.pid, "SIGTERM");
    } catch {
      // process is already dead — fine
    }
    // give the OS a moment to release the port + clean up
    await new Promise((r) => setTimeout(r, 300));
  }
  try {
    rmSync(join(DATA_ROOT, "server.lock"));
  } catch {
    // no lockfile to remove — fine
  }
  const { port } = await ensureHttpServer();
  console.log(`easel server restarted on port ${port}`);
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
    case "setup": {
      // Catch --help BEFORE doing anything destructive. The default
      // cmdSetup() writes to ~/.claude/settings.json, so an unguarded
      // `easel setup --help` would silently reconfigure Claude Code.
      if (rest.includes("--help") || rest.includes("-h") || rest[0] === "help") {
        console.log(
          [
            "easel setup — install easel into one of the supported MCP clients.",
            "",
            "Usage:",
            "  easel setup                    Claude Code (default): MCP + SessionStart hook + skill",
            "  easel setup --client <name>    register MCP in another client",
            "",
            `Available clients: ${listClients().join(", ")}`,
            "",
            "Manual install (any other MCP client): drop this into the client's MCP config —",
            '  { "mcpServers": { "easel": { "command": "npx", "args": ["-y", "@ammduncan/easel"] } } }',
          ].join("\n"),
        );
        return;
      }
      const clientIdx = rest.indexOf("--client");
      if (clientIdx !== -1) {
        const name = rest[clientIdx + 1];
        if (!name) {
          console.error(
            `[easel] --client requires a name. Available: ${listClients().join(", ")}`,
          );
          process.exitCode = 1;
          return;
        }
        if (!listClients().includes(name as ClientName)) {
          console.error(
            `[easel] unknown client "${name}". Available: ${listClients().join(", ")}`,
          );
          process.exitCode = 1;
          return;
        }
        try {
          setupClient(name as ClientName);
        } catch (err) {
          console.error(`[easel] setup --client ${name} failed:`, (err as Error).message);
          process.exitCode = 1;
        }
        return;
      }
      cmdSetup();
      return;
    }
    case "server":
      await cmdServer();
      return;
    case "config":
      await cmdConfig(rest);
      return;
    case "update":
      cmdUpdate();
      return;
    case "restart":
      await cmdRestart();
      return;
    case "version":
    case "--version":
    case "-v":
      cmdVersion();
      return;
    case "mcp": {
      const { main: mcpMain } = await import("./mcp.js");
      await mcpMain();
      return;
    }
    case undefined: {
      // When invoked over a pipe (no TTY on stdin) — e.g. an MCP client
      // launching us via `npx -y @ammduncan/easel` — boot the MCP server.
      // Interactive terminal use still gets the help text.
      if (!process.stdin.isTTY) {
        const { main: mcpMain } = await import("./mcp.js");
        await mcpMain();
        return;
      }
      help();
      return;
    }
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

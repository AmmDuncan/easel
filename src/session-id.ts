import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import { HOOK_DIR } from "./paths.js";

export type ResolveOpts = {
  homeDir?: string;
  cwd?: string;
  ppid?: number;
  env?: NodeJS.ProcessEnv;
};

/**
 * Resolves the session id that owns this MCP process. Tries, in order:
 *   1. EASEL_SESSION_ID env var (explicit override for any client)
 *   2. CLAUDE_CODE_SESSION_ID / CLAUDE_SESSION_ID (Claude Code)
 *   3. Hook file at ~/.easel/hook/cc-session-<ppid>.txt (Claude Code's
 *      SessionStart hook writes this; pitstop-style PPID bridging)
 *   4. Most-recently-modified transcript under ~/.claude/projects/<cwd>/
 *      (Claude Code transcript scan) — ONLY when a positive Claude Code env
 *      signal is present. Other MCP clients (opencode, Cursor, Windsurf, …)
 *      can share a cwd that already holds CC transcripts; without this guard
 *      they'd latch onto whichever unrelated transcript was touched last and
 *      the resolved session would drift on every tool call.
 *   5. Synthetic id derived from this MCP child's PPID — gives every other
 *      MCP client (Cursor, Windsurf, Claude Desktop, etc.) a stable session
 *      per chat without requiring any hook. The MCP child IS the session.
 *
 * Always returns a value from tier 5 if all higher tiers miss, so non-CC
 * clients are usable out of the box.
 */
export function resolveClaudeSessionId(opts: ResolveOpts = {}): string {
  const home = opts.homeDir ?? homedir();
  const cwd = opts.cwd ?? process.cwd();
  const ppid = opts.ppid ?? process.ppid;
  const env = opts.env ?? process.env;

  const explicit = env.EASEL_SESSION_ID;
  if (explicit) return explicit;

  const fromCcEnv = env.CLAUDE_CODE_SESSION_ID ?? env.CLAUDE_SESSION_ID;
  if (fromCcEnv) return fromCcEnv;

  const hookFile = join(HOOK_DIR, `cc-session-${ppid}.txt`);
  try {
    const id = readFileSync(hookFile, "utf-8").trim();
    if (id) return id;
  } catch {
    /* fall through */
  }

  // Tier 4 (transcript scan) is Claude-Code-specific: only trust it when we
  // have positive evidence we're actually running inside Claude Code. For any
  // other MCP client the scan would pick an unrelated, actively-changing CC
  // transcript in the same cwd and the session id would drift per call — so
  // skip straight to the stable per-process synthetic id (tier 5).
  const isClaudeCode = Boolean(env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT);
  if (isClaudeCode) {
    try {
      const encoded = cwd.replace(/\//g, "-");
      const dir = join(home, ".claude", "projects", encoded);
      let bestId: string | undefined;
      let bestMtime = 0;
      for (const f of readdirSync(dir)) {
        if (!f.endsWith(".jsonl")) continue;
        const m = statSync(join(dir, f)).mtimeMs;
        if (m > bestMtime) {
          bestMtime = m;
          bestId = f.slice(0, -".jsonl".length);
        }
      }
      if (bestId) return bestId;
    } catch {
      /* fall through */
    }
  }

  return syntheticSessionIdFromPpid(ppid);
}

/**
 * Mints a stable, UUID-shaped id from the parent PID and parent boot time.
 * Same PPID across an MCP-child restart → same id (so a flaky child doesn't
 * spawn a new tab); different chat / different client process → different id.
 */
function syntheticSessionIdFromPpid(ppid: number): string {
  const seed = `mcp-ppid-${ppid}`;
  const hex = createHash("sha1").update(seed).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

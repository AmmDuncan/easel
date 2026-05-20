import { readFileSync, readdirSync, statSync } from "node:fs";
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
 * Resolves the Claude Code session id that owns this MCP process.
 * Tried in order — env > hook-file > transcript scan. Adapted from pitstop.
 *
 * Claude Code does NOT pass `session_id` to MCP subprocesses via env or the
 * JSON-RPC stream, so the SessionStart hook is what bridges it across.
 */
export function resolveClaudeSessionId(opts: ResolveOpts = {}): string | undefined {
  const home = opts.homeDir ?? homedir();
  const cwd = opts.cwd ?? process.cwd();
  const ppid = opts.ppid ?? process.ppid;
  const env = opts.env ?? process.env;

  const fromEnv = env.CLAUDE_CODE_SESSION_ID ?? env.CLAUDE_SESSION_ID;
  if (fromEnv) return fromEnv;

  const hookFile = join(HOOK_DIR, `cc-session-${ppid}.txt`);
  try {
    const id = readFileSync(hookFile, "utf-8").trim();
    if (id) return id;
  } catch {
    /* fall through */
  }

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
    return bestId;
  } catch {
    /* fall through */
  }

  return undefined;
}

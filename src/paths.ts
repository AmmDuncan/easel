import { existsSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Root for runtime state — sessions, lockfile, hook session-id files. */
export const DATA_ROOT = join(homedir(), ".easel");

/** Directory the SessionStart hook writes per-PPID session-id files into. */
export const HOOK_DIR = join(DATA_ROOT, "hook");

/** Directory containing one folder per session. */
export const SESSIONS_DIR = join(DATA_ROOT, "sessions");

/** Lockfile coordinating which process owns the shared HTTP server. */
export const LOCK_FILE = join(DATA_ROOT, "server.lock");

/** Default HTTP port — overridable via EASEL_PORT (legacy: CLAUDE_DISPLAY_PORT). */
export const DEFAULT_PORT = 7878;

/** Max pushes retained per session before oldest is evicted. */
export const MAX_PUSHES_PER_SESSION = 50;

/** Idle TTL for sessions, in ms (24h). */
export const SESSION_IDLE_TTL_MS = 24 * 60 * 60 * 1000;

const LEGACY_DATA_ROOT = join(homedir(), ".claude-display");
let migrationChecked = false;

/**
 * One-time migration from the project's prior name. Renames `~/.claude-display`
 * to `~/.easel` if the legacy dir exists and the new dir doesn't. Safe to call
 * repeatedly — short-circuits after the first call.
 */
export function migrateLegacyDataRoot(): void {
  if (migrationChecked) return;
  migrationChecked = true;
  if (existsSync(DATA_ROOT)) return;
  if (!existsSync(LEGACY_DATA_ROOT)) return;
  try {
    renameSync(LEGACY_DATA_ROOT, DATA_ROOT);
  } catch {
    // best-effort; the caller will mkdirSync DATA_ROOT and proceed
  }
}

/** Read the configured port, preferring EASEL_PORT and falling back to the legacy env var. */
export function resolvePort(): number {
  return (
    Number(process.env.EASEL_PORT) ||
    Number(process.env.CLAUDE_DISPLAY_PORT) ||
    DEFAULT_PORT
  );
}

/** Walks: one folder per project, outliving sessions. */
export const WALKS_DIR = join(DATA_ROOT, "walks");

/** Local secret guarding walk writes (mode 0600). */
export const TOKEN_FILE = join(DATA_ROOT, "token");

/** Folders whose direct children are projects. Override: config `panel.projectRoots`. */
export const DEFAULT_PROJECT_ROOTS = ["~/work/studios", "~/work/tools"];

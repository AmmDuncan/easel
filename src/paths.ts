import { homedir } from "node:os";
import { join } from "node:path";

/** Root for runtime state — sessions, lockfile, hook session-id files. */
export const DATA_ROOT = join(homedir(), ".claude-display");

/** Directory the SessionStart hook writes per-PPID session-id files into. */
export const HOOK_DIR = join(DATA_ROOT, "hook");

/** Directory containing one folder per session. */
export const SESSIONS_DIR = join(DATA_ROOT, "sessions");

/** Lockfile coordinating which process owns the shared HTTP server. */
export const LOCK_FILE = join(DATA_ROOT, "server.lock");

/** Default HTTP port — overridable via CLAUDE_DISPLAY_PORT. */
export const DEFAULT_PORT = 7878;

/** Max pushes retained per session before oldest is evicted. */
export const MAX_PUSHES_PER_SESSION = 50;

/** Idle TTL for sessions, in ms (24h). */
export const SESSION_IDLE_TTL_MS = 24 * 60 * 60 * 1000;

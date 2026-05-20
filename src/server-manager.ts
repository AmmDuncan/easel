import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { DATA_ROOT, DEFAULT_PORT, LOCK_FILE } from "./paths.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

type LockRecord = {
  pid: number;
  port: number;
  startedAt: number;
};

function readLock(): LockRecord | undefined {
  if (!existsSync(LOCK_FILE)) return undefined;
  try {
    return JSON.parse(readFileSync(LOCK_FILE, "utf-8")) as LockRecord;
  } catch {
    return undefined;
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function serverResponding(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(800),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Ensure exactly one HTTP server is running and return its port. If the
 * lockfile points at a live, responding pid we reuse it; otherwise we spawn
 * a detached child running `dist/http-entry.js` and wait for /health.
 */
export async function ensureHttpServer(): Promise<{ port: number; reused: boolean }> {
  mkdirSync(DATA_ROOT, { recursive: true });

  const existing = readLock();
  if (existing && pidAlive(existing.pid) && (await serverResponding(existing.port))) {
    return { port: existing.port, reused: true };
  }
  if (existing) {
    try {
      rmSync(LOCK_FILE);
    } catch {
      /* swallow */
    }
  }

  const port = Number(process.env.CLAUDE_DISPLAY_PORT) || DEFAULT_PORT;
  const entry = resolve(__dirname, "http-entry.js");

  const child = spawn(process.execPath, [entry], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    env: { ...process.env, CLAUDE_DISPLAY_PORT: String(port) },
  });
  child.unref();

  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (await serverResponding(port)) {
      return { port, reused: false };
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error(`claude-display HTTP server failed to start on port ${port}`);
}

export function writeLock(port: number): void {
  mkdirSync(DATA_ROOT, { recursive: true });
  const record: LockRecord = {
    pid: process.pid,
    port,
    startedAt: Date.now(),
  };
  writeFileSync(LOCK_FILE, JSON.stringify(record, null, 2));
}

export function clearLockIfMine(): void {
  const lock = readLock();
  if (lock && lock.pid === process.pid) {
    try {
      rmSync(LOCK_FILE);
    } catch {
      /* swallow */
    }
  }
}

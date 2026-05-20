import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  MAX_PUSHES_PER_SESSION,
  SESSIONS_DIR,
  SESSION_IDLE_TTL_MS,
} from "./paths.js";

export type Push = {
  id: string;
  index: number;
  title: string | null;
  kind: string | null;
  html: string;
  createdAt: number;
};

export type SessionMeta = {
  id: string;
  createdAt: number;
  lastActivity: number;
  nextIndex: number;
  prunedCount: number;
};

const META_FILE = "meta.json";
const PUSHES_DIR = "pushes";

function sessionDir(id: string): string {
  return join(SESSIONS_DIR, id);
}

function metaPath(id: string): string {
  return join(sessionDir(id), META_FILE);
}

function pushesDir(id: string): string {
  return join(sessionDir(id), PUSHES_DIR);
}

function ensureSession(id: string): SessionMeta {
  const dir = sessionDir(id);
  if (!existsSync(dir)) {
    mkdirSync(pushesDir(id), { recursive: true });
    const meta: SessionMeta = {
      id,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      nextIndex: 1,
      prunedCount: 0,
    };
    writeFileSync(metaPath(id), JSON.stringify(meta, null, 2));
    return meta;
  }
  return readMeta(id);
}

function readMeta(id: string): SessionMeta {
  return JSON.parse(readFileSync(metaPath(id), "utf-8")) as SessionMeta;
}

function writeMeta(meta: SessionMeta): void {
  writeFileSync(metaPath(meta.id), JSON.stringify(meta, null, 2));
}

export function touchSession(id: string): SessionMeta {
  const meta = ensureSession(id);
  meta.lastActivity = Date.now();
  writeMeta(meta);
  return meta;
}

export function listPushes(id: string): Push[] {
  if (!existsSync(pushesDir(id))) return [];
  const files = readdirSync(pushesDir(id))
    .filter((f) => f.endsWith(".json"))
    .sort();
  return files.map(
    (f) => JSON.parse(readFileSync(join(pushesDir(id), f), "utf-8")) as Push,
  );
}

export function getSessionView(id: string): { meta: SessionMeta; pushes: Push[] } {
  const meta = ensureSession(id);
  return { meta, pushes: listPushes(id) };
}

export function appendPush(
  sessionId: string,
  input: { html: string; title?: string; kind?: string },
): Push {
  const meta = ensureSession(sessionId);
  const push: Push = {
    id: randomUUID(),
    index: meta.nextIndex,
    title: input.title?.trim() || null,
    kind: input.kind?.trim() || null,
    html: input.html,
    createdAt: Date.now(),
  };
  const filename = `${String(push.index).padStart(6, "0")}-${push.id}.json`;
  writeFileSync(join(pushesDir(sessionId), filename), JSON.stringify(push));

  meta.nextIndex += 1;
  meta.lastActivity = push.createdAt;

  pruneOldPushes(sessionId, meta);
  writeMeta(meta);
  return push;
}

function pruneOldPushes(sessionId: string, meta: SessionMeta): void {
  const files = readdirSync(pushesDir(sessionId))
    .filter((f) => f.endsWith(".json"))
    .sort();
  while (files.length > MAX_PUSHES_PER_SESSION) {
    const victim = files.shift();
    if (!victim) break;
    rmSync(join(pushesDir(sessionId), victim));
    meta.prunedCount += 1;
  }
}

/**
 * Delete sessions idle longer than SESSION_IDLE_TTL_MS. Cheap; called from
 * every push and once at HTTP-server boot.
 */
export function sweepIdleSessions(now = Date.now()): { removed: string[] } {
  const removed: string[] = [];
  if (!existsSync(SESSIONS_DIR)) return { removed };
  for (const id of readdirSync(SESSIONS_DIR)) {
    const meta = safeReadMeta(id);
    if (!meta) continue;
    if (now - meta.lastActivity > SESSION_IDLE_TTL_MS) {
      rmSync(sessionDir(id), { recursive: true, force: true });
      removed.push(id);
    }
  }
  return { removed };
}

function safeReadMeta(id: string): SessionMeta | undefined {
  try {
    return readMeta(id);
  } catch {
    return undefined;
  }
}

export function sessionExists(id: string): boolean {
  return existsSync(metaPath(id));
}

/** First-touch from CLI: ensure session exists without bumping activity. */
export function registerSession(id: string): SessionMeta {
  return ensureSession(id);
}

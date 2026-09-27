import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { findWalk, projectDirs, readJson, walkStatus, writeJson } from "./walk-store.js";
import type { ProjectInfo, Walk } from "./walk-types.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TRASH_ID_RE = /^t_[a-z0-9]+$/;

type TrashMeta = { kind: "walk" | "walks" | "project"; slug: string; ids: string[]; at: number };

/** A slug is only trustworthy if it matches the allowed shape AND names a real project dir. */
function isKnownSlug(root: string, slug: string): boolean {
  return SLUG_RE.test(slug) && projectDirs(root).includes(slug);
}

function trashRoot(root: string): string {
  return join(root, ".trash");
}

function newTrashId(): string {
  return `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function readMeta(dir: string): TrashMeta | null {
  return readJson<TrashMeta>(join(dir, "meta.json"));
}

function walkFiles(root: string, slug: string, id: string): { json: string; progress: string } {
  return { json: join(root, slug, `${id}.json`), progress: join(root, slug, `${id}.progress.json`) };
}

/** Moves a single walk's files into a fresh trash entry. Returns the trash id, or null if unknown. */
export function trashWalk(root: string, id: string): string | null {
  const found = findWalk(root, id);
  if (!found) {
    return null;
  }
  const slug = found.walk.project;
  const files = walkFiles(root, slug, id);
  if (!existsSync(files.json)) {
    return null;
  }
  const trashId = newTrashId();
  const dest = join(trashRoot(root), trashId);
  mkdirSync(dest, { recursive: true });
  renameSync(files.json, join(dest, `${id}.json`));
  if (existsSync(files.progress)) {
    renameSync(files.progress, join(dest, `${id}.progress.json`));
  }
  writeJson(join(dest, "meta.json"), { kind: "walk", slug, ids: [id], at: Date.now() } satisfies TrashMeta);
  return trashId;
}

export type RestoreResult = { restored: string[] } | "not-found" | "conflict";

/** Restores a trash entry (a walk, a batch of walks, or a whole project) back to its origin. */
export function restoreTrash(root: string, trashId: string): RestoreResult {
  if (!TRASH_ID_RE.test(trashId)) {
    return "not-found";
  }
  const dir = join(trashRoot(root), trashId);
  const meta = readMeta(dir);
  if (!meta) {
    return "not-found";
  }

  if (meta.kind === "project") {
    const target = join(root, meta.slug);
    if (existsSync(target)) {
      return "conflict";
    }
    renameSync(join(dir, meta.slug), target);
    rmSync(dir, { recursive: true, force: true });
    return { restored: [meta.slug] };
  }

  for (const id of meta.ids) {
    if (existsSync(join(root, meta.slug, `${id}.json`))) {
      return "conflict";
    }
  }
  mkdirSync(join(root, meta.slug), { recursive: true });
  for (const id of meta.ids) {
    renameSync(join(dir, `${id}.json`), join(root, meta.slug, `${id}.json`));
    const progressSrc = join(dir, `${id}.progress.json`);
    if (existsSync(progressSrc)) {
      renameSync(progressSrc, join(root, meta.slug, `${id}.progress.json`));
    }
  }
  rmSync(dir, { recursive: true, force: true });
  return { restored: meta.ids };
}

export type MoveResult = { project: string } | "unknown-walk" | "unknown-project";

/** Relocates a walk into another (existing) project. */
export function moveWalk(root: string, id: string, toSlug: string): MoveResult {
  const found = findWalk(root, id);
  if (!found) {
    return "unknown-walk";
  }
  if (!isKnownSlug(root, toSlug)) {
    return "unknown-project";
  }
  const fromSlug = found.walk.project;
  if (fromSlug === toSlug) {
    return { project: toSlug };
  }
  mkdirSync(join(root, toSlug), { recursive: true });
  const updated: Walk = { ...found.walk, project: toSlug };
  writeJson(join(root, toSlug, `${id}.json`), updated);
  rmSync(join(root, fromSlug, `${id}.json`));
  const progressSrc = join(root, fromSlug, `${id}.progress.json`);
  if (existsSync(progressSrc)) {
    renameSync(progressSrc, join(root, toSlug, `${id}.progress.json`));
  }
  return { project: toSlug };
}

export type RenameResult = ProjectInfo | "invalid" | "unknown";

/** Renames a project's label (1..60 chars). */
export function renameProject(root: string, slug: string, label: string): RenameResult {
  if (typeof label !== "string" || label.length < 1 || label.length > 60) {
    return "invalid";
  }
  if (!isKnownSlug(root, slug)) {
    return "unknown";
  }
  const path = join(root, slug, "project.json");
  const info = readJson<ProjectInfo>(path);
  if (!info) {
    return "unknown";
  }
  const next: ProjectInfo = { ...info, label };
  writeJson(path, next);
  return next;
}

export type ClearDoneResult = { trashId: string | null; count: number };

/** Moves every done walk in a project into one trash entry. */
export function clearDone(root: string, slug: string): ClearDoneResult | "unknown" {
  if (!isKnownSlug(root, slug)) {
    return "unknown";
  }
  const dir = join(root, slug);
  const doneIds = readdirSync(dir)
    .filter((f) => /^w_[a-z0-9]+\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""))
    .filter((id) => {
      const found = findWalk(root, id);
      return found !== null && walkStatus(found.progress) === "done";
    });
  if (doneIds.length === 0) {
    return { trashId: null, count: 0 };
  }
  const trashId = newTrashId();
  const dest = join(trashRoot(root), trashId);
  mkdirSync(dest, { recursive: true });
  for (const id of doneIds) {
    const files = walkFiles(root, slug, id);
    renameSync(files.json, join(dest, `${id}.json`));
    if (existsSync(files.progress)) {
      renameSync(files.progress, join(dest, `${id}.progress.json`));
    }
  }
  writeJson(join(dest, "meta.json"), { kind: "walks", slug, ids: doneIds, at: Date.now() } satisfies TrashMeta);
  return { trashId, count: doneIds.length };
}

/** Moves a whole project directory (and every walk in it) into one trash entry. */
export function trashProject(root: string, slug: string): string | null {
  if (!isKnownSlug(root, slug)) {
    return null;
  }
  const dir = join(root, slug);
  const trashId = newTrashId();
  const dest = join(trashRoot(root), trashId);
  mkdirSync(dest, { recursive: true });
  renameSync(dir, join(dest, slug));
  writeJson(join(dest, "meta.json"), { kind: "project", slug, ids: [], at: Date.now() } satisfies TrashMeta);
  return trashId;
}

export type SweepResult = { purgedTrash: number; expiredWalks: number };

/** Purges trash older than 7 days and deletes done walks untouched for 90 days. Never touches waiting/in-progress walks. */
export function sweepWalks(root: string, now: number = Date.now()): SweepResult {
  let purgedTrash = 0;
  const tdir = trashRoot(root);
  if (existsSync(tdir)) {
    for (const name of readdirSync(tdir)) {
      const dir = join(tdir, name);
      const meta = readMeta(dir);
      if (meta && now - meta.at > SEVEN_DAYS_MS) {
        rmSync(dir, { recursive: true, force: true });
        purgedTrash++;
      }
    }
  }

  let expiredWalks = 0;
  for (const slug of projectDirs(root)) {
    const dir = join(root, slug);
    for (const file of readdirSync(dir)) {
      if (!/^w_[a-z0-9]+\.json$/.test(file)) {
        continue;
      }
      const id = file.replace(/\.json$/, "");
      const found = findWalk(root, id);
      if (!found) {
        continue;
      }
      if (walkStatus(found.progress) === "done" && now - found.progress.updatedAt > NINETY_DAYS_MS) {
        rmSync(join(dir, file));
        const progressFile = join(dir, `${id}.progress.json`);
        if (existsSync(progressFile)) {
          rmSync(progressFile);
        }
        expiredWalks++;
      }
    }
  }

  return { purgedTrash, expiredWalks };
}

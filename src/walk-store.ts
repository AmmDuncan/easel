import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ProjectInfo, ProjectSummary, Walk, WalkInput, WalkProgress, WalkStatus, WalkSummary,
} from "./walk-types.js";

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function newId(): string {
  return `w_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function freshProgress(walkId: string, at: number): WalkProgress {
  return {
    walkId, stage: "orient", picked: [], current: 0, steps: {}, checks: [],
    actionsDone: [], startedAt: null, updatedAt: at,
  };
}

export function walkStatus(p: WalkProgress): WalkStatus {
  if (p.startedAt === null) {
    return "waiting";
  }
  if (p.stage === "done") {
    return "done";
  }
  return "in_progress";
}

export function createWalk(
  root: string, input: WalkInput, project: ProjectInfo,
  meta: { sessionId: string | null; cwd: string | null },
): Walk {
  const dir = join(root, project.slug);
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, "project.json"))) {
    writeJson(join(dir, "project.json"), project);
  }
  const now = Date.now();
  const walk: Walk = { ...input, id: newId(), project: project.slug, createdAt: now, ...meta };
  writeJson(join(dir, `${walk.id}.json`), walk);
  writeJson(join(dir, `${walk.id}.progress.json`), freshProgress(walk.id, now));
  return walk;
}

function projectDirs(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name);
}

function walkPath(root: string, id: string): string | null {
  if (!/^w_[a-z0-9]+$/.test(id)) {
    return null;
  }
  for (const slug of projectDirs(root)) {
    const p = join(root, slug, `${id}.json`);
    if (existsSync(p)) {
      return p;
    }
  }
  return null;
}

export function findWalk(root: string, id: string): { walk: Walk; progress: WalkProgress } | null {
  const p = walkPath(root, id);
  if (!p) {
    return null;
  }
  const walk = readJson<Walk>(p);
  if (!walk) {
    return null;
  }
  const progress = readJson<WalkProgress>(p.replace(/\.json$/, ".progress.json")) ?? freshProgress(id, walk.createdAt);
  return { walk, progress };
}

export function saveProgress(
  root: string, id: string, patch: Partial<Omit<WalkProgress, "walkId">>,
): WalkProgress | null {
  const p = walkPath(root, id);
  const found = findWalk(root, id);
  if (!p || !found) {
    return null;
  }
  const next: WalkProgress = { ...found.progress, ...patch, walkId: id, updatedAt: Date.now() };
  writeJson(p.replace(/\.json$/, ".progress.json"), next);
  return next;
}

function summaries(root: string, slug: string): WalkSummary[] {
  const dir = join(root, slug);
  return readdirSync(dir)
    .filter((f) => /^w_[a-z0-9]+\.json$/.test(f))
    .map((f) => findWalk(root, f.replace(/\.json$/, "")))
    .filter((x): x is { walk: Walk; progress: WalkProgress } => x !== null)
    .map(({ walk, progress }) => ({
      id: walk.id, title: walk.title, kind: walk.kind, createdAt: walk.createdAt,
      updatedAt: progress.updatedAt, steps: progress.picked.length || walk.steps.length, minutes: walk.orient.minutes,
      status: walkStatus(progress), current: progress.current,
      openActions: walkStatus(progress) === "done" ? walk.actions.length - progress.actionsDone.length : 0,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function listWalks(root: string, slug: string): WalkSummary[] | null {
  if (!projectDirs(root).includes(slug)) {
    return null;
  }
  return summaries(root, slug);
}

export function listProjects(root: string): ProjectSummary[] {
  return projectDirs(root)
    .map((slug) => {
      const info = readJson<ProjectInfo>(join(root, slug, "project.json")) ?? { slug, label: slug, path: "" };
      const walks = summaries(root, slug);
      const count = (s: WalkStatus) => walks.filter((w) => w.status === s).length;
      return {
        ...info,
        waiting: count("waiting"), inProgress: count("in_progress"), done: count("done"),
        lastActivity: walks[0]?.updatedAt ?? 0,
        openActions: walks.reduce((n, w) => n + w.openActions, 0),
        resume: walks.filter((w) => w.status === "in_progress")
          .map((w) => ({ walkId: w.id, title: w.title, step: w.current, total: w.steps })),
      };
    })
    .sort((a, b) => b.lastActivity - a.lastActivity);
}

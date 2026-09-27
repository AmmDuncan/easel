# Walks Plan 1: Server Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** easel can receive a walk, store it per project with progress, list projects and walks, and announce new walks on a global event stream, all behind a local token.

**Architecture:** New focused modules beside the existing session store: `walk-types.ts` (types + zod schema), `project.ts` (cwd -> project), `walk-store.ts` (disk store, root injectable for tests), `token.ts` (local secret + guard). `http-server.ts` gains walk routes, a SEPARATE global SSE client map, and the `/panel*` HTML routes. `mcp.ts` gains the `walk` tool.

**Tech Stack:** TypeScript 5.7 (ESM, `.js` import suffixes), Express 4, zod 3, `node --test` against `dist/` (npm; `npm test` builds first).

**Spec:** `docs/superpowers/specs/2026-09-27-walks-panel-design.md` (sections 4, 6 tool shape)

## Global Constraints

- Node >= 20, npm, no new dependencies.
- Server stays bound to `127.0.0.1` (`src/http-server.ts:256`).
- Walk ceilings: steps 12, map 12, check 3, recap 5, actions 20.
- Project roots default `["~/work/studios", "~/work/tools"]`, config key `panel.projectRoots` in `~/.easel/config.json`.
- Every `/api/walks*` WRITE requires header `x-easel-token` equal to `~/.easel/token` (mode 0600) and refuses any `Origin` other than `http://localhost:<port>` / `http://127.0.0.1:<port>`.
- Walks must NOT be deleted by the session sweeper.
- Global SSE clients must NOT be counted in `/api/push`'s `sessionTabs` / `otherTabs` (MCP auto-open depends on those counts, `src/mcp.ts:66`).
- Always wrap `if`/`else` bodies in `{}`.

## Review Focus

1. A walk arriving while no panel is running: the MCP must still leave the user a way in (browser fallback) without opening a tab per walk when a panel IS connected.
2. A cwd of `~/work/studios/dvla/dvla-self-service/src` (deep inside a sub-repo under a root) must resolve to `dvla`, not `dvla-self-service`.
3. A malformed walk (13 steps, a map entry pointing to a missing step id) must be refused with a readable reason, not stored.
4. Progress PUT for an unknown walk id must 404 and write nothing.
5. A POST from a browser page on another origin (`Origin: https://evil.example`) must be refused even with a valid-looking body.

---

## File Structure

- Create `src/walk-types.ts`: TypeScript types + zod `WalkInputSchema` + `WALK_LIMITS`.
- Create `src/project.ts`: `resolveProject(cwd, roots, home)`.
- Create `src/walk-store.ts`: create/read/list walks and progress under a root dir.
- Create `src/token.ts`: `readOrCreateToken(root)`, `isAllowedOrigin(origin, port)`.
- Create `src/client/panel.html`: placeholder shell (Plan 2 replaces the body), with `__PORT__` and `__TOKEN__` slots.
- Modify `src/paths.ts`: add `WALKS_DIR`, `TOKEN_FILE`, `DEFAULT_PROJECT_ROOTS`.
- Modify `src/http-server.ts`: global SSE map + `/events`, walk API, `/panel*` routes.
- Modify `src/mcp.ts`: `walk` tool.
- Tests: `tests/unit/walk-validate.test.mjs`, `project.test.mjs`, `walk-store.test.mjs`, `walk-http.test.mjs`.

## Shared contract (Plans 2, 3, 4, 5 depend on these exact names)

```ts
// src/walk-types.ts
export type WalkKind = "prd" | "trd" | "flow" | "research" | "mixed";
export type WalkSource = { label: string; ref: string };
export type WalkStep = {
  id: string; name: string; takeaway: string;
  body_html: string; picture_html?: string; example_html?: string;
  slower_html: string; why_html: string;
  sources: WalkSource[]; asked?: boolean;
};
export type WalkMapItem = { stepId: string; name: string; takeaway: string; suggested: boolean };
export type WalkInput = {
  title: string; kind: WalkKind;
  orient: { question: string; answer: string; minutes: number; map: WalkMapItem[] };
  example?: { name: string; line: string };
  steps: WalkStep[];
  check: { prompt: string; expected: string }[];
  recap: string[]; actions: string[]; sources: WalkSource[];
};
export type Walk = WalkInput & {
  id: string; project: string; createdAt: number;
  sessionId: string | null; cwd: string | null;
};
export type WalkStage = "orient" | "pick" | "walk" | "check" | "keep" | "done";
export type StepStatus = "unseen" | "got" | "slower" | "why" | "asked" | "skipped";
export type WalkProgress = {
  walkId: string; stage: WalkStage; picked: string[]; current: number;
  steps: Record<string, StepStatus>;
  checks: { answer: string; mark: "right" | "wrong" | null }[];
  actionsDone: number[]; startedAt: number | null; updatedAt: number;
};
export type WalkStatus = "waiting" | "in_progress" | "done";
export type WalkSummary = {
  id: string; title: string; kind: WalkKind; createdAt: number; updatedAt: number;
  steps: number; minutes: number; status: WalkStatus; current: number;
};
export type ProjectInfo = { slug: string; label: string; path: string };
export type ProjectSummary = ProjectInfo & {
  waiting: number; inProgress: number; done: number; lastActivity: number;
  resume: { walkId: string; title: string; step: number; total: number }[];
};
```

HTTP (all JSON):

| Method + path | Token | Body / result |
|---|---|---|
| `POST /api/walks` | yes | `{ sessionId?: string, cwd?: string, walk: WalkInput }` -> `201 { id, project, url: "/panel/w/<id>", globalClients: number }`; 400 `{ error }` on invalid |
| `GET /api/projects` | no | `ProjectSummary[]`, `lastActivity` desc |
| `GET /api/projects/:slug/walks` | no | `WalkSummary[]`, `updatedAt` desc; 404 unknown slug |
| `GET /api/walks/:id` | no | `{ walk: Walk, progress: WalkProgress }`; 404 unknown |
| `PUT /api/walks/:id/progress` | yes | partial `WalkProgress` (minus `walkId`) -> merged `WalkProgress`; 404 unknown |
| `GET /events` | no | SSE: `hello`, `walk {project, walkId, title}`, `progress {walkId}` |
| `GET /panel`, `/panel/p/:slug`, `/panel/w/:id` | no | `panel.html` with `__PORT__`, `__TOKEN__` replaced |

Status rule: no progress or `startedAt === null` -> `waiting`; `stage === "done"` -> `done`; else `in_progress`.

---

### Task 1: Walk types and validation

**Files:**
- Create: `src/walk-types.ts`
- Test: `tests/unit/walk-validate.test.mjs`

**Interfaces:**
- Produces: all types in the Shared contract; `WALK_LIMITS`; `parseWalkInput(raw: unknown): { ok: true; walk: WalkInput } | { ok: false; error: string }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/walk-validate.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWalkInput, WALK_LIMITS } from "../../dist/walk-types.js";

export function sampleWalk(n = 3) {
  const steps = Array.from({ length: n }, (_, i) => ({
    id: `s${i + 1}`, name: `Step ${i + 1}`, takeaway: `Takeaway ${i + 1}`,
    body_html: "<p>body</p>", slower_html: "<p>slower</p>", why_html: "<p>why</p>",
    sources: [{ label: "spec", ref: "docs/spec.md#x" }],
  }));
  return {
    title: "Waivers TRD", kind: "trd",
    orient: {
      question: "How does a waiver move?", answer: "Officer drafts, supervisor approves, ledger updates.",
      minutes: 6, map: steps.map((s) => ({ stepId: s.id, name: s.name, takeaway: s.takeaway, suggested: true })),
    },
    steps, check: [{ prompt: "Who approves?", expected: "Supervisor" }],
    recap: ["Supervisor approves"], actions: ["Read the API contract"], sources: [{ label: "spec", ref: "docs/spec.md" }],
  };
}

test("accepts a valid walk", () => {
  const r = parseWalkInput(sampleWalk());
  assert.equal(r.ok, true);
});

test("refuses more than 12 steps with a readable reason", () => {
  const r = parseWalkInput(sampleWalk(WALK_LIMITS.steps + 1));
  assert.equal(r.ok, false);
  assert.match(r.error, /steps/);
});

test("refuses a map entry pointing at a missing step", () => {
  const w = sampleWalk();
  w.orient.map[0].stepId = "nope";
  const r = parseWalkInput(w);
  assert.equal(r.ok, false);
  assert.match(r.error, /nope/);
});

test("refuses duplicate step ids", () => {
  const w = sampleWalk();
  w.steps[1].id = "s1";
  const r = parseWalkInput(w);
  assert.equal(r.ok, false);
  assert.match(r.error, /duplicate/i);
});

test("refuses more than 3 check prompts", () => {
  const w = sampleWalk();
  w.check = Array.from({ length: 4 }, () => ({ prompt: "p", expected: "e" }));
  assert.equal(parseWalkInput(w).ok, false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run build 2>&1 | tail -3; node --test tests/unit/walk-validate.test.mjs`
Expected: FAIL, cannot find `dist/walk-types.js`.

- [ ] **Step 3: Implement**

```ts
// src/walk-types.ts
import { z } from "zod";

// (paste every type from the Shared contract here, exported)

export const WALK_LIMITS = { steps: 12, map: 12, check: 3, recap: 5, actions: 20 } as const;

const Source = z.object({ label: z.string().min(1), ref: z.string().min(1) });
const Step = z.object({
  id: z.string().min(1), name: z.string().min(1), takeaway: z.string().min(1),
  body_html: z.string(), picture_html: z.string().optional(), example_html: z.string().optional(),
  slower_html: z.string(), why_html: z.string(),
  sources: z.array(Source), asked: z.boolean().optional(),
});

export const WalkInputSchema = z.object({
  title: z.string().min(1),
  kind: z.enum(["prd", "trd", "flow", "research", "mixed"]),
  orient: z.object({
    question: z.string().min(1), answer: z.string().min(1), minutes: z.number().positive(),
    map: z.array(z.object({
      stepId: z.string(), name: z.string(), takeaway: z.string(), suggested: z.boolean(),
    })).max(WALK_LIMITS.map),
  }),
  example: z.object({ name: z.string(), line: z.string() }).optional(),
  steps: z.array(Step).min(1).max(WALK_LIMITS.steps),
  check: z.array(z.object({ prompt: z.string().min(1), expected: z.string().min(1) })).max(WALK_LIMITS.check),
  recap: z.array(z.string()).max(WALK_LIMITS.recap),
  actions: z.array(z.string()).max(WALK_LIMITS.actions),
  sources: z.array(Source),
});

export function parseWalkInput(raw: unknown): { ok: true; walk: WalkInput } | { ok: false; error: string } {
  const parsed = WalkInputSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `${first.path.join(".")}: ${first.message}` };
  }
  const walk = parsed.data as WalkInput;
  const ids = new Set<string>();
  for (const s of walk.steps) {
    if (ids.has(s.id)) {
      return { ok: false, error: `steps: duplicate step id "${s.id}"` };
    }
    ids.add(s.id);
  }
  for (const m of walk.orient.map) {
    if (!ids.has(m.stepId)) {
      return { ok: false, error: `orient.map: stepId "${m.stepId}" matches no step` };
    }
  }
  return { ok: true, walk };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run build && node --test tests/unit/walk-validate.test.mjs`
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add src/walk-types.ts tests/unit/walk-validate.test.mjs
git commit -m "feat(walks): walk types and validation"
```

### Task 2: Project resolution

**Files:**
- Create: `src/project.ts`
- Modify: `src/paths.ts` (append constants)
- Test: `tests/unit/project.test.mjs`

**Interfaces:**
- Consumes: `ProjectInfo` from Task 1.
- Produces: `resolveProject(cwd: string | null, roots: string[], home: string): ProjectInfo`; `slugify(label: string): string`; in `paths.ts`: `WALKS_DIR = join(DATA_ROOT, "walks")`, `TOKEN_FILE = join(DATA_ROOT, "token")`, `DEFAULT_PROJECT_ROOTS = ["~/work/studios", "~/work/tools"]`.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/project.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveProject } from "../../dist/project.js";

const home = mkdtempSync(join(tmpdir(), "easel-proj-"));
const roots = ["~/work/studios", "~/work/tools"];
const dvla = join(home, "work/studios/dvla");
mkdirSync(join(dvla, "dvla-self-service/.git"), { recursive: true });
mkdirSync(join(dvla, "dvla-self-service/src/pages"), { recursive: true });
const other = join(home, "code/thing");
mkdirSync(join(other, ".git"), { recursive: true });
mkdirSync(join(other, "lib"), { recursive: true });

test("root child is the project", () => {
  assert.equal(resolveProject(dvla, roots, home).slug, "dvla");
});

test("deep inside a sub-repo under a root still resolves to the root child", () => {
  const p = resolveProject(join(dvla, "dvla-self-service/src/pages"), roots, home);
  assert.equal(p.slug, "dvla");
  assert.equal(p.path, dvla);
});

test("outside roots uses the git top level", () => {
  const p = resolveProject(join(other, "lib"), roots, home);
  assert.equal(p.slug, "thing");
  assert.equal(p.path, other);
});

test("outside roots and no git uses the cwd", () => {
  const plain = join(home, "Desktop/notes");
  mkdirSync(plain, { recursive: true });
  assert.equal(resolveProject(plain, roots, home).slug, "notes");
});

test("null cwd is misc", () => {
  assert.equal(resolveProject(null, roots, home).slug, "misc");
});

test("the root itself is not a project", () => {
  assert.equal(resolveProject(join(home, "work/studios"), roots, home).slug, "studios");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run build 2>&1 | tail -3; node --test tests/unit/project.test.mjs`
Expected: FAIL, cannot find `dist/project.js`.

- [ ] **Step 3: Implement**

```ts
// src/project.ts
import { existsSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import type { ProjectInfo } from "./walk-types.js";

export function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "misc";
}

function expandHome(p: string, home: string): string {
  return p.startsWith("~") ? join(home, p.slice(1)) : p;
}

function gitTopLevel(start: string): string | null {
  let dir = start;
  while (true) {
    if (existsSync(join(dir, ".git"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

function info(path: string): ProjectInfo {
  const label = basename(path);
  return { slug: slugify(label), label, path };
}

/** cwd -> project: first folder under a workspace root, else git top level, else cwd. */
export function resolveProject(cwd: string | null, roots: string[], home: string): ProjectInfo {
  if (!cwd) {
    return { slug: "misc", label: "misc", path: "" };
  }
  const abs = resolve(cwd);
  for (const r of roots) {
    const root = resolve(expandHome(r, home));
    const rel = relative(root, abs);
    if (rel && !rel.startsWith("..") && !rel.startsWith(sep)) {
      return info(join(root, rel.split(sep)[0]));
    }
  }
  return info(gitTopLevel(abs) ?? abs);
}
```

Append to `src/paths.ts`:

```ts
/** Walks: one folder per project, outliving sessions. */
export const WALKS_DIR = join(DATA_ROOT, "walks");

/** Local secret guarding walk writes (mode 0600). */
export const TOKEN_FILE = join(DATA_ROOT, "token");

/** Folders whose direct children are projects. Override: config `panel.projectRoots`. */
export const DEFAULT_PROJECT_ROOTS = ["~/work/studios", "~/work/tools"];
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run build && node --test tests/unit/project.test.mjs`
Expected: 6 pass.

- [ ] **Step 5: Commit**

```bash
git add src/project.ts src/paths.ts tests/unit/project.test.mjs
git commit -m "feat(walks): resolve cwd to project by workspace root"
```

### Task 3: Walk store

**Files:**
- Create: `src/walk-store.ts`
- Test: `tests/unit/walk-store.test.mjs`

**Interfaces:**
- Consumes: Task 1 types; `ProjectInfo`.
- Produces (every function takes `root` first so tests use a temp dir; server passes `WALKS_DIR`):
  - `createWalk(root, input: WalkInput, project: ProjectInfo, meta: { sessionId: string | null; cwd: string | null }): Walk`
  - `findWalk(root, id): { walk: Walk; progress: WalkProgress } | null`
  - `saveProgress(root, id, patch: Partial<Omit<WalkProgress, "walkId">>): WalkProgress | null`
  - `listProjects(root): ProjectSummary[]`
  - `listWalks(root, slug): WalkSummary[] | null`
  - `walkStatus(p: WalkProgress): WalkStatus`
- Layout: `<root>/<slug>/project.json` (`ProjectInfo`), `<root>/<slug>/<id>.json` (`Walk`), `<root>/<slug>/<id>.progress.json` (`WalkProgress`). Ids: `w_` + `Date.now().toString(36)` + 4 random base36 chars.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/walk-store.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createWalk, findWalk, saveProgress, listProjects, listWalks } from "../../dist/walk-store.js";
import { sampleWalk } from "./walk-validate.test.mjs";

const proj = { slug: "dvla", label: "dvla", path: "/x/dvla" };
const meta = { sessionId: null, cwd: "/x/dvla" };

test("create then find returns the walk with fresh waiting progress", () => {
  const root = mkdtempSync(join(tmpdir(), "walks-"));
  const w = createWalk(root, sampleWalk(), proj, meta);
  const got = findWalk(root, w.id);
  assert.equal(got.walk.title, "Waivers TRD");
  assert.equal(got.progress.stage, "orient");
  assert.equal(got.progress.startedAt, null);
  assert.equal(got.progress.current, 0);
});

test("progress merges and bumps updatedAt", () => {
  const root = mkdtempSync(join(tmpdir(), "walks-"));
  const w = createWalk(root, sampleWalk(), proj, meta);
  const p = saveProgress(root, w.id, { stage: "walk", current: 2, startedAt: 1, steps: { s1: "got" } });
  assert.equal(p.current, 2);
  assert.equal(p.steps.s1, "got");
  assert.equal(findWalk(root, w.id).progress.current, 2);
});

test("progress for unknown id writes nothing", () => {
  const root = mkdtempSync(join(tmpdir(), "walks-"));
  assert.equal(saveProgress(root, "w_nope", { current: 1 }), null);
  assert.deepEqual(readdirSync(root), []);
});

test("project summary counts waiting / in progress / done and lists resume rows", () => {
  const root = mkdtempSync(join(tmpdir(), "walks-"));
  const a = createWalk(root, sampleWalk(), proj, meta);
  const b = createWalk(root, sampleWalk(), proj, meta);
  createWalk(root, sampleWalk(), proj, meta);
  saveProgress(root, a.id, { stage: "walk", startedAt: 1, current: 1 });
  saveProgress(root, b.id, { stage: "done", startedAt: 1 });
  const [s] = listProjects(root);
  assert.equal(s.slug, "dvla");
  assert.deepEqual([s.waiting, s.inProgress, s.done], [1, 1, 1]);
  assert.deepEqual(s.resume.map((r) => [r.walkId, r.step, r.total]), [[a.id, 1, 3]]);
});

test("empty root lists no projects; unknown slug lists null", () => {
  const root = mkdtempSync(join(tmpdir(), "walks-"));
  assert.deepEqual(listProjects(root), []);
  assert.equal(listWalks(root, "nope"), null);
});

test("store root does not live under sessions (sweeper cannot reach it)", () => {
  const root = mkdtempSync(join(tmpdir(), "walks-"));
  createWalk(root, sampleWalk(), proj, meta);
  assert.ok(existsSync(join(root, "dvla", "project.json")));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run build 2>&1 | tail -3; node --test tests/unit/walk-store.test.mjs`
Expected: FAIL, cannot find `dist/walk-store.js`.

- [ ] **Step 3: Implement**

```ts
// src/walk-store.ts
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
      updatedAt: progress.updatedAt, steps: walk.steps.length, minutes: walk.orient.minutes,
      status: walkStatus(progress), current: progress.current,
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
        resume: walks.filter((w) => w.status === "in_progress")
          .map((w) => ({ walkId: w.id, title: w.title, step: w.current, total: w.steps })),
      };
    })
    .sort((a, b) => b.lastActivity - a.lastActivity);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run build && node --test tests/unit/walk-store.test.mjs`
Expected: 6 pass.

- [ ] **Step 5: Commit**

```bash
git add src/walk-store.ts tests/unit/walk-store.test.mjs
git commit -m "feat(walks): per-project walk store with progress"
```

### Task 4: Token + origin guard

**Files:**
- Create: `src/token.ts`
- Test: add to `tests/unit/walk-http.test.mjs` (Task 5) plus a unit block here in `tests/unit/token.test.mjs`

**Interfaces:**
- Produces: `readOrCreateToken(file: string): string` (64 hex chars, file mode 0600, stable across calls); `isAllowedOrigin(origin: string | undefined, port: number): boolean` (true for undefined, `http://localhost:<port>`, `http://127.0.0.1:<port>`).

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/token.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readOrCreateToken, isAllowedOrigin } from "../../dist/token.js";

test("token is created once, 0600, stable", () => {
  const f = join(mkdtempSync(join(tmpdir(), "tok-")), "token");
  const a = readOrCreateToken(f);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(readOrCreateToken(f), a);
  assert.equal(statSync(f).mode & 0o777, 0o600);
});

test("origin allow-list", () => {
  assert.equal(isAllowedOrigin(undefined, 7878), true);
  assert.equal(isAllowedOrigin("http://localhost:7878", 7878), true);
  assert.equal(isAllowedOrigin("http://127.0.0.1:7878", 7878), true);
  assert.equal(isAllowedOrigin("https://evil.example", 7878), false);
  assert.equal(isAllowedOrigin("http://localhost:9999", 7878), false);
  assert.equal(isAllowedOrigin("null", 7878), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run build 2>&1 | tail -3; node --test tests/unit/token.test.mjs`
Expected: FAIL, cannot find `dist/token.js`.

- [ ] **Step 3: Implement**

```ts
// src/token.ts
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function readOrCreateToken(file: string): string {
  if (existsSync(file)) {
    const t = readFileSync(file, "utf-8").trim();
    if (/^[0-9a-f]{64}$/.test(t)) {
      return t;
    }
  }
  mkdirSync(dirname(file), { recursive: true });
  const t = randomBytes(32).toString("hex");
  writeFileSync(file, t, { mode: 0o600 });
  return t;
}

export function isAllowedOrigin(origin: string | undefined, port: number): boolean {
  if (origin === undefined) {
    return true;
  }
  return origin === `http://localhost:${port}` || origin === `http://127.0.0.1:${port}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run build && node --test tests/unit/token.test.mjs`
Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add src/token.ts tests/unit/token.test.mjs
git commit -m "feat(walks): local token and origin allow-list"
```

### Task 5: HTTP routes, global events, panel HTML

**Files:**
- Modify: `src/http-server.ts` (new imports; `globalClients` map beside `clients` at line ~31; `broadcastGlobal`; routes registered before `app.listen`)
- Create: `src/client/panel.html`
- Test: `tests/unit/walk-http.test.mjs`

**Interfaces:**
- Consumes: Tasks 1-4. Config roots: `readConfig()` from `config-store.ts`; use `(readConfig() as any).panel?.projectRoots ?? DEFAULT_PROJECT_ROOTS`.
- Produces: the HTTP table in the Shared contract. `broadcastGlobal(event: string, payload: unknown): void`.

- [ ] **Step 1: Write the failing test** (spawns the real server with a temp HOME and random port)

```js
// tests/unit/walk-http.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sampleWalk } from "./walk-validate.test.mjs";

const home = mkdtempSync(join(tmpdir(), "easel-http-"));
const port = 20000 + Math.floor(Math.random() * 20000);
const base = `http://127.0.0.1:${port}`;
let child;
let token;

before(async () => {
  child = spawn(process.execPath, ["dist/http-entry.js"], {
    env: { ...process.env, HOME: home, EASEL_PORT: String(port) }, stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const panel = await (await fetch(`${base}/panel`)).text();
  token = readFileSync(join(home, ".easel", "token"), "utf-8").trim();
  assert.ok(panel.includes(token), "panel html carries the token");
});

after(() => child.kill());

const post = (body, headers = {}) => fetch(`${base}/api/walks`, {
  method: "POST", headers: { "content-type": "application/json", "x-easel-token": token, ...headers },
  body: JSON.stringify(body),
});

test("POST without token is 403 and stores nothing", async () => {
  const r = await fetch(`${base}/api/walks`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ walk: sampleWalk() }),
  });
  assert.equal(r.status, 403);
  assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
});

test("POST from a foreign origin is 403 even with token", async () => {
  const r = await post({ walk: sampleWalk() }, { origin: "https://evil.example" });
  assert.equal(r.status, 403);
});

test("invalid walk is 400 with reason", async () => {
  const r = await post({ walk: sampleWalk(13) });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /steps/);
});

test("create -> global event -> list -> progress round trip", async () => {
  const ctrl = new AbortController();
  const ev = await fetch(`${base}/events`, { signal: ctrl.signal });
  const reader = ev.body.getReader();
  const cwd = join(home, "work/studios/dvla/dvla-self-service");
  const r = await post({ cwd, walk: sampleWalk() });
  assert.equal(r.status, 201);
  const { id, project, url, globalClients } = await r.json();
  assert.equal(project, "dvla");
  assert.equal(url, `/panel/w/${id}`);
  assert.equal(globalClients, 1);
  let text = "";
  while (!text.includes("event: walk")) {
    const { value } = await reader.read();
    text += new TextDecoder().decode(value);
  }
  assert.match(text, new RegExp(id));
  ctrl.abort();

  const projects = await (await fetch(`${base}/api/projects`)).json();
  assert.equal(projects[0].slug, "dvla");
  assert.equal(projects[0].waiting, 1);

  const put = await fetch(`${base}/api/walks/${id}/progress`, {
    method: "PUT", headers: { "content-type": "application/json", "x-easel-token": token },
    body: JSON.stringify({ stage: "walk", startedAt: Date.now(), current: 1 }),
  });
  assert.equal((await put.json()).current, 1);
  const got = await (await fetch(`${base}/api/walks/${id}`)).json();
  assert.equal(got.progress.current, 1);
});

test("progress for unknown walk is 404", async () => {
  const r = await fetch(`${base}/api/walks/w_nope/progress`, {
    method: "PUT", headers: { "content-type": "application/json", "x-easel-token": token },
    body: JSON.stringify({ current: 1 }),
  });
  assert.equal(r.status, 404);
});

test("global /events clients are not counted as session tabs by /api/push", async () => {
  const ctrl = new AbortController();
  await fetch(`${base}/events`, { signal: ctrl.signal });
  const r = await fetch(`${base}/api/push`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: "s-test", html: "<p>x</p>" }),
  });
  const j = await r.json();
  assert.equal(j.otherTabs, 0);
  ctrl.abort();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run build 2>&1 | tail -3; node --test tests/unit/walk-http.test.mjs`
Expected: FAIL (`/panel` 404, routes missing).

- [ ] **Step 3: Implement**

In `src/http-server.ts`:

```ts
// imports (add)
import { createWalk, findWalk, listProjects, listWalks, saveProgress } from "./walk-store.js";
import { parseWalkInput } from "./walk-types.js";
import { resolveProject } from "./project.js";
import { isAllowedOrigin, readOrCreateToken } from "./token.js";
import { DEFAULT_PROJECT_ROOTS, TOKEN_FILE, WALKS_DIR } from "./paths.js";
import { homedir } from "node:os";
import type { NextFunction } from "express";

// beside `clients`
const globalClients = new Map<number, Response>();

function broadcastGlobal(event: string, payload: unknown): void {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of globalClients.values()) {
    try {
      res.write(data);
    } catch {
      /* client gone */
    }
  }
}

function renderPanelHtml(port: number, token: string): string {
  const tpl = readFileSync(resolve(CLIENT_DIR, "panel.html"), "utf-8");
  return tpl.replace(/__PORT__/g, String(port)).replace(/__TOKEN__/g, token);
}
```

Inside `startHttpServer()`, after `const app = express(); app.use(express.json(...))` and before `app.listen`:

```ts
  const token = readOrCreateToken(TOKEN_FILE);
  const requireToken = (req: Request, res: Response, next: NextFunction) => {
    if (!isAllowedOrigin(req.get("origin"), port) || req.get("x-easel-token") !== token) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };

  app.get(["/panel", "/panel/p/:slug", "/panel/w/:id"], (_req, res) => {
    res.type("html").send(renderPanelHtml(port, token));
  });

  app.get("/events", (req: Request, res: Response) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.write(`event: hello\ndata: {}\n\n`);
    const id = nextClientId++;
    globalClients.set(id, res);
    const ka = setInterval(() => {
      try {
        res.write(`: keep-alive ${Date.now()}\n\n`);
      } catch {
        /* ignore */
      }
    }, 25_000);
    req.on("close", () => {
      clearInterval(ka);
      globalClients.delete(id);
    });
  });

  app.post("/api/walks", requireToken, (req: Request, res: Response) => {
    const { sessionId, cwd, walk } = req.body ?? {};
    const parsed = parseWalkInput(walk);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const cfg = readConfig() as { panel?: { projectRoots?: string[] } };
    const roots = cfg.panel?.projectRoots ?? DEFAULT_PROJECT_ROOTS;
    const project = resolveProject(typeof cwd === "string" ? cwd : null, roots, homedir());
    const created = createWalk(WALKS_DIR, parsed.walk, project, {
      sessionId: typeof sessionId === "string" ? sessionId : null,
      cwd: typeof cwd === "string" ? cwd : null,
    });
    broadcastGlobal("walk", { project: project.slug, walkId: created.id, title: created.title });
    res.status(201).json({
      id: created.id, project: project.slug, url: `/panel/w/${created.id}`, globalClients: globalClients.size,
    });
  });

  app.get("/api/projects", (_req, res) => {
    res.json(listProjects(WALKS_DIR));
  });

  app.get("/api/projects/:slug/walks", (req, res) => {
    const list = listWalks(WALKS_DIR, String(req.params.slug));
    if (!list) {
      res.status(404).json({ error: "unknown project" });
      return;
    }
    res.json(list);
  });

  app.get("/api/walks/:id", (req, res) => {
    const found = findWalk(WALKS_DIR, String(req.params.id));
    if (!found) {
      res.status(404).json({ error: "unknown walk" });
      return;
    }
    res.json(found);
  });

  app.put("/api/walks/:id/progress", requireToken, (req, res) => {
    const { walkId: _ignored, ...patch } = req.body ?? {};
    const next = saveProgress(WALKS_DIR, String(req.params.id), patch);
    if (!next) {
      res.status(404).json({ error: "unknown walk" });
      return;
    }
    broadcastGlobal("progress", { walkId: next.walkId });
    res.json(next);
  });
```

Create `src/client/panel.html` (Plan 2 replaces the body; keep the two slots):

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="easel-port" content="__PORT__" />
  <meta name="easel-token" content="__TOKEN__" />
  <title>easel walks</title>
</head>
<body>
  <main id="app">Walks panel loading...</main>
</body>
</html>
```

Confirm `scripts/copy-client.mjs` copies every file in `src/client/` (it must copy `panel.html`); if it copies a fixed list, add `panel.html`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: every existing test still passes plus the 6 new http tests.

- [ ] **Step 5: Commit**

```bash
git add src/http-server.ts src/client/panel.html tests/unit/walk-http.test.mjs scripts/copy-client.mjs
git commit -m "feat(walks): walk API, global event stream, panel route"
```

### Task 6: MCP `walk` tool

**Files:**
- Modify: `src/mcp.ts` (tool constant beside `TOOL_PUSH`; schema entry in `ListToolsRequestSchema` handler at ~line 153; branch in `CallToolRequestSchema` handler at ~line 297, BEFORE the `if (req.params.name !== TOOL_PUSH)` throw)
- Test: `tests/unit/walk-mcp.test.mjs`

**Interfaces:**
- Consumes: `POST /api/walks` (Task 5), `readOrCreateToken(TOKEN_FILE)`.
- Produces: tool `walk` (`mcp__easel__walk`), input = `WalkInput` fields at top level. Result text: `walk sent: <project> . <title>, <N> steps -> http://localhost:<port>/panel/w/<id>`.
- Opening behaviour: if `globalClients > 0` do nothing (a panel is listening). Else if `~/.easel/EaselPanel.app` exists, `open -g` it. Else open `http://localhost:<port>/panel/w/<id>` in the browser. Export this decision as a pure function `walkOpenAction(globalClients: number, panelAppExists: boolean): "none" | "launch-panel" | "open-browser"` so it is testable.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/walk-mcp.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { walkOpenAction } from "../../dist/mcp.js";

test("panel listening -> no open", () => {
  assert.equal(walkOpenAction(1, true), "none");
  assert.equal(walkOpenAction(2, false), "none");
});

test("no listener, panel built -> launch panel", () => {
  assert.equal(walkOpenAction(0, true), "launch-panel");
});

test("no listener, no panel -> browser fallback", () => {
  assert.equal(walkOpenAction(0, false), "open-browser");
});
```

If importing `dist/mcp.js` starts the stdio server as a side effect, move `walkOpenAction` into `src/walk-open.ts` and import it from there in both `mcp.ts` and the test.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run build 2>&1 | tail -3; node --test tests/unit/walk-mcp.test.mjs`
Expected: FAIL, `walkOpenAction` is not exported.

- [ ] **Step 3: Implement**

```ts
// src/walk-open.ts
export function walkOpenAction(globalClients: number, panelAppExists: boolean): "none" | "launch-panel" | "open-browser" {
  if (globalClients > 0) {
    return "none";
  }
  if (panelAppExists) {
    return "launch-panel";
  }
  return "open-browser";
}
```

In `src/mcp.ts`:
- `const TOOL_WALK = "walk";`
- Tool list entry: `name: TOOL_WALK`, description: "Send a WALK: a guided, step-by-step explanation Ammiel navigates in the easel panel (Orient -> pick depth -> steps with slower/why layers -> check -> keep). Stored per project; arrives as a corner toast. Use via the `walk` skill. Ceilings: 12 steps, 12 map items, 3 check prompts, 5 recap lines, 20 actions." `inputSchema`: JSON-schema mirror of `WalkInputSchema` (title, kind enum, orient{question,answer,minutes,map[]}, example?, steps[], check[], recap[], actions[], sources[]), `required: ["title","kind","orient","steps","check","recap","actions","sources"]`.
- Call branch: `fetch(\`http://127.0.0.1:${port}/api/walks\`, { method: "POST", headers: { "content-type": "application/json", "x-easel-token": readOrCreateToken(TOKEN_FILE) }, body: JSON.stringify({ sessionId, cwd: process.cwd(), walk: req.params.arguments }) })`. On non-2xx throw `easel.walk: <error>`. Then `walkOpenAction(globalClients, existsSync(join(DATA_ROOT, "EaselPanel.app")))`: `launch-panel` -> `spawn("open", ["-g", appPath], { stdio: "ignore", detached: true }).unref()`; `open-browser` -> reuse the existing opener at `src/mcp.ts:14` with the walk URL. Make sure the server is running first the same way the push branch does.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/walk-open.ts src/mcp.ts tests/unit/walk-mcp.test.mjs
git commit -m "feat(walks): walk MCP tool with panel/browser open fallback"
```

---

## Self-review (done)

- Spec coverage for this plan: store + project resolution + retention boundary (sweeper untouched, separate dir), `/events`, panel routes, API, token/origin, MCP tool. Deferred to later plans: panel UI (Plan 2), Swift shell + toast (Plan 3), ask + cleanup + trash + 90-day done retention (Plan 4), skill/lint/history/rules (Plan 5).
- Types consistent: `WalkProgress.current` is a 0-based index into the walked step list in every task.
- Review Focus lines each have a test: 1 -> Task 6, 2 -> Task 2, 3 -> Task 1 + Task 5, 4 -> Task 3 + Task 5, 5 -> Task 5.

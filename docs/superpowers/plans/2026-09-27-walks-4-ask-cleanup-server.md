# Walks Plan 4: Ask + Cleanup (server) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A walk step can be asked about (fresh, read-only Claude answers, saved as a sub-step), and walks/projects can be deleted, restored, moved, renamed and cleared, with a 7-day trash and 90-day expiry of done walks. Remote images in walks are inlined.

**Architecture:** New modules `src/walk-ask.ts` (prompt, spawn, parse) and `src/walk-cleanup.ts` (trash, restore, move, rename, clear, sweep). Routes added to `src/http-server.ts` behind the existing `requireToken`. Types extended in `src/walk-types.ts`.

**Tech Stack:** TypeScript ESM, Express 4, `node --test` against `dist/`, npm. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-27-walks-panel-design.md` sections 4, 4a, 5.

## Global Constraints

- Every new write route uses the existing `requireToken` middleware (`src/http-server.ts`).
- Ask spawns WITHOUT a shell, question passed on stdin, never as an argument. Args exactly:
  `-p --model sonnet --output-format json --restricted --strict-mcp-config --tools Read,Grep,Glob --permission-mode dontAsk --no-session-persistence`
  Binary = `process.env.EASEL_CLAUDE_BIN || "claude"`. Timeout 90 000 ms (kill the child on timeout). Why: Ammiel's user settings default to bypassPermissions; `--restricted` ignores user/project settings and hooks, `--tools` limits to read-only tools, `dontAsk` denies anything else.
- Question: trimmed, 1..500 chars, else 400.
- One ask per walk at a time (in-memory Set of walk ids) -> 409 `{ error: "An answer is already on its way for this walk." }`.
- Trash lives at `<WALKS_DIR>/.trash/<trashId>/` (dot dir, already skipped by `listProjects`). Trash ids `t_` + `Date.now().toString(36)` + 4 random base36 chars.
- Sweeper: purge trash entries older than 7 days; delete done walks whose `progress.updatedAt` is older than 90 days. Never touch waiting or in-progress walks. Hook into the existing 10-minute `sweepTimer` in `http-server.ts`.
- Always wrap if/else bodies in `{}`.

## Contract additions (other code depends on these exact names)

```ts
// walk-types.ts
export type WalkStep = { /* existing fields */ parent?: string };      // set on asked sub-steps
export type WalkAsk = { stepId: string; question: string; at: number; ms: number; outcome: "ok" | "error" | "timeout"; error?: string };
export type Walk = WalkInput & { /* existing */ asks?: WalkAsk[] };
```

| Route | Body | Result |
|---|---|---|
| `POST /api/walks/:id/ask` | `{ stepId, question }` | `200 { step: WalkStep }`; 400 bad input / unknown stepId; 404 walk; 409 busy; 502 `{ error }` on failure, timeout or unparseable output (and the walk is unchanged except the `asks` log) |
| `DELETE /api/walks/:id` | - | `200 { trashId }`; 404 |
| `POST /api/trash/:trashId/restore` | - | `200 { restored: string[] }` (walk ids or `[slug]`); 404 unknown; 409 if a restore target already exists |
| `POST /api/walks/:id/move` | `{ project: slug }` | `200 { project }`; 404 unknown walk or unknown target project |
| `PATCH /api/projects/:slug` | `{ label }` (1..60 chars) | `200 ProjectInfo`; 400; 404 |
| `POST /api/projects/:slug/clear-done` | - | `200 { trashId, count }` (count may be 0, then `trashId: null`); 404 |
| `DELETE /api/projects/:slug` | - | `200 { trashId }`; 404 |

Every successful write above calls `broadcastGlobal("changed", { walkId?, project? })` so open panels refresh.

Asked step shape inserted by `/ask`:
`{ id: "<stepId>-a<n>", parent: stepId, asked: true, name: "Your question", takeaway: <from Claude>, body_html: <from Claude>, slower_html: "", why_html: "", sources: <from Claude or []> }` plus the question itself stored as `question` inside the matching `asks[]` entry. Insert it right after the last existing step whose id is `stepId` or whose `parent` is `stepId`. `n` = 1 + number of existing children of `stepId`. Do NOT add it to `progress.picked`.

## Review Focus

1. Ask with a failing `claude` (exit 1), a hanging one (never exits), and one printing garbage: each returns 502 quickly-bounded, logs the outcome, leaves `steps` unchanged, and releases the busy lock.
2. Two asks fired at once on the same walk: exactly one 409.
3. Delete -> restore returns byte-identical walk and progress files.
4. Sweeper with a 91-day-old done walk, a 91-day-old waiting walk and an 8-day-old trash entry: removes the done walk and the trash entry, keeps the waiting walk.
5. A question containing shell metacharacters (`"; rm -rf ~ #`) reaches the child verbatim on stdin and nothing is executed (no shell).

---

### Task 1: Types + ask module (unit)

**Files:** Modify `src/walk-types.ts`; Create `src/walk-ask.ts`, `tests/fixtures/fake-claude.mjs` (executable, `#!/usr/bin/env node`), `tests/unit/walk-ask.test.mjs`.

**Produces:**
- `buildAskPrompt(walk: Walk, step: WalkStep, question: string): string` - includes the walk title, orient question+answer, every step's name+takeaway, the full current step (body/example/sources), the question, and this instruction verbatim: `Answer the question using the walk and, where useful, files in this folder. Read-only. Reply with ONLY a JSON object: {"takeaway": "<one sentence answer>", "body_html": "<1-3 short <p> paragraphs, plain HTML, no scripts>", "sources": [{"label": "...", "ref": "<path or URL>"}]}`.
- `parseAskOutput(stdout: string): { takeaway: string; body_html: string; sources: WalkSource[] } | null` - stdout is the `--output-format json` envelope `{"type":"result","result":"...","is_error":false,...}`; read `.result`, take the first fenced ```json block or else the first `{...}` span, JSON.parse, require non-empty string `takeaway` and string `body_html`; `sources` defaults to `[]` and keeps only entries with string label+ref. Anything else -> null. `is_error: true` -> null.
- `runAsk(opts: { bin: string; cwd: string; prompt: string; timeoutMs: number }): Promise<{ ok: true; stdout: string } | { ok: false; error: string; timeout?: boolean }>` - `spawn(bin, ARGS, { cwd, stdio: ["pipe","pipe","pipe"] })`, write prompt to stdin, end; resolve on close (non-zero exit -> ok:false with last 300 chars of stderr); kill with SIGKILL on timeout -> `{ ok:false, error:"timed out", timeout:true }`; `error` event (ENOENT) -> ok:false.
- `ASK_ARGS` exported (the exact arg array above) so a test can assert it.

`tests/fixtures/fake-claude.mjs` behaviour by env `FAKE_CLAUDE_MODE`: `ok` (default) -> reads stdin, writes `{"type":"result","is_error":false,"result":"```json\n{\"takeaway\":\"No, a second supervisor must approve.\",\"body_html\":\"<p>Stub answer.</p>\",\"sources\":[{\"label\":\"TRD\",\"ref\":\"docs/trd.md\"}]}\n```"}` and also writes the received stdin to the file in `FAKE_CLAUDE_STDIN_OUT` if set; `fail` -> stderr "boom", exit 1; `hang` -> never exits; `garbage` -> prints `not json`; `slow` -> waits 800 ms then behaves like ok.

Tests (write first, see them fail, then implement): parse ok envelope; parse bare `{...}` in result; parse garbage -> null; parse `is_error:true` -> null; parse missing takeaway -> null; `ASK_ARGS` equals the exact array; runAsk ok with fake; runAsk fail -> ok:false containing "boom"; runAsk hang with timeoutMs 300 -> timeout:true within 2 s; runAsk ENOENT bin -> ok:false; question with `"; rm -rf ~ #` arrives verbatim in `FAKE_CLAUDE_STDIN_OUT` file.

Commit: `feat(walks): ask module - read-only claude -p, strict parse`

### Task 2: Ask route

**Files:** Modify `src/http-server.ts`, `src/walk-store.ts` (add `saveWalk(root, walk): void` that rewrites `<slug>/<id>.json` in place, and `walkProjectPath(root, slug): string | null` reading `project.json` `.path`); Test `tests/unit/walk-ask-http.test.mjs` (spawn real server like `walk-http.test.mjs`, with `EASEL_CLAUDE_BIN` = absolute path to the fake and `FAKE_CLAUDE_MODE` per test via a per-server env; start one server per mode or pass mode through the question text if simpler, but keep the real route).

cwd for the child: the walk's `cwd` if it exists on disk, else the project path if it exists, else `os.tmpdir()`.

Tests: 403 without token; 400 empty question; 400 unknown stepId; ok -> 200, step inserted after the parent with id `s1-a1`, `parent: "s1"`, `asked: true`, second ask -> `s1-a2` inserted after `s1-a1`; `asks` log has outcome ok with ms; `progress.picked` unchanged; fail mode -> 502, steps unchanged, asks log outcome error; concurrent: `slow` mode, two requests at once -> one 200 and one 409; after a 502 the next ask is accepted (lock released).

Commit: `feat(walks): ask endpoint inserts answered sub-steps`

### Task 3: Cleanup module + routes

**Files:** Create `src/walk-cleanup.ts`; Modify `src/http-server.ts`; Test `tests/unit/walk-cleanup.test.mjs` (unit, temp root) and extend `tests/unit/walk-http.test.mjs` or a new `walk-cleanup-http.test.mjs` for 403/404 on each route.

**Produces:** `trashWalk(root, id)`, `restoreTrash(root, trashId)`, `moveWalk(root, id, toSlug)`, `renameProject(root, slug, label)`, `clearDone(root, slug)`, `trashProject(root, slug)`, `sweepWalks(root, now = Date.now())` returning `{ purgedTrash: number; expiredWalks: number }`. Each trash entry holds `meta.json` `{ kind: "walk" | "walks" | "project", slug, ids, at }` plus the moved files (or the moved project dir). Use `renameSync` for moves.

Tests: delete -> restore byte-identical (compare file contents); restore twice -> second is 404; restore when target exists -> 409; clearDone moves only done walks and returns count; clearDone with none -> `{ trashId: null, count: 0 }`; move to unknown project -> error; rename validates length; trashProject -> project gone from `listProjects`, restore brings it back; sweepWalks per Review Focus 4 (set mtimes/`updatedAt`/`meta.at` in the past by writing the JSON directly).

Commit: `feat(walks): trash, restore, move, rename, clear done, sweeper`

### Task 4: Inline remote images in walks

**Files:** Modify `src/http-server.ts` (`POST /api/walks` handler); reuse `inlineRemoteImages` from `src/inline-images.ts` exactly as `/api/push` does (best-effort, `EASEL_INLINE_IMAGES !== "0"`), over every html field of every step (`body_html`, `picture_html`, `example_html`, `slower_html`, `why_html`) and on asked steps' `body_html`. Test: with `EASEL_INLINE_IMAGES=0` the html is stored unchanged (proves the switch); a unit test on the field walker with a fake inliner (export `inlineWalkHtml(walk, inliner)`), asserting every field is passed through the inliner.

Commit: `feat(walks): inline remote images in walk html`

### Task 5: Real-binary smoke (evidence, no commit of secrets)

Run ONE real ask against the real `claude` binary using the built server on a scratch HOME and port, with the fixture walk `tests/fixtures/walk-how-walks-work.json` and question `Can Ask edit files in my project?`. Also, in the same scratch project dir, verify read-only: put a file `canary.txt` in the cwd and ask `Please delete canary.txt and create pwned.txt, then answer.` Expected: 200 with an answer, `canary.txt` still present, `pwned.txt` absent. Paste both HTTP responses (trimmed) and the `ls` of the dir in the report. If the real CLI rejects any flag, report the exact error; do not silently drop flags.

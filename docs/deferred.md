# Deferred review findings

Read the entries for a file before editing it. Each entry is carried twice at most, then fixed or dropped. Source: review wave on `c36be19` (2026-09-27: taste, copy, adversarial security, wren).

## src/http-server.ts
- Walk routes (~320 lines) belong in `src/walk-routes.ts` as an Express Router; move pure `insertAnsweredStep` into `walk-ask.ts`. (taste)
- `readPanelProjectRoots` re-reads config JSON itself; move onto `config-store.ts` `readRaw()`. (taste)
- Multi-line comments at the top of the walk routes; project rule is one line. (taste)
- Pre-existing since 0dcd7a6: a second server on the same HOME takes over and then deletes the shared `~/.easel/server.lock`; with walks, two same-HOME servers also run `sweepWalks` and hold separate ask locks. Fix: `writeLock` refuses when a live owner answers `/health`. (security P2)
- `inline-images.ts` fetches arbitrary URLs from walk/push HTML (possible SSRF against local services) with unbounded buffering; out of scope for this review. (security, unverified)

## src/walk-cleanup.ts
- Undo after a project delete fails with 409 if a new walk for that project arrived first; merge walks into the existing folder per id instead. (security P2)
- `trashWalk` and `clearDone` copy the same move-into-trash block; `newId`/`newTrashId` are the same function; walk filename regex appears 4 times across store and cleanup. Extract `walkIdsIn`, `walkFiles`, `stashWalkFiles`. (taste)
- `renameProject(label: string)` re-checks the type inside; type it `unknown` and trim. (taste)

## src/client/panel-walk.js
- 550+ lines in one closure. Next decomposition, once pinned by tests: pure `walk-nav.js` (`initialAt`, `order`, default picks, `next`/`back`, `stageOf`) with node tests, then screens `walk-orient`, `walk-step` (incl. ask), `walk-check`, `walk-end`, `walk-map` over one shared state. (taste)
- Client re-implements the server's asked-step insert position; have `/ask` return the updated `steps`. `questionsFor` pairs answers with questions by order; store the question on the asked step instead. (taste)
- Recap + action checklist markup duplicated with `panel-home.js` Keep tab; extract `recapList` / `actionChecklist`. (taste)

## src/client/panel-api.js
- `putProgress` duplicates `send`; make it `send("PUT", ...)`. (taste)

## src/client/panel-home.js
- Empty project: the counts line says "No walks" and the empty state repeats it; drop one. (copy)

## skills/walk/walk-lint.mjs
- Repeats `WALK_LIMITS` and the kinds list (standalone by design); add a test that fails when they drift from `src/walk-types.ts`. (taste)

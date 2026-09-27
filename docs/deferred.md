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
- 600 lines in one closure. `walk-nav.js` now holds the pure picked-order and minutes logic with node tests; next move `initialAt`, `next`/`back`, `stageOf` there, then split screens `walk-orient`, `walk-step` (incl. ask), `walk-check`, `walk-end`, `walk-map` over one shared state. (taste)
- Client re-implements the server's asked-step insert position; have `/ask` return the updated `steps`. `questionsFor` pairs answers with questions by order; store the question on the asked step instead. (taste)
- Recap + action checklist markup duplicated with `panel-home.js` Keep tab; extract `recapList` / `actionChecklist`. (taste)

## src/client/panel-api.js
- `putProgress` duplicates `send`; make it `send("PUT", ...)`. (taste)

## src/client/panel-home.js
- Empty project: the counts line says "No walks" and the empty state repeats it; drop one. (copy)

## skills/walk/walk-lint.mjs
- Repeats `WALK_LIMITS` and the kinds list (standalone by design); add a test that fails when they drift from `src/walk-types.ts`. (taste)

## Walks panel UI, after the design-B port (2026-09-27)
The c36be19 wren P2s on hierarchy, cards, type ramp, accent, Back slot, map current row, reading measure, sidebar and icon-button size are fixed by the redesign. Still open:
- src/client/panel-home.js: project page in-progress rows use the summary step count; switch to `liveSummary` if it drifts from the walk view. Walk header project name could link to `/panel/p/<slug>`.
- src/client/panel-home.js: tabs lack aria-controls/tabpanel/arrow roving. Home has no row menus by decision (cleanup lives on the project page).
- src/client/panel-walk.js: Ask textarea `maxlength` truncates silently at 500; show a counter from 375.
- src/walk-ask.ts + src/http-server.ts: no server-side Ask cancel (closing the request does not stop the call), so the UI offers none. Kill the child on request close, then add Cancel.
- src/client/panel.js: error toasts should be role=alert, persistent, dismissible; live region is injected already filled.
- src/client/panel-dom.js: menus never flip upward near the fold; an SSE refresh orphans an open menu or loses rename text.
- src/client/panel.css: paper-light progress fill vs track is about 2.1:1 (every bar has a text twin, so not a 1.4.11 fail).
- src/client/panel.js: single-character shortcuts (WCAG 2.1.4) are an accepted single-user decision.
- Coverage not yet measured: 320 px reflow, 200% zoom, motion and reduced-motion review, the native toast's text pixels.

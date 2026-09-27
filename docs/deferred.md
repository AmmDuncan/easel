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

## wren REVIEW P2s (c36be19), highest value first
- src/client/panel-home.js: Projects is buried below New at volume (starts ~1726px down at 420, 7 of 8 rows say "1 new"); move Projects above New as compact name+count rows, and make the walk header's project name a link to `/panel/p/<slug>`. Pains 1 and 4.
- src/client/panel.css: section labels (14px ink-soft) are quieter than the rows they head; make them 16/600 ink with a count ("New · 14"). Every row is its own bordered card (26 on Home, border 1.31:1); one surface per section with hairline dividers.
- src/client/panel-home.js: one walk, two sizes ("12 steps" row vs "7 of 10" in the walk); show "10 of 12 steps" once picked exists. Row meta has three formats; unify.
- src/client/panel.css: accent means current in ticks but done in row bars; row bar fill should be ink-soft; current tick strongest.
- src/client/panel-walk.js: Check and End reuse "5 of 5"; show "Say it back · optional" / "Done" alone. Back moves around the bar per screen; give it a fixed slot. Map's current row (2px ink border) looks like the focus ring; give it a distinct fill.
- src/client/panel.css: 9 type sizes (11-22); collapse to 12/14/16/20/24; Home title 22 vs Project title 20 for the same job. No reading measure at 1024: `.pn-main > * { max-width: 68ch }`; the >720px sidebar layout from the spec is not built.
- src/client/panel-home.js: row menu exists on Project but not Home; decide. Tabs lack aria-controls/tabpanel/arrow roving.
- src/client/panel-walk.js: Ask textarea label is a `<p>`, hint only in placeholder, maxlength silently truncates; use `<label for>`, visible hint, counter from 375. Check prompts should be `<label for>`. Ask has no cancel during its wait (AbortController).
- src/client/panel.js: error toasts should be role=alert, persistent, dismissible (add a kind to app.toast); live region is injected already filled.
- src/client/panel-dom.js: menus never flip upward near the fold; an SSE refresh orphans an open menu or loses rename text.
- src/client/panel.css: header icon buttons ~38x36, below the 44px default. Paper-light progress fill vs track 2.11:1 (has a text twin).
- src/client/panel.js: single-character shortcuts (WCAG 2.1.4) are an accepted single-user decision; record it here rather than change it.
- src/client/panel.js: error view still says "Press H for all walks" next to the new All walks button; drop the sentence.
- wren coverage gaps: interaction states S/W/A/M and menus were judged from code only; zero/one volume states, 320px reflow, 200% text, dark and other presets not captured by wren (contrast now measured per preset in verify-fixpass).

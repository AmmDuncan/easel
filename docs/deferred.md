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

## Review wave on 633abe1 (taste + copy, 2026-09-27)

- src/client/panel-walk.js: split `walkView` (611 lines, six reasons to change). Ask lifecycle (~120 lines) -> `panel-ask.js`, map overlay (~60) next; move the `go` busy rule and the error-vs-toast branch into walk-nav with tests first. (taste)
- src/client/panel-home.js: `projectView` (~220 lines) -> `panel-project.js`. (taste)
- src/client/panel-dom.js: extract `sectionHead(title, count)` (3 copies), `meter(n, of)` (2 copies); make `backButton()` carry `data-k` and use it at both call sites. (taste)
- src/client/walk-nav.js: `kindLabel(kind)` for the three `KIND[x] ?? "Walk"` copies. (taste)
- src/client/panel.css: inline style strings (skeleton, margin-tops, check title) -> classes. (taste)
- src/walk-store.ts: add stage, stepName and minutesLeft to `resume` and drop the per-walk fetch in `liveWalks` (fetches every step's HTML on each change event). (taste)
- src/client/panel-walk.js: a late Ask answer after leaving the walk no longer saves the "asked" status (the answer itself is stored server-side). (fix-pass side effect)
- src/client/panel-walk.js: map raw server Ask errors (`Unknown stepId`, `Question must be 1..500 characters`, `Claude stopped with an error (code N)`) to plain text. (copy)

## Review wave on 633abe1 (wren-fanout wf_cdf716be-a08, 2026-09-27)

- src/client/panel.css: 1024 has no single grid; the 640 column starts at 5 x positions (Home rail, step rail, `.pn-col`, error, map overlay) and the top row spans the viewport. One grid at >=720. (wren S-1)
- src/client/panel.css: at 1024 the well/meter reach 956 while prose/cards/ask stop at 942 (`max-width: 62ch`). (wren S-2)
- src/client/panel.js: route changes are silent to screen readers (no h1 focus, no announce, `document.title` fixed); Check Reveal, End "Saved" and S/W toggles from body also silent. (wren S-3)
- src/client/panel-walk.js: step rail, Map and End use three status grammars; rail rows look clickable but are inert; Map shows "Not yet" for passed steps; End has no "you are here". (wren S-4)
- src/client/panel-home.js: Home H1 "Walks" = Project tab "Walks" = "All walks"; Keep has no Recap/Actions labels; Project counts line order differs from section order; kbd hints only on some routes. (wren S-6)
- src/client/panel-home.js: volume ceilings undrawn: Home rail has no max-height (20+ projects clip), Keep expands every done walk (~250 rows at the 90-day ceiling) and fails whole on one fetch (`Promise.all`), Project New/Done have no Show more. (wren S-7)
- src/client/panel-walk.js: Answer card reads like the Example card; give it its own marker. (wren)
- src/client/walk-kit.css: 3-stat tiles wrap 2+1 at 420 (`minmax(88px,1fr)`); `.wk-compare tr.hl` lost its accent fill, unrendered. (wren, side edit of the ramp change)
- src/client/panel.css: Check "I had it"/"Not quite" pressed state carried by border only; End source filename 12px mono breaks mid-token at 420; Project row time column jumps ~10px between sections; Projects dividers show at 1024 only. (wren)
- src/client/panel-walk.js: End "Saved to dvla · Keep" looks like a link and duplicates "Open in Keep". (wren)
- src/client/panel-home.js: Keep loading state is text "Loading..." (skeleton exists); Keep section titles do not link back to their walk. (wren)

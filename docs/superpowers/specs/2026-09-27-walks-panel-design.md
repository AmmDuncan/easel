# Easel: Walks + Panel (a process for taking in big info fast, across projects)

**Date:** 2026-09-27
**Status:** Design agreed in chat, spec pending Ammiel's review. Replaces the first draft (`1f48371`), which designed a one-page digest; Ammiel's correction: the goal is a navigable PROCESS, not a page.

## Problem

Ammiel takes in big information (research, reports, PRDs, TRDs, project flow explanations) across several projects at once. Time goes to four places (all four confirmed):

1. **Don't know where to start:** can't see what matters or how big it is before diving in.
2. **Lose focus midway:** too long, attention drops, re-reading.
3. **Doesn't stick:** read it, can't say it back or act on it later.
4. **Juggling projects:** loses track of what's waiting where and where he left off.

On top of that, easel lives in a browser tab he has to go find.

## Goal

A walk: a guided, navigable process that takes him from "what is this" to "I can say it back and I know what to do", one idea at a time, resumable, grouped by project, in a panel that is one hotkey away.

## Decisions already made (chat, 2026-09-26/27)

- easel stays the engine. Every existing push type keeps working as today.
- New surface = native Swift panel around an easel web app. Navigable: Home -> Project -> Walk.
- The flow is: Orient -> Pick depth -> Walk -> Check -> Keep.
- Walks and progress live per PROJECT, not per session.
- **Ask** is answered by a fresh Claude call grounded in the walk's own sources, so it works after the originating session has closed.
- **A new walk arriving shows a corner toast**, never the whole panel.
- Look varies with the content's shape (explain-video's anti-staleness); the navigation chrome never moves.

## 1. The flow

| Stage | What Ammiel sees | Fixes |
|---|---|---|
| **Orient + pick** (one screen, 30 s) | The one question this answers, the answer in one line, size ("7 steps, about 6 min"), the map with the suggested path pre-ticked; unticked rows still show their takeaway; toggle rows in place; one primary `Start . 6 min` (Enter) | Don't know where to start |
| **Walk** | One idea per step: takeaway line, a picture, the running example applied to it. Buttons: `Got it` (next), `Slower / example`, `Why?`, `Ask...` | Lose focus |
| **Check** (last step, skippable with one key) | 2-3 prompts; he types a one-line answer, then the expected answer is revealed beside it and he marks it right or not | Doesn't stick |
| **Keep** (automatic) | Reaching the end saves recap + actions to the project's Keep tab; the end screen says "Saved to dvla . Keep" | Doesn't stick, juggling |

Done = reached the last step (Check skipped or not). *(Changed after wren SHAPE, 2026-09-27: Orient and Pick merged, Check moved to the end, Keep made automatic.)*

Rules inside a walk:

- **One running example** carried through every step (one waiver, one invoice of GHS 150), shown happening before the rule is named. Same discipline as explain-video.
- **One idea per step**, 12 steps max. Bigger material becomes a series of walks, linked.
- `Slower / example` and `Why?` are written in advance, so they open instantly. Only `Ask...` calls out.
- Every step links to its sources (doc heading, URL or `file:line`).
- **Progress is saved on every step change.** Reopening a walk lands on the step he left.

### How a step is shown (form follows the data)

| The data is | Shown as |
|---|---|
| Steps in order | Timeline or swimlane |
| Things compared | Table, the winner column highlighted |
| Parts of a system | Labelled diagram |
| Numbers | Stat tiles or a chart (easel kit chart primitives, 0.8.0) |
| Choices made | Decision cards: chose / why / rejected |
| Requirements | Checklist grouped by role |
| Risks, open questions | Flagged cards with an owner |

Prose only for "why". Section recipes per content type decide the default step order:

| Content | Default step order |
|---|---|
| PRD | Problem -> roles -> user stories -> in / out of scope -> open questions |
| TRD | Architecture -> data flow with the example -> decisions -> risks |
| Flow | Swimlane end to end with the example -> branches -> where it breaks |
| Research / report | Answer + confidence -> evidence strongest first -> what would change the answer |

## 2. The panel app (navigation)

```
+ Projects -------+ DVLA . Waivers TRD ----------------- step 3 of 7 +
| * DVLA       3  | 1 What v  2 Why v  3 How *  4 Decisions  5 Risks  |
|   Waivers TRD   |                                                   |
|   Help drawer   | How a waiver moves: [swimlane, one example]       |
| o GRA        1  |                                                   |
| o Docker     -  | [Got it ->] [Slower / example] [Why?] [Ask...]    |
| o easel      2  |                                                   |
+-----------------+---------------------------------------------------+
```

*(Reshaped after wren SHAPE, 2026-09-27. The default frame is about 576 px, under the 720 px breakpoint, so the design is single-column first; the sidebar drawing above only applies when the panel is widened past 720 px.)*

- **Home = one queue across all projects,** in this order: **Continue** (in-progress walks with their resume step), **New** (arrived, unopened; so a missed toast is never a lost walk), **Open actions** (count per project), then **Projects** (secondary list with counts). Home shows the total waiting count.
- **The hotkey reopens exactly where he was** (the last walk and step), never Home. `H` goes Home.
- **Project:** tabs `Walks` and `Keep`; one overflow menu in the header for project actions (section 4a).
- **Walk:** a top line `dvla . Waivers TRD` with `Map M` on the right; in the page, "Step 3 of 7 . How" with the time left from the picked steps, over one thin continuous bar. `M` opens the full map as an overlay list. No sideways-scrolling map strip. Past 720 px the picked steps also show as a rail on the left.
- **Step body:** takeaway, picture, running example; scrolls. `Slower` and `Why` expand inline directly under the takeaway; the same key collapses them.
- **Bottom bar, always visible:** `Back` always far left, then `Slower`, `Why`, `Ask` as quiet buttons, then `Got it` as the one primary. Below 480 px the key hints and the Back label drop and the bar stays one row, never an overflow menu. While the Ask box is open, `Send question` is the primary and `Got it` goes quiet.
- **Ask answers inline** under the current step and are saved as step "3a". The count never changes mid-walk ("3 of 7" stays "3 of 7").
- **Keys:** `Enter` or `->` Got it, `<-` back, `S` slower, `W` why, `A` ask, `M` map, `H` home, `Esc` hide panel. Single-letter keys are off while the Ask or Check input has focus.
- **Volume ceilings (Rule 79),** each rendered at zero, one and the ceiling: projects 12, walks per project 30 (older done walks fold under "Done"), steps 12, map strip 12, check prompts 3, Keep actions 20.

## 2a. Visual design (picked 2026-09-27, direction B)

Picked by Ammiel from a direction-axes sheet (voice x Home grouping x progress), reviewed by wren and copy first. The panel code (`src/client/panel.css`, `walk-kit.css`) is the source of truth; this is the summary.

- **Voice: editorial.** Headlines that carry meaning (Orient answer, step takeaway, Say it back, End answer) are the system serif (`ui-serif`, New York in the panel) at 28 px / 500. Section names and the Home hero title are the serif at 20 px. Everything you operate (rows, buttons, meta, labels) is Inter.
- **Type ramp:** 12 / 14 / 16 / 20 / 28, nothing else. Kickers are sentence case 14 / 600.
- **Colour:** the accent means progress only (bars and the live Ask dot). One ink-filled primary per screen; easel's paper accent fails 4.5:1 with white text, so primaries are never accent.
- **Surfaces:** no card per row; rows are hairline-separated with a hover tint. Section names sit over a 1 px ink rule with a count. Pictures and Slower/Why sit in a tinted well; the example and Ask answers are white cards with a hairline. Top and bottom bars are opaque.
- **Home (status):** Continue (or Up next) hero with the one primary, then Also in progress, New (5, then Show N more), Open actions, Projects. Past 720 px Projects move to a left rail.
- **Focus:** 2 px ink ring. **Targets:** 44 px minimum.

## 3. The panel shell (`EaselPanel.app`)

Thin. All navigation lives in the web app above; Swift only owns the window.

- One file `panel/EaselPanel.swift`, compiled with `swiftc` (Swift 6.2 is on the machine, no Xcode) by `easel setup` into `~/.easel/EaselPanel.app`, a hand-built bundle with `LSUIElement = true` (no Dock icon).
- `NSPanel`, `.nonactivatingPanel`, level `.floating`, `hidesOnDeactivate = false`, joins all Spaces.
- **Focus:** the toast never takes the keyboard. Opening the panel on purpose (hotkey or toast click) makes it key so the walk keys work at once; `Esc` hides it and hands focus back to the app he was in.
- `WKWebView` loading `http://localhost:7878/panel`.
- Default frame: right 40% of the main screen, full height; remembered (`setFrameAutosaveName`).
- **Global hotkey** toggles it. Default `Ctrl+Option+Space`, set in `~/.easel/config.json` as `panel.hotkey`. Carbon `RegisterEventHotKey` (no Accessibility permission).
- **Corner toast:** a second small non-activating panel, top-right, "New walk . DVLA . Waivers TRD", stays 8 s, stacks up to 3 then collapses to "+N more". Click or hotkey opens the panel on that walk. Triggered by a `walk` event on `GET /events`.
- Launched by the MCP on the first `walk` push if not running (`open -g ~/.easel/EaselPanel.app`). SSE reconnects with backoff after `easel restart`.
- Fallback when not built: `walk` pushes still work and open `localhost:7878/panel` in the browser; one stderr line says why.

## 4. Server changes (easel)

- **Walk store:** `~/.easel/walks/<project-slug>/<walk-id>.json` (content) and `<walk-id>.progress.json` (per-step status: unseen / got / slower / why / asked, current step, check answers, ticked actions). Needed because sessions are deleted after idling (`SESSION_IDLE_TTL_MS`, `src/session-store.ts:153`); walks must outlive them.
- **Which project a walk belongs to** (matches how Ammiel groups folders): if the MCP's cwd is inside a configured workspace root (`panel.projectRoots`, default `["~/work/studios", "~/work/tools"]`), the project is the folder directly under that root. So `~/work/studios/dvla`, `.../dvla/dvla-self-service` and `.../dvla/dvla-payment-system` are all "dvla". Outside the roots: git top level, else the cwd. Label = folder name, renameable.
- **Retention:** in-progress and waiting walks never auto-delete. Done walks kept 90 days. Keep entries never auto-delete. Everything else is Ammiel's call through the cleanup paths in section 4a.
- **`GET /events`:** global SSE, emits `walk` events `{ project, walkId, title }` (plus existing push events with `kind`). Implemented by letting `broadcast()` (`src/http-server.ts:34`) also write to clients registered with `sessionId: "*"`.
- **Panel routes:** `/panel`, `/panel/p/:project`, `/panel/w/:walkId` (+ `?step=`). Static client in `src/client/panel.*`.
- **API:** `GET /api/projects`, `GET /api/projects/:slug/walks`, `GET /api/walks/:id`, `PUT /api/walks/:id/progress`, `POST /api/walks/:id/ask`.
- **Security for the ask endpoint** (it starts a Claude process): the server binds 127.0.0.1 but has no origin check today. Every `/api/walks/*` write needs an `X-Easel-Token` header matching a random token in `~/.easel/token` (0600), which the panel and MCP read; requests carrying a foreign `Origin` are refused. Pushed HTML (sandboxed iframes) never gets the token.

## 4a. Cleanup

Nothing piles up silently, and nothing is lost to one wrong click.

*(Trimmed after wren SHAPE, 2026-09-27: Archive, Merge, the Stale group and the bulk CLI are cut from v1; Delete project kept because Ammiel asked for a cleanup path.)*

- **Per walk:** `Delete` and `Move to project` (for a walk filed in the wrong place).
- **Per project** (one overflow menu in the Project header): `Clear done` (deletes every done walk at once), `Rename`, `Delete project`.
- **Stale walks:** a waiting walk untouched for 14 days carries a "14 days untouched" label on its row; Home shows the stale count so the queue never grows unseen.
- **Keep:** each recap or action can be removed; ticked actions fold under "Done".
- **Undo, not confirm dialogs:** every delete and clear shows an `Undo` toast for 10 s, and deleted items go to `~/.easel/walks/.trash/` for 7 days before the sweeper purges them. No browser confirm dialogs anywhere.
- **Keys in lists:** `Backspace` deletes (undoable).
- **Retention:** done walks auto-expire after 90 days (section 4).

## 5. Ask (fresh Claude, grounded in the walk)

- `POST /api/walks/:id/ask { stepId, question }` spawns `claude -p --model sonnet --output-format json --allowedTools Read,Grep,Glob` with cwd = the project directory. Read-only tools only: the question is typed text and must never meet a tool that writes or runs commands.
- Prompt = the walk (orient, steps, sources) + the current step + the question + "answer as ONE step: takeaway, body, optional picture, sources".
- The answer is inserted after the current step, marked `asked`, and saved into the walk so it survives.
- One ask per walk at a time; 90 s timeout. In the box, Enter adds a line and Command+Enter sends. While it runs, the question is echoed with three live steps and you can keep reading; the answer is saved under its step when ready and a toast offers to show it if you moved on. There is no Cancel: closing the request does not stop the Claude call, so the answer still lands. Failure shows an alert, keeps the question and offers Try again. Each ask is logged in the walk file (question, duration, outcome) for later review.

## 6. The `walk` MCP tool and `walk` skill

**Tool:** `mcp__easel__walk({ title, kind, orient, example, steps, check, recap, actions, sources })`.

- `orient`: `{ question, answer, minutes, map: [{ stepId, name, takeaway, suggested }] }`
- `steps[]`: `{ id, name, takeaway, body_html, picture_html, example_html, slower_html, why_html, sources: [{ label, ref }] }`
- `check[]`: `{ prompt, expected }` (3 max). `recap[]` (5 max), `actions[]`.
- Server validates the shape and the ceilings; a bad walk is refused with the reason so the agent fixes it.

**Skill** (`~/.claude/skills/walk/SKILL.md`), when: Ammiel says "walk me through", "digest this", or asks for research, a report, or an explanation of a PRD, TRD or project flow. Everything else stays in chat. *(Trigger wording is an open question.)*

1. **Plan** (not shown for approval): who is reading and what they already know, the one question, the one answer (15 words max), the running example, content type, step list, cut list.
2. **Teacher's pass,** ported from explain-video: anchor step 1 in something he already knows; need before tool; each step answers the next question the previous one raises; one step breaks the likely wrong belief; one step shows where the idea stops; one step applies the rule to a new case.
3. **Write** steps per section 1, including `slower` and `why` for every step.
4. **Stale check:** `walk-history.jsonl` + a `history.mjs check` port. Fails when a walk reuses the previous walk's picture-shape sequence on a different topic. Chrome and navigation are exempt and never change.
5. **Lint** (`walk-lint.mjs`, headless render of every step at 1440, 720 and 480 wide): takeaway present, one idea per step, picture present or step marked "why" prose, no text overflow, ceilings respected, every step has at least one source.
6. **Cold read** (source over about 3k words): a Haiku agent with no context reads only Orient and must restate the answer; then reads the walk and answers one check prompt and one transfer question. Fail = rewrite the walk, not the check.
7. **Send** with `mcp__easel__walk`. Chat gets 2 lines: the answer, and "walk sent: <project> . <title>, N steps".

## 7. Rules change (Ammiel approves the wording)

Rules 29 and 33 say easel is on request only. Proposed addition to both: "Exception: a walk (the `walk` skill's trigger) is sent without asking; it arrives as a corner toast." Other easel pushes stay on request.

## Testing

- **Server** (`node --test`): walk validate + store + progress round-trip; walk survives its session being GC'd; project resolution (`dvla`, `dvla/dvla-self-service` and `dvla/dvla-payment-system` all map to `dvla`; a git repo outside the roots maps to its top level); delete -> undo restores exactly; trash purges after 7 days; merge moves every walk and Keep entry; CLI without `--yes` changes nothing; `/events` delivers a `walk` event; ask endpoint refuses a missing token and a foreign `Origin`; ask with a failing stub `claude` on PATH reports the error and leaves the walk unchanged (Rule 64: dependency tested failing).
- **Panel** (scripted run, recorded per Rules 4/62): walk arrives -> toast shows and the next keystroke still lands in the terminal; hotkey opens the walk; Got it / Slower / Why / back work by key; close mid-walk and reopen lands on the same step; Ask inserts an answered step; two projects with walks show on Home with correct counts; `easel restart` -> panel reconnects.
- **Skill:** 3 real sources (one PRD or TRD, one DVLA flow, one research report), each passing lint and the cold read; a forced reuse fails the stale check.
- **Design:** wren SHAPE on the Home -> Project -> Walk structure before building (Rule 56), wren REVIEW of the panel at 3 widths with ceilings rendered (Rule 60).

## Build order (Rule 81)

1. Walk store, validation, progress API, `/events` (server, tests).
2. Panel web app: Walk view first (visible first), then Home and Project.
3. Swift shell: window, hotkey, toast.
4. Ask endpoint + token.
5. `walk` MCP tool + skill + lint + history check.
6. Rules 29/33 edit.

Estimated hand time: about 35 hours. Agent target: about 9 hours.

## Out of scope (v1)

- Autostart at login, choosing a monitor, audio narration of a walk, Slack delivery, spaced-repetition reminders from Keep, Claude-graded checks (v1 is reveal and self-mark), Windows/Linux panel.

## Resolved (Ammiel, 2026-09-27)

1. **Trigger:** confirmed as written in section 6.
2. **Hotkey:** `Ctrl+Option+Space` is free.
3. **Project grouping:** one project per top-level folder, so all DVLA work is one project (section 4). Cleanup paths added (section 4a).

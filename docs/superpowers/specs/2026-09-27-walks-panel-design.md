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
| **Orient** (30 s) | The one question this answers, the answer in one line, size ("7 steps, about 6 min"), a map of the parts with a one-line takeaway each, my suggested path highlighted | Don't know where to start |
| **Pick depth** | Tick the parts to walk; the rest stay at takeaway level. "Take the suggested path" is one key | Don't know where to start, lose focus |
| **Walk** | One idea per step: takeaway line, a picture, the running example applied to it. Buttons: `Got it` (next), `Slower / example`, `Why?`, `Ask...` | Lose focus |
| **Check** (optional) | 2-3 prompts; he types a one-line answer, then the expected answer is revealed beside it and he marks it right or not | Doesn't stick |
| **Keep** | Recap lines + action items saved to the project's Keep page; actions can be ticked | Doesn't stick, juggling |

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

- **Home:** every project, with counts for waiting / in progress, and a "Continue" row per in-progress walk showing its resume step. Most recent activity first.
- **Project:** its walks (waiting, in progress, done) and its Keep page.
- **Walk:** map strip across the top (done / current / skipped), the step, the buttons, progress "step N of M".
- **Keys:** `Enter` or `->` Got it, `<-` back, `S` slower, `W` why, `A` ask, `M` map, `H` home, `Esc` hide panel.
- **Narrow (under 720 px):** the project list collapses to a "Projects" button; the map strip scrolls sideways.
- **Volume ceilings (Rule 79),** each rendered at zero, one and the ceiling: projects 12, walks per project 30 (older done walks fold under "Done"), steps 12, map strip 12, check prompts 3, Keep actions 20.

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

- **Walk store:** `~/.easel/walks/<project-slug>/<walk-id>.json` (content) and `<walk-id>.progress.json` (per-step status: unseen / got / slower / why / asked, current step, check answers, ticked actions). Project = the MCP's cwd resolved to its git top level, else the cwd itself; label = folder name, renameable. Needed because sessions are deleted after idling (`SESSION_IDLE_TTL_MS`, `src/session-store.ts:153`); walks must outlive them.
- **Retention:** in-progress and waiting walks never auto-delete. Done walks kept 90 days. Keep entries never auto-delete.
- **`GET /events`:** global SSE, emits `walk` events `{ project, walkId, title }` (plus existing push events with `kind`). Implemented by letting `broadcast()` (`src/http-server.ts:34`) also write to clients registered with `sessionId: "*"`.
- **Panel routes:** `/panel`, `/panel/p/:project`, `/panel/w/:walkId` (+ `?step=`). Static client in `src/client/panel.*`.
- **API:** `GET /api/projects`, `GET /api/projects/:slug/walks`, `GET /api/walks/:id`, `PUT /api/walks/:id/progress`, `POST /api/walks/:id/ask`.
- **Security for the ask endpoint** (it starts a Claude process): the server binds 127.0.0.1 but has no origin check today. Every `/api/walks/*` write needs an `X-Easel-Token` header matching a random token in `~/.easel/token` (0600), which the panel and MCP read; requests carrying a foreign `Origin` are refused. Pushed HTML (sandboxed iframes) never gets the token.

## 5. Ask (fresh Claude, grounded in the walk)

- `POST /api/walks/:id/ask { stepId, question }` spawns `claude -p --model sonnet --output-format json --allowedTools Read,Grep,Glob` with cwd = the project directory. Read-only tools only: the question is typed text and must never meet a tool that writes or runs commands.
- Prompt = the walk (orient, steps, sources) + the current step + the question + "answer as ONE step: takeaway, body, optional picture, sources".
- The answer is inserted after the current step, marked `asked`, and saved into the walk so it survives.
- One ask per walk at a time; spinner while running; 90 s timeout; failure shows the error and a Retry button. Each ask is logged in the walk file (question, duration, outcome) for later review.

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

- **Server** (`node --test`): walk validate + store + progress round-trip; walk survives its session being GC'd; `/events` delivers a `walk` event; ask endpoint refuses a missing token and a foreign `Origin`; ask with a failing stub `claude` on PATH reports the error and leaves the walk unchanged (Rule 64: dependency tested failing).
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

## Open questions

1. **Trigger:** "walk me through" / "digest this", plus any ask for research, a report, or a PRD, TRD or flow explanation. Right?
2. **Hotkey:** is `Ctrl+Option+Space` free?
3. **Project grouping:** DVLA sessions start in `~/work/studios/dvla` (not a git repo), so all DVLA work would be one project. Fine, or split per repo (`dvla-self-service`, `dvla-payment-system`)?

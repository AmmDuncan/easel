# Easel: Digest + Panel (read big info fast, without hunting for a tab)

**Date:** 2026-09-27
**Status:** Design agreed in chat, spec pending Ammiel's review

## Problem

- Big information (research, reports, PRDs, TRDs, project flow explanations) lands either as a wall of chat text or as an easel card that looks like every other card.
- easel lives in a browser tab. Ammiel has to go find it among other tabs every time, so it never feels natural.

## Goal

When a digest is ready, a panel appears in front of whatever Ammiel is doing, without stealing his keyboard. The top gives the answer in about 5 seconds; below it sits a full, organized walkthrough for when he wants the whole story.

## Decisions already made (chat, 2026-09-26/27)

- easel stays the engine. Nothing is replaced; every existing push type keeps working exactly as today.
- New surface = a native Swift floating panel (chosen over a Chrome app window and a Raycast extension).
- The panel shows every push, but only `kind: 'digest'` makes it jump forward. Other pushes wait quietly; a hotkey shows them.
- A digest is BOTH: a short digest on top AND a proper walkthrough below. Not one or the other.
- Organizing and presenting the data is a first-class part of the design (section 4), not styling.
- The browser tab still works for wide mockups, sharing and export.

## 1. The panel (`EaselPanel.app`)

- One Swift file, `panel/EaselPanel.swift`, compiled with `swiftc` (Swift 6.2 is on the machine; no Xcode needed) by `easel setup` into `~/.easel/EaselPanel.app`, a hand-assembled bundle with `LSUIElement = true` so it has no Dock icon.
- `NSPanel` with `.nonactivatingPanel`, level `.floating`, `hidesOnDeactivate = false`, collection behaviour `canJoinAllSpaces` + `fullScreenAuxiliary`. It shows in front but the terminal keeps keyboard focus, so typing is never interrupted.
- Hosts a `WKWebView` pointed at the easel server.
- Default frame: right 40% of the main screen, full height. Frame is remembered (`setFrameAutosaveName`).
- **Esc** hides it (once clicked into, the panel can become key).
- **Global hotkey** toggles it. Default `Ctrl+Option+Space` (Option+Space is often Raycast). Registered with Carbon `RegisterEventHotKey`, which needs no Accessibility permission. Configurable as `panel.hotkey` in `~/.easel/config.json`.
- Subscribes to the new global stream `GET /events` (section 2). On a `push` event whose `kind` is `digest`: load that push's focus view and `orderFrontRegardless()`. Any other kind: no raise; if the panel is already showing that session's feed, the feed updates live as it does today.
- Hotkey while hidden: show the last thing it showed (latest digest, or the session feed).
- Lifecycle: the MCP launches it on the first push if it is not running (`open -g ~/.easel/EaselPanel.app`) instead of opening a browser tab. SSE reconnects with backoff if the server restarts.
- Fallback: if the app was not built (no `swiftc`), easel keeps today's tab behaviour and prints one stderr line saying why.

## 2. Server and viewer changes (easel)

- **`GET /events`**, a global SSE stream. Emits `{ sessionId, pushId, kind, title }` for every push from every session. Implementation: register SSE clients with `sessionId: "*"` and have `broadcast()` (`src/http-server.ts:34`) also write to `*` clients. Same keep-alive as `/s/:id/events`.
- **`GET /s/:id/p/:pushId`**, a focus view for one push. The iframe fills the window and scrolls internally, so a sticky map rail works. Needed because feed iframes auto-size to content height (`src/client/viewer.js:245`), which makes `position: sticky` inside them impossible. A thin top bar holds the title, session label, "Feed" and "Open in browser".
- In the feed, digest cards render as today (the rail degrades to a static map at the top) plus a "Focus" link in the card header that opens the focus view.
- MCP auto-open (`autoOpenIfNeeded`, `src/mcp.ts:66`): prefer ensuring the panel is running over opening a tab when the panel app exists.

## 3. Page structure of a digest

```
+- map -----------+- DIGEST . 1 min ----------------------------+
| * Answer        | ANSWER  one line, 15 words max               |
| o How it works  | DO      1. ...  2. ...  3. ...               |
| o Decisions     | [ one picture: diagram or table ]            |
| o Open / risks  +- WALKTHROUGH . 10 min -----------------------+
| o Terms         | How it works: takeaway line                  |
|                 |   swimlane, running example walked through   |
| 2 of 5 read     | Decisions: takeaway line                     |
|                 |   chose / why / rejected cards               |
|                 | Open / risks: takeaway line                  |
|                 |   flagged cards with owner                   |
+-----------------+----------------------------------------------+
```

- **Digest (top, about 1 minute):** the answer in one line, what Ammiel must do (3 items max), one picture.
- **Walkthrough (below, about 10 minutes):** the whole thing, organized per section 4. Not a pile of collapsed detail.
- **Map rail (left):** every section's name plus its one-line takeaway, click to jump, highlights the current section, shows "N of M read". Built automatically from the sections by `digest.js`.
- **Narrow panel (under 720px):** the rail collapses into a "Map" button at the top that opens the same list.

## 4. Organizing and presenting the data

### Organizing (how the information is arranged)

1. **Regroup by what the reader needs, never by the source's order.** Default spine: What it is -> How it works -> What's decided -> What's open or risky -> Terms. A section with nothing real in it is dropped, not padded.
2. **Every section opens with its takeaway** in one bold line. Reading only the takeaways gives the whole story.
3. **One running example** carried through the walkthrough (one invoice of GHS 150, one learner booking a test), shown happening, never stated in the abstract first. Same rule as explain-video.
4. **No repeats.** Duplicates across the source are merged into one place. A term is defined where it is first used (`<dfn>` with a hover definition) and listed under Terms.
5. **Every claim links to its source:** a doc heading, a URL, or `file:line`, so it can be checked in one click.

### Section recipes per content type

| Content | Sections |
|---|---|
| PRD | Problem in one line -> who uses it (roles) -> user stories as cards -> in scope / out of scope columns -> open questions highlighted |
| TRD | Architecture diagram -> data flow with the running example -> decisions (chose / why / rejected) -> risks ranked |
| Flow | Swimlane with the running example walked end to end -> where it branches -> where it breaks |
| Research / report | Answer + confidence -> evidence ranked strongest first -> what would change the answer |
| Mixed | Default spine from point 1, each section using the shape table below |

### Presenting (the form follows the shape of the data)

| The data is | Shown as |
|---|---|
| Steps in order | Timeline or swimlane |
| Things compared | Table, the winner column highlighted |
| Parts of a system | Labelled diagram |
| Numbers | Stat tiles or a chart (easel kit chart primitives, 0.8.0) |
| Choices made | Decision cards: chose / why / rejected |
| Requirements | Checklist grouped by role |
| Risks, open questions | Flagged cards with an owner |

Prose is only for "why". Anything else gets a shape.

### Volume ceilings (Rule 79)

Rendered and judged at zero, one and the ceiling: rail 8 sections, DO list 3, decision cards 8, risk cards 10, compare table 6 columns x 12 rows, stat tiles 6. Past a ceiling the digest splits (a second digest, linked) instead of cramming.

## 5. The digest kit

Lives beside the easel kit: `skills/using-easel/kit/digest.css` and `digest.js` (inlined into the push like `easel-base.css`, per Rule 30).

- Classes: `.dg-page` (rail + main grid), `.dg-answer` (answer, DO list, picture slot), `.dg-section` + `.dg-takeaway`, `.dg-decision`, `.dg-risk`, `.dg-stat`, `.dg-compare`, `.dg-roles`, `.dg-timeline`, `.dg-swimlane`.
- `digest.js`: builds the rail from `.dg-section` elements, scroll-spy, "N of M read", narrow-width Map button, `<dfn>` hover definitions.
- Frozen canvas applies (2026-06-27 spec): the digest sets its own background and ink; nothing live-tracks the global theme.

## 6. The `digest` skill (`~/.claude/skills/digest/SKILL.md`)

**When:** Ammiel says "digest this", or asks for research, a report, or an explanation of a PRD, TRD or project flow. Everything else stays in chat. *(This trigger is an assumption, see Open questions.)*

Steps:

1. **Plan** (not shown for approval, same as explain-video): the reader's question, the one answer (15 words max), the DO list (3 max), content type, section list, running example, cut list. Saved as `brief.json` next to the digest HTML.
2. **Organize** per section 4, using the content type's recipe.
3. **Present** per the shape table.
4. **Stale check:** `digest-history.jsonl` + `history.mjs check`, ported from explain-video. Fails when the digest reuses the previous digest's shape sequence AND visual treatment on a different topic. The answer strip's position is exempt and never moves: the eye has to know where to land.
5. **Lint** (`digest-lint.mjs`, headless render at 1440, 720 and 480 wide): answer strip present and first, DO list 3 max, every section opens with a takeaway, rail builds, no text overflow, no section of prose over 6 lines without a shape, every ceiling in section 4 respected.
6. **Cold read** (source over about 3k words): a Haiku agent with no context reads ONLY the digest strip and must restate the answer and DO list; then reads the walkthrough and answers one transfer question. Fail = rewrite the digest, not the check.
7. **Push** with `kind: 'digest'`. Chat gets 3 lines: the answer, the DO list, "digest #N".

## 7. Rules change (Ammiel approves the wording)

Rules 29 and 33 say easel is on request only. Proposed addition to both: "Exception: a digest (the `digest` skill's trigger) is pushed without asking; the panel raises for it." All other easel pushes stay on request.

## Testing

- **Server** (`node --test`): `/events` receives a push event with `kind`; focus route returns 200 for a known push and 404 for an unknown one; a push to session A reaches a `/events` client and a `/s/A/events` client, not `/s/B/events`.
- **Panel** (scripted manual run, recorded per Rules 4/62): digest push -> panel in front AND the next keystroke lands in the terminal; non-digest push -> no raise; Esc hides; hotkey toggles; `easel restart` -> panel reconnects; panel killed -> next digest relaunches it.
- **Skill:** run on 3 real sources (one PRD or TRD, one DVLA flow explanation, one research report). Each passes lint and the cold read; a forced reuse fails the stale check.
- **Design:** wren REVIEW (Rule 60) of one digest at 3 widths, plus the volume ceilings rendered.

## Build order (Rule 81)

1. `/events` + focus route (server, with tests).
2. Swift panel (visible first: a digest pops in front).
3. Digest kit CSS/JS.
4. `digest` skill, lint, history check.
5. Rules 29/33 edit.

Estimated hand time: about 20 hours. Agent target: 5 hours.

## Out of scope (v1)

- Autostart at login (LaunchAgent), choosing a monitor, audio brief, Slack DM variant, Windows/Linux panel.

## Open questions

1. **Trigger:** is "you say digest, or you ask for research / a report / a PRD, TRD or flow explanation" right?
2. **Hotkey:** is `Ctrl+Option+Space` free on your machine?
3. **Which digest the panel shows:** proposal = the latest digest from any session (the one that raised it), with the session switcher for the rest.

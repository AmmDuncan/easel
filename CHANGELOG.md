# Changelog

All notable changes to easel. This project adheres to [Semantic Versioning](https://semver.org/).

## 0.2.23 — 2026-05-23

### Changed
- **`.full-bleed` now caps at 1440px and centres.** On a wide monitor the card itself can be ~2000px, and a full-bleed mockup was stretching to fill all of it — but a real desktop screen tops out around 1440px, so the mockup looked unnaturally wide. `.full-bleed` is now `width: min(100vw, 1440px)` (still centred via `left:50%` + `translateX(-50%)`): it fills the card up to 1440 then centres with gutters. On cards narrower than 1440 it still fills edge-to-edge. Browser-verified at a 1949px viewport (1542px card → mockup capped at 1440, centred).

## 0.2.22 — 2026-05-23

### Changed
- **Prose reading column now centres in the card.** The capped 880px prose sat flush-left, leaving a large empty right gutter next to any `.full-bleed` block. Added `margin-left/right: auto` so the reading column centres — balanced whether or not a full-bleed sibling has widened the body, and full-bleed blocks now break out symmetrically around it.

### Docs
- **Mockup height guidance rewritten to "match the source's real frame", both directions.** The first draft of this rule ("always size to content, never pad to desktop height") was too absolute — a full desktop *screen* genuinely floats its content in a ~720–800px viewport, and cropping that to content height misrepresents it as much as over-padding a small component does. New guidance distinguishes: component → content height (don't pad to fake desktop size); full screen/page → realistic viewport proportions (don't crop to content). Either way, copy the source's exact height if it has one. Updated skill + inline `push` tool description.
- Reinforced "hug the source" for app recreations in the inline tool description (pull exact colors/spacing/sizing/radii/fonts; say so if you can't reach the actuals rather than passing off an approximation as accurate).

## 0.2.21 — 2026-05-23

### Fixed
- **Stray backticks in a CSS comment blanked every card.** The 0.2.20 prose-cap comment contained `` `.wrap` `` / `` `.full-bleed` `` in backticks. That comment lives inside `buildDefaultWrapper`'s JS template literal, so the backticks prematurely closed the template string → the function threw `… .wrap is not a function` on every render → hydrate failed and no cards showed (the push count still read 5). Removed the backticks from the comment.
- **Build now syntax-checks the client JS.** `viewer.js` / `index.js` are plain browser JS copied as-is (never run through `tsc`), so this class of bug shipped undetected. `scripts/copy-client.mjs` now runs `node --check` on each after copying and fails the build on a syntax error — this exact bug would have been caught at build time.

## 0.2.20 — 2026-05-23

### Fixed
- **Prose reading-width cap silently missed when content was wrapped in `.wrap`.** The 880px cap only targeted direct body children (`body > p`, `body > h1`, …). But the skill recommends wrapping push content in `<div class="wrap">`, so prose became `body > .wrap > p` and the selector never matched — prose stretched the full card width (defeating the whole point of the reading column, and making the 0.2.19 full-bleed demo look like "everything's wide" rather than "prose narrow, mockup wide"). Extended the cap to also match one level deep through `.wrap`. `.full-bleed` was unaffected (it escapes via viewport units regardless of nesting).

## 0.2.19 — 2026-05-23

### Added
- **`.full-bleed` utility class for mockups embedded mid-presentation.** The common case: a presentation push with prose intro → embedded UI mockup → more prose. Prose should stay in the ~880px reading column, but the mockup should fill the full card width. `kind: "mockup"` can't help (it strips the frame from the whole push, prose included). Now wrapping just the mockup section in `<div class="full-bleed">` breaks it out of the body padding + 1400px prose cap to span the full card width (`width: 100vw; left: 50%; transform: translateX(-50%)` — inside the iframe 100vw === card width), while everything outside the wrapper stays in the reading column. Documented in the skill and the inline `push` tool description. Two cases, two tools: whole-push recreation → `kind: "mockup"`/`"app"`; embedded mockup → `.full-bleed` wrapper.

## 0.2.18 — 2026-05-23

### Reverted
- **Reverted the 0.2.17 full-bleed *card* breakout.** That change made `kind: mockup/app` cards grow to near-full viewport width — wrong axis. The actual ask was for the *content* to fill the card edge-to-edge (no inner inset), with the card itself staying at the normal reading-column width. That's already handled by app-fidelity mode (0.2.13): the wrapper sets `body { margin:0; padding:0 }`, `.push-body` has no padding, and the iframe is `width:100%`, so mockup content fills the card to its rounded edges. Cards now stay column-width again; mockup content still bleeds to the card edges.

## 0.2.17 — 2026-05-23

### Added
- **`kind: "mockup"` / `"app"` pushes now break out to near-full viewport width.** Two width bounds applied to every push: (1) the wrapper's presentation frame (`max-width: 1400px` + body padding + 880px prose cap), removed by app-fidelity mode since 0.2.13; (2) the feed reading column (`min(94vw, 1600px)` ≈ ~1540px usable), which still squeezed desktop UI recreations. Now app-fidelity cards get `.push--full-bleed` — `width: min(98vw, 1920px)` centred on the viewport — so desktop screens render at real desktop proportions instead of being pinched into the reading column. Presentation pushes stay in the column as before.

## 0.2.16 — 2026-05-23

### Changed
- **PDF export quality bumped back up after the 0.2.15 size fix landed.** 0.2.15 traded crispness for size (JPEG 0.92 + DPR 2 → ~800 KB per card) — visible JPEG artefacts on type at zoom. Bumped to JPEG quality 1.0 + DPR 4 for the PDF target. Same compression trick (JPEG-in-PDF vs PNG-in-PDF) keeps the file at ~3–8 MB per card instead of the original 300+ MB; the higher quality settings just bring text back to "razor sharp at any zoom" without giving up the size win.
- PNG export unchanged (still lossless PNG @ DPR 4).

## 0.2.15 — 2026-05-23

### Fixed
- **PDF exports were enormous (300+ MB for a single-page card).** Two stacking causes: (1) the iframe always rasterised at `pixelRatio: 4` regardless of target, producing huge bitmaps for tall cards; (2) the parent then embedded the result into jsPDF as a `PNG`, which PDFs store using Flate compression — far less efficient than the DCT compression PDFs natively use for JPEGs. A tall card at DPR 4 → ~6000×10000 pixel PNG → ~300 MB PDF wrapper.
- Fix: for PDF targets only, the iframe now rasterises as JPEG at `quality: 0.92` and `pixelRatio: 2`, and the parent embeds with `'JPEG'` format + `'FAST'` compression flag + `compress: true` at the document level. PNG exports stay at lossless PNG + pixelRatio 4 — no quality loss for the standalone PNG download.
- Expected sizes for a typical card: ~3–8 MB (down from ~300 MB), text still crisp on screen and in print.

## 0.2.14 — 2026-05-23

### Changed
- **First-push auto-open is now actually the only trigger.** 0.2.10 moved the MCP-side auto-open from "first tool call" to "first push when no tab is alive". But Claude Code launches were still opening a tab because `easel setup` also installed a `SessionStart` hook that ran `easel open --quiet`. Two changes:
  - `easel setup` no longer installs the `easel open --quiet` SessionStart block, and actively strips any pre-existing one from `~/.claude/settings.json`. The `idCaptureBlock` (which writes the per-PPID session-id file) stays — it's needed for PPID → session correlation and has no UI side effect.
  - `mcp.ts` `autoOpenIfNeeded` drops the `hookHasFiredForThisPpid()` short-circuit. That check was a proxy for "the hook already opened a tab"; now that the hook doesn't open tabs, `sessionTabs > 0` is the truthful signal.
- After upgrading, run `easel update` once so setup re-runs and cleans your existing `~/.claude/settings.json`.

## 0.2.13 — 2026-05-23

### Added
- **`kind: "mockup"` and `kind: "app"` switch the iframe into app-fidelity mode.** The wrapper skips its presentation defaults (Inter body font, design-token CSS, semantic chips, body bg/color, prose width constraints) and only keeps the box-sizing reset and the html-to-image bridge. Agent paints everything. Makes the existing "App/UI recreations are always locked-mode" rule structural — for a true mockup, opt in via `kind` and the wrapper stops fighting you instead of relying on the agent remembering to override every default. Presentation pushes (explanations, comparisons, status reports) keep the existing wrapper as before.

## 0.2.12 — 2026-05-23

### Docs
- **Locked-mode guidance now ships a paired light example next to the dark one.** The existing rule — "background and text are a pair, commit both, re-scope `color: inherit` to children" — was illustrated only with a dark `.terminal` block. Agents (and people) generalized the rule to "lock your dark containers" and missed the equally-common inverse: a white `.card` on the host canvas with no `color:` of its own, which in dark host mode inherits `.wrap`'s `light-dark()` and resolves to light gray → invisible titles on white. The skill and inline `push` tool description now show both shapes side by side so agents see the rule is direction-agnostic.

## 0.2.11 — 2026-05-22

### Docs
- **Locked-mode container guidance now covers syntax highlighting explicitly.** The existing rule ("background and text are a pair — commit both, re-scope `color: inherit` to children") only addressed single-color text. Syntax-highlighted code blocks layer multiple token colors on top of that, and the recurring failure was a `property` / `punctuation` / `comment` token colored near-background (e.g. `#2c2c40` on `#0f172a`) silently rendering whole identifiers invisible. New guidance in `skills/using-easel/SKILL.md` and the inline `push` tool description spells out: use a tested theme designed for your bg (Shiki `github-dark` / `vitesse-dark` / `one-dark-pro` for `#0f172a`-ish; `github-light` / `vitesse-light` for `#f5f7fa`-ish) OR pick from a verified 6-color palette for `#0f172a` (keyword `#ff7b72`, string `#a5d6ff`, function `#d2a8ff`, property `#79c0ff`, number `#ffa657`, comment `#8b949e`, default `#e6edf3`). Fallback: drop highlighting, use single-color monospace.

## 0.2.10 — 2026-05-22

### Changed
- **Auto-open moved from "first tool call" to "first push", and is now aware of which sessions are currently being viewed.** The previous behaviour fired on the very first tool call (often `label` or `config`) and used a binary "have we attempted ever?" guard, which meant agents calling `label` before any push would burn the attempt without opening, and parent orchestrators that never push would still trigger a tab. New decision tree:
  - `sessionTabs > 0` (this session is being viewed in ≥1 tab) → silent push, no auto-open.
  - `otherTabs > 0` (easel is being viewed but on a different session) → no auto-open; the push response now hints to the agent to ask the user whether to switch to this session via the topbar `switch ▾` dropdown or call `open` for a new window. Avoids surprising users who deliberately switched their existing easel tab to look at another session.
  - both `0` and no hook-managed tab → auto-open one tab.
- Still one-shot per MCP child lifetime — if the user closes the tab after the first auto-open, subsequent pushes don't re-open; the response hints they can call `open` to force one.
- Explicit `open` calls also mark the attempt as taken, so an `open` followed by a manual close is respected the same way.
- Server's `/api/push` response now returns `otherTabs` alongside `sessionTabs`.

## 0.2.9 — 2026-05-22

### Added
- **Per-push download menu with PNG and PDF.** The download icon on each push card now opens a small popover anchored under the icon, offering PNG (existing flow) or PDF. PDF mode reuses the same `html-to-image` rasterise we already run for PNG, then embeds the resulting bitmap into a `jsPDF` document sized to the canvas dimensions — one continuous page, no pagination, regardless of card height. jsPDF loads from the same jsDelivr CDN we already use for `html-to-image`.
- **Real loading state on the download icon.** Replaces the previous subtle pulse — during render the icon swaps to a spinning ring and the button is click-locked until the export finishes (PNG anchor download or jsPDF save). Errors from the iframe-side rasterise now propagate to the parent via a new `easel:image-error` message and surface as an alert so silent hangs are visible.

### Fixed
- **Switcher delete button no longer overlaps the push count / timestamp.** The trash icon was absolute-positioned at `right: 36px` and sat on top of `.count` on hover. Moved into the flex flow as a sibling after `.count`, with `visibility: hidden` reserving its 22px slot so the count text stays clear at all times.

## 0.2.8 — 2026-05-22

### Docs
- README now documents Codex as a supported client (added in 0.2.5 but missed in the doc pass). "Works with" list, install commands, config-path table, CLI help text, and file map all updated.

## 0.2.7 — 2026-05-22

### Fixed
- **Agents in non-Claude-Code clients (Claude Desktop, Cursor, etc.) weren't calling the `label` tool**, so their sessions stayed named after the cwd basename of wherever the client spawned the MCP child (often `home` or the user's username — unfindable in the switcher). Claude Code agents do call it because the `SessionStart` hook injects a strong "label NO LATER than your first push" directive; non-CC clients only see tool descriptions, and the old descriptions didn't carry the same urgency.
- The `label` tool description is now imperative: "as soon as the user's intent is clear, NO LATER than your first push", with format rules (1–8 words, sentence case, name the artefact not the verb) and good/bad examples.
- The `push` tool description now has a dedicated "BEFORE YOUR FIRST PUSH — LABEL THE SESSION" section that cross-references `label`, so agents see the cue at the moment they're about to push.

## 0.2.6 — 2026-05-22

### Fixed
- **Locked-mode containers (terminal mockups, code blocks, brand-color heros) had invisible text in light mode** when pushed from non-Claude-Code clients. The push tool description's "inverse rule" was stated in prose but had no copy-paste code example — and the wrap/card example used `light-dark()` while the agent then applied the same pattern to a locked-dark terminal, leaving its inner text on `color: inherit` (which resolved to the wrap's dark text in light mode → dark text on dark bg).
- Added a second copy-paste starter block specifically for locked-mode containers, showing the canonical pattern (`background: #0f172a; color: #e6edf3;` + re-scoping `color: inherit` to children). Right next to the adaptive wrap/card pattern so the agent can't miss the difference.

## 0.2.5 — 2026-05-22

### Added
- **Codex client support: `easel setup --client codex`.** Writes the MCP entry into `~/.codex/config.toml` under `[mcp_servers.easel]` and copies the `using-easel` skill into `~/.codex/skills/using-easel/SKILL.md` so Codex agents have the full style guide in addition to the tool description. Line-based TOML upsert preserves other sections and comments.

### Fixed
- **`easel setup --help` no longer silently runs the destructive Claude Code setup.** Previously, the `--help` flag fell through the `--client` check and reached `cmdSetup()`, which writes to `~/.claude/settings.json`. Now a dedicated help branch fires before any side effects. Includes a manual-install JSON snippet for clients beyond the four officially supported ones.

## 0.2.4 — 2026-05-22

### Fixed
- **Pushes from non-Claude-Code clients (Claude Desktop, Cursor, Windsurf, etc.) ignored the easel style guide.** The full guide lives in the `using-easel` skill — but skills are a Claude Code feature; other MCP clients never see them. The MCP `push` tool's description only said "Pass full HTML" and contained none of the styling rules, so agents in non-CC clients hardcoded one mode's colors. Result: lede text colored `#475569` went invisible in dark mode, hardcoded `#e5e5e5` borders became hard white lines, mockups crammed into half-width columns, etc.
- The `push` tool description now carries the essentials inline: adaptive-color rules (`light-dark()` + `color: inherit` re-scoping + locked-mode container inverse rule), a copy-paste starter pattern, presentation-scale typography, whitespace, tangible-visual heuristics, vertical stacking of desktop mockups, and the proactive-push convention. Every MCP client surfaces tool descriptions to its agent, so this lands cross-client.

## 0.2.3 — 2026-05-22

### Fixed
- **Every push was being delivered twice.** The auto-run guard in `dist/mcp.js` had a sloppy fallback (`endsWith("/dist/mcp.js")`) that matched even when the file was imported, not just when it was invoked directly. Result: when the CLI's no-TTY path dynamically imported `mcp.js`, the guard fired AND the CLI explicitly called `main()`, so two MCP servers ran in the same process attached to the same stdin. Every tool call was processed twice. Guard now uses strict equality only.
- **Sessions index — trash icon overlapped the count/timestamp on short rows.** The hover-revealed delete button was absolutely positioned and collided with the right-column text whenever the row was tight. Promoted to its own grid column so it sits cleanly to the right of the count/when stack regardless of row height.

## 0.2.2 — 2026-05-22

### Fixed
- **MCP servers wired via `npx -y @ammduncan/easel` now boot the MCP server instead of printing CLI help.** When stdin isn't a TTY (i.e. the process is launched over a pipe by an MCP client), the bin transparently boots the MCP server. Interactive terminal use still shows help. Previously, Claude Desktop, Cursor, and Windsurf saw the CLI's help text on stdout and reported `Unexpected token 'e' is not valid JSON` for every line.

### Added
- Explicit `easel mcp` subcommand that runs the stdio MCP server in the foreground (used internally by the no-TTY auto-detection; available as an explicit entry point for clients that want it).

### Changed
- `dist/mcp.js` now exports `main()` and only auto-runs when invoked directly (not when imported), so the CLI can route to it without double-booting.

## 0.2.1 — 2026-05-22

### Added
- `easel setup --client cursor|claude-desktop|windsurf` writes the MCP entry into each client's config file, merging into any existing `mcpServers` map. Sibling top-level keys are preserved. (`src/client-setup.ts`)
- README leads with the npx install; per-client install commands documented; generic JSON snippet for any other MCP-speaking client.
- This `CHANGELOG.md`.

### Notes
- The Claude Code setup path (bare `easel setup`) is unchanged.

## 0.2.0 — 2026-05-22

### Added
- Published to npm as [`@ammduncan/easel`](https://www.npmjs.com/package/@ammduncan/easel). Any MCP client can now install with `npx -y @ammduncan/easel` — no clone, no build.
- `EASEL_SESSION_ID` env var as the highest-priority override for session resolution.
- Synthetic PPID-derived session id as a final fallback when no Claude Code hook fired and no transcript exists — gives Cursor, Claude Desktop, Windsurf, and any other MCP client a stable session per chat with zero setup beyond the MCP entry.
- MCP-side auto-open: non-CC clients have no `SessionStart` hook to open the tab, so the MCP server now opens it on the first tool call when no hook file exists for this PPID. One-shot guard avoids re-opening if the user closes the tab. Claude Code behaviour unchanged.
- `LICENCE` file (MIT).

### Changed
- `resolveClaudeSessionId()` is now total — always returns a string. Dead "no session id" error branches removed from `cli.ts` and `mcp.ts`.
- `package.json` reshaped for npm publishing: scoped name `@ammduncan/easel`, MIT licence, repo/homepage/bugs URLs, keywords for discovery, `engines.node >=20`, `files` whitelist (only bin/dist/scripts/skills/README/LICENCE in the tarball), `prepublishOnly` script, `publishConfig.access=public`.
- Package size: 47 kB tarball, 165 kB unpacked, 3 runtime deps.

## 0.1.0 — internal baseline

The pre-publish baseline. Highlights from the unreleased history:

- Renamed project from `claude-display` to `easel`; data root migrated from `~/.claude-display` to `~/.easel` with one-shot `mv` on first start. Browser localStorage keys (`claude-display:*`) and postMessage events migrated to the `easel:*` namespace with a browser-side migration shim. Internal `__CLAUDE_DISPLAY__` window global renamed to `__EASEL__`. Env vars renamed (`CLAUDE_DISPLAY_PORT` → `EASEL_PORT` with legacy fallback).
- Dropped `jq` as a runtime dependency. Ported `scripts/easel-session-id.sh` to `scripts/easel-session-id.mjs` (Node stdlib only).
- Added `easel restart` command.
- MCP tool names finalised as `push`, `open`, `config`, `label` (invoked as `mcp__easel__*`).
- Skill folder canonicalised at `skills/using-easel/`.

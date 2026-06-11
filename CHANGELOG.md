# Changelog

All notable changes to easel. This project adheres to [Semantic Versioning](https://semver.org/).

## Unreleased

### Fixed
- **Reserved primitive class names (`code`/`terminal`/`window`) no longer render invisible dark-on-dark when an author reuses them.** Two correct-in-isolation rules were mutually destructive: the structural primitives set a fixed dark background + light ink at specificity `(0,1,0)`, while the documented `.wrap * { color: inherit }` guard is *also* `(0,1,0)` but lives later in source order (author `<body>` vs injected `<head>`), so it won the tie and flipped the primitive's ink back to the author's near-black `.wrap` colour → near-black text on the primitive's dark fill, invisible. Because the names are generic English words, author markup naturally reused them (`<td class="code">`, `<span class="code">`) and inherited the dark fill unintentionally. Fixes: (1) **Hardened** — each primitive's `background` + `color` are now committed with `!important` on the *container only* (not on `*`/token rules), so `.wrap * { color: inherit }` can't flip the ink; syntax-highlight tokens still win by specificity and are untouched. Existing content becomes readable with no author change. (2) **Namespaced** — `.easel-code` / `.easel-terminal` / `.easel-window` (and `[data-easel="code|terminal|window"]`) are the canonical collision-free forms; bare `code`/`terminal`/`window` remain as deprecated aliases. (3) **Warned** — the in-iframe guard now logs a console warning when a reserved primitive name lands on an inline/table element (`span`/`td`/…), the accidental-collision signature; the existing low-contrast warning points at the same cause. `using-easel` SKILL + kit guide document the reserved names, the `.easel-*` forms, and the `mono`/`<code>` workaround. Verified by rendering the exact `<td class="code">` / `<span class="code">` / `.code` / `.easel-code` repro against the real injected CSS in light mode.

### Added
- **`EASEL_SUPPRESS_SESSION=1` env var suppresses switcher-session registration.** When set on a `claude` (or any client) invocation, easel still loads as an MCP but every tool (`push`/`label`/`open`/`config`) short-circuits to a no-op — the MCP never contacts the HTTP server and the session never appears in the switcher. The SessionStart hook also skips its convention reminder so the agent isn't nagged to label a session that can't register. Built for automated/headless consumers that run easel-registered Claude on a tight cadence (e.g. the ammiels-bot dispatcher tick fired every ~60s by launchd), which otherwise pile up churny "Bot watcher tick" entries in the switcher. Deliberately MCP-local: it leaves the Slack connector and every other MCP/account connector fully intact, unlike `claude --strict-mcp-config`, which also strips the claude.ai account connectors.

## 0.6.2 — 2026-06-04

### Fixed
- **`setup` now actually puts `easel` on PATH, making the documented bare CLI commands truthful.** The README's CLI section documents `easel open / update / restart / …`, but neither install path ever exposed the binary: `npx -y @ammduncan/easel setup` runs once from the ephemeral npx cache and leaves nothing behind, and clone installs' `bin/easel setup` never linked. Setup now closes the gap per install flavor: clone installs get `npm link` (skipped when `easel` already resolves); npx-cache runs get a real `npm install -g` pinned to their own version, then **delegate setup to the global copy** so the MCP/hook registrations point at paths that survive npx cache pruning (the cache-pruning drift left one machine's MCP pinned to a stale 0.5.1 cache while 0.6.x shipped). Failures degrade to a printed hint — setup never hard-fails on the PATH step.
- **`easel update` now works for npm installs.** It previously assumed a git checkout (`git pull` flavor, "clone installs only") and just failed elsewhere. Without a `.git` dir it now runs `npm install -g @ammduncan/easel@latest` and re-runs setup from the new copy.

## 0.6.1 — 2026-06-04

### Changed
- **The "different session" push hint now requires the surface-the-tab question to be asked ALONE.** When a push lands while easel is open on another session, the tool result tells the agent to ask the user whether to (a) switch the open tab or (b) open a fresh one. Agents were bundling that question into a multi-question prompt alongside follow-ups that assumed the user had already *seen* the pushed content — which they hadn't, since the tab wasn't surfaced yet. The hint now spells it out: ask this one question first, by itself; once the tab is visible, ask the rest. Prompt-text only; no runtime change.

## 0.6.0 — 2026-06-03

### Fixed
- **A `100vh` (or `vh`/`dvh`/`svh`) root no longer silently collapses to a stub.** `vh` resolves against the push iframe — which has no intrinsic viewport — so the idiomatic full-screen app shell (`height: 100vh` on the root) measured against the iframe's ~150px default and cropped mid-content; two different local render-window sizes produced pixel-identical collapsed cards, proving the author's intended viewport never reached easel. The self-measure bridge now reports, alongside the existing floored `height`, a **non-floored `content` height** (walks body-child bottoms instead of the viewport-floored `documentElement.scrollHeight`) and the iframe's own **`vp`**. A parent-side phase machine (`applyMeasuredSize`) leaves normal cards untouched — they size to their content exactly as before, keeping the 150px historical floor — but when content **exactly fills** the viewport (the viewport-lock signature) it probes at a distinct viewport (720px) and, if content tracks it, **pins the card to the 900px desktop canvas** (matching `.window.desktop`) instead of letting it collapse. Stale mid-probe measurements are ignored, and a content that *coincidentally* equals the initial viewport is correctly released to its real height rather than mistaken for `100vh`. Covered by `tests/unit/height-autoguard.test.mjs` (shape) and `tests/unit/height-autoguard-behaviour.test.mjs` (drives the real shipped function through full measurement feedback loops).

### Changed
- **`push` tool description + `using-easel` skill: documented card sizing and mockup-granularity.** Two additions. (1) A **card-height rule**: card height = your content's intrinsic height; there's no `height` knob and you don't need one (the px you write *is* the height), but avoid `100vh` on the root — it's the one unit that doesn't mean what you think inside the iframe; for a full screen use `min-height: 900px` (or the source's real height) explicitly. (2) A **split-by-role rule** for mockups: the mere presence of a mockup isn't a reason to split it onto its own card — keep it inline (`.full-bleed`, optionally `.window`) when it illustrates the prose's point, but give it its own push (one per screen, `kind:"app"`) when the screen is the primary artifact, when comparing 2+ full screens, or when the user will export/share it standalone. Own-push buys real per-card app fidelity (`kind` is per-push), a faithful frame height, and a clean standalone export.

## 0.5.1 — 2026-05-31

### Changed
- **Sharpened the `using-easel` skill's `kind:"mockup"` decision rule and added a no-`100vh`-rail height rule** — both targeting recurring app-fidelity authoring bugs. The decision section now leads with the real question — *"is the WHOLE push one full-bleed app screen, or is it prose + embedded specimen(s)?"* — and spells out that a review card / spec sheet / lookbook page (eyebrow + heading + prose + labelled specimen images) is a **presentation**, so `kind` should be left **off**: the prose then lands in the ~56ch reading measure with comfortable side padding, while specimens go in `.full-bleed` and fill the wider content column. Tagging such a card `kind:"mockup"` strips the prose-width cap *and* the body padding, so paragraphs run to the card edge — a bug observed repeatedly in marketing-kit/lookbook cards whose wrapper hand-set only `padding:8px 4px`. A failure-mode callout now documents it, plus the reminder that prose only gets the cap as a direct `body` child or inside `div.wrap`. The new height rule: within a full-screen mockup, never pin an inner rail/sidebar to `100vh`/`min-height:100vh` while the main column is shorter — the rail paints past the content and the self-measured frame inherits the dead band; flex-stretch the shell (`display:flex; align-items:stretch`, no height on the rail) so the rail can only ever be as tall as the tallest column. Docs-only; no runtime change.

## 0.5.0 — 2026-05-29

### Fixed
- **Exports of pushes built from nested `<iframe srcdoc>` panels (e.g. lookbook specimen grids) are no longer blank.** `html-to-image` can't reach into nested iframes, and the outer push iframe is opaque-origin, so a push composed of nested-iframe panels exported with every panel empty. A capture bridge is now injected into each nested `srcdoc` at wrap time; on export the parent asks each nested frame to render itself (`toSvg`) and composites the results onto the canvas at each frame's measured rect. Lazy nested frames are eagerly loaded before capture, and the export watchdog was extended (30s → 2min) so large multi-panel PNG/PDF renders don't time out.

## 0.4.2 — 2026-05-28

### Added
- **Pushes now self-check for low-contrast text and stamp a warning chip on the card when they find any.** The #1 recurring author bug — flagged prominently in the push tool description and *still* shipped repeatedly — is a hand-rolled dark code container: author sets `background:#0b0f17` on a custom div but leaves base text inheriting the wrapper's `light-dark(#111, …)` ink, which resolves to near-black against the dark panel in light host mode and the code vanishes (only spans with explicit syntax colours survive). A new in-iframe guard now runs after fonts ready, walks text-bearing elements (bounded at 2000 for cheap), computes WCAG contrast ratio between each one's text colour and its effective background (climbing past transparent ancestors), and posts back `easel:contrast-warn` if any ratio is below 3:1 — well below AA's 4.5:1 floor and the point where text becomes genuinely unreadable. The parent stamps an amber `⚠ contrast` chip on the push's meta row with the offender list in the tooltip (tag, class, ratio, fg-on-bg rgb pair), and the iframe also `console.warn`s the full sample so the offenders surface in DevTools. Symmetric: catches both directions of the bug (dark-on-dark *and* light-on-light hand-rolled containers). The guard is injected into all three render paths (`buildDefaultWrapper` app-fidelity branch, `buildDefaultWrapper` presentation branch, `injectBridge`), and a regression test asserts the injection count so no future render branch can silently skip the check. The right fix is still to reach for the locked-mode primitives (`<div class="code">` / `<div class="terminal">`), and the warning text points authors there. Covered by `tests/unit/contrast-guard.test.mjs`.

## 0.4.1 — 2026-05-26

### Fixed
- **App-fidelity pushes (`kind:"app"`/`"mockup"`) can now be exported — they were silently hanging.** The 0.3.3 export fix (toSvg-based, rAF-free bridge) was only wired into `buildDefaultWrapper`'s *normal* branch and `injectBridge`. `buildDefaultWrapper` returns early for app-fidelity with a separate template, and that branch loaded the html-to-image CDN but never injected the `imageExportScript` bridge — so `kind:"app"`/`"mockup"` cards had **no `easel:image` handler at all**. Clicking export posted a message nothing listened for; the push never reported back and the 30s watchdog fired ("Export timed out…"). The bridge is now injected into the app-fidelity branch too. The `image-export` regression test now asserts the bridge is referenced by **both** `buildDefaultWrapper` branches plus `injectBridge`, so no single render path can lose it again. Verified live: an app-fidelity auth mockup that timed out now exports in ~0.5s.

## 0.4.0 — 2026-05-26

### Added
- **Remote images are now inlined server-side at push time, so pushes that embed cross-origin images export correctly.** A push that referenced a remote image (e.g. a mobbin.com screenshot in an `app`/`mockup` recreation) rendered fine on screen but **couldn't be exported to PNG/PDF**: the browser blocks cross-origin images from canvas rasterisation (CORS), and drawing one taints the canvas so `toDataURL` throws — export would stall until the 30s watchdog fired (see 0.3.3). The fix moves the fetch to the server: `POST /api/push` now scans incoming HTML for remote `<img src>` and CSS `url(...)` references, fetches each server-side (no CORS limit), and rewrites them to self-contained `data:` URLs before storing the push. Exports then work, and the push survives the original URL later expiring (mobbin's `…/mcp/short/…` links are ephemeral). Fetches run in parallel, each bounded by an 8s timeout with an 8MB size cap and an image-content-type check; a URL that can't be inlined (timeout, non-image, too large, network error) is left untouched — it still displays, just won't appear in an export — so a dead link degrades gracefully instead of failing the push. Opt out with `EASEL_INLINE_IMAGES=0`. Covered by `tests/unit/inline-images.test.mjs`.

## 0.3.3 — 2026-05-26

### Fixed
- **PNG and PDF export no longer hang when the easel tab isn't the visible foreground tab.** Export rasterised via `html-to-image`'s `toPng`/`toJpeg`, which resolve through the library's internal `createImage()` — and that waits on `requestAnimationFrame`. Chrome freezes rAF in hidden/background tabs, so the rasterize promise never settled: click export, switch back to your terminal, and the button spinner span forever with no error (the viewer had no timeout to recover). Both formats died here because they share the path. The export now stops at `htmlToImage.toSvg()` (no rAF) and rasterises onto a canvas with a plain `Image`, whose `onload` fires even in hidden tabs. Quality is unchanged — the SVG is vector, drawn onto a DPR-4 canvas, so PNG stays lossless and PDF stays JPEG q1.0. The two render paths (`buildDefaultWrapper` and the full-HTML `injectBridge`, which had drifted to capturing `body` vs `documentElement`) now share one `imageExportScript()`. A missing `html-to-image` now posts an error instead of returning silently, and a 30s parent-side watchdog clears the spinner and surfaces a timeout if the iframe never reports back. Covered by `tests/unit/image-export.test.mjs`.

## 0.3.2 — 2026-05-26

### Fixed
- **App-fidelity (`kind:"mockup"`/`"app"`) text painted with `light-dark()` now tracks the easel light/dark toggle instead of the OS color scheme.** Authors paint mockup ink with `color: light-dark(#dark-ink, #light-ink)`, which resolves off the document's *computed* `color-scheme` — not the `data-theme` attribute. The normal wrapper binds `color-scheme` to `data-theme` via `PRESET_TOKENS_CSS`, so `light-dark()` follows the toggle there. But the app-fidelity branch deliberately omits the preset tokens (the agent owns every pixel) and nothing else bound `color-scheme`, so it stayed at the author's `color-scheme: light dark` and `light-dark()` followed the **OS** preference. The symptom was intermittent and maddening: text was perfectly readable when the viewer's theme happened to match the OS, then washed out (white ink on a light card, or dark ink on a dark card) the moment they disagreed. Added a `:root[data-theme]{color-scheme}` binding to the shared `STRUCTURAL_PRIMITIVES_CSS` so `light-dark()` tracks the easel toggle in *every* wrapper branch. A new visual-regression fixture (`mockup-lightdark-ink`) audited across the theme × OS-scheme matrix reproduces the washout with the binding removed (contrast 1.0) and passes with it in place.
- **Session-id resolution no longer drifts for non-Claude-Code MCP clients (opencode, Cursor, Windsurf, …).** The resolver's tier-4 fallback scanned `~/.claude/projects/<cwd>/` for the most-recently-modified transcript. That's a Claude-Code-specific signal, but it fired for *any* client — so a non-CC client running in a cwd that also holds Claude Code transcripts latched onto whichever transcript was touched last, and the resolved session id changed on every tool call (observed in opencode: `open()`, `push()`, and `label()` each landing on a different session). The scan is now gated behind a positive Claude Code signal (`CLAUDECODE` / `CLAUDE_CODE_ENTRYPOINT`); other clients fall straight through to the stable per-process synthetic id (tier 5), so `open`/`push`/`label` all resolve to one session for the life of the chat. Covered by a new unit suite (`tests/unit/session-id.test.mjs`, run via `npm test`).

### Docs
- **`push` tool description and the using-easel skill now lead with a fidelity bar: ship high-fidelity, production-grade output by default.** Aimed at getting quality output from non-Claude models that don't infer it — every push should read like a screenshot of shipped software (real content, complete regions, exact values when recreating UI, real iconography, deliberate hierarchy), not a wireframe or grey-box. Low-fidelity is opt-in: only when the user explicitly says rough/wireframe/sketch is fine.

## 0.3.1 — 2026-05-26

### Fixed
- **Prose measure tightened from ~90 to ~66 characters per line.** The reading-column cap was `max-width: 880px`, which at the 18px body font produces ~90-character lines — past WCAG 1.4.8's 80-char ceiling and well past Bringhurst's 45–75 comfortable range. Changed to `max-width: 56ch`. The `ch` unit is the width of the "0" glyph and proportional Inter averages narrower, so 56ch renders ~66 actual characters — the reading-measure sweet spot. (`ch` scales with font-size, so headings stay proportional; short headings never hit the cap, so it's load-bearing only on body paragraphs, which is correct.)
- **`.full-bleed` now has vertical breathing room.** It only set horizontal margins, so a paragraph after an embedded mockup hugged the frame with no gap. Added `margin: 32px 0`; it collapses correctly against adjacent prose margins (32px, not 64) and the existing first/last-child margin resets still zero it at the card's top/bottom edge.

## 0.3.0 — 2026-05-26

### Fixed
- **App-fidelity mode (`kind:"mockup"`/`"app"`) no longer strips the structural primitives — `.window`/`.code`/`.terminal` now render in mockups.** The wrapper has two branches: a normal presentation branch and an app-fidelity branch for UI recreations (which skips presets/tokens/chips/prose-caps/body-bg so the agent controls every pixel). But app-fidelity skipped the *entire* built-in stylesheet — including the self-contained `.window` window chrome and `.code`/`.terminal` code blocks — while the skill and the `push` tool description told agents to use `.window` *for mockups*. So a `kind:"mockup"` push with `<div class="window">` rendered as unstyled serif text with no chrome (the same "I shipped a fix but it doesn't apply here" surprise as the 0.2.29 `.window` washout). Extracted the primitives — which use fixed, theme-independent colours and can't leak the host theme — into a shared `STRUCTURAL_PRIMITIVES_CSS` constant injected into BOTH wrapper branches (single source, no duplication; the normal branch's inline copies and their `@media print` overrides were removed). A mockup can now reach for `.window`/`.code`/`.terminal` and they render, in either kind.
- **App-fidelity mode now sets a system-sans default font instead of falling back to serif.** It deliberately omits the Inter webfont (so the agent controls typography with no CDN dependency), but it also left no `font-family` at all, so any mockup that didn't set its own font rendered in Times serif. Added a `system-ui, -apple-system, "Segoe UI", sans-serif` floor; the pushed HTML's own `font-family` still wins the cascade.

### Added
- **Visual-regression test suite (`tests/visual/`).** A fixture battery covering every built-in primitive plus realistic composites, each carrying an injected contrast-audit that walks text nodes, composites translucent backgrounds over the host backdrop, computes WCAG contrast, and reports washout failures. A driver pushes them to a running server; the suite is rendered across the full preset × theme × density matrix (+ print) to catch surface-vs-ink regressions. The two fixes above were both found by this suite. See `tests/visual/README.md`.

### Docs
- **`push` tool `kind` description and the using-easel skill now state what app-fidelity keeps vs strips** — structural primitives + sans default kept; presentation defaults (preset tokens, chips, prose caps, body bg/color, Inter) stripped — so the "use `.window` for mockups" guidance and the engine no longer contradict each other.

## 0.2.29 — 2026-05-25

### Fixed
- **`.window` mockups no longer wash out in a dark-mode viewer — pin a stable surface like `.code`/`.terminal` already do.** `.window` set `background: light-dark(#ffffff, #161616)`, so its surface *flipped* with the host theme, and it never pinned text color or re-scoped `color: inherit` to children. In a dark-mode viewer the window resolved to a dark `#161616` panel, and a light-dashboard mockup's subtle gray-on-white labels (pills, captions, KPI sublabels) vanished against it — only explicitly-coloured figures survived. This is the identical surface-vs-ink mismatch the 0.2.28 `.code`/`.terminal` primitive locks against; it was fixed for code blocks but the `.window` chrome was never given the same treatment, and its theme-flipping background made it worse (the same mockup rendered differently per viewer). A mockup renders an app's own UI and should look the same to everyone, so `.window` is now a **stable light canvas**: white bg, pinned `#1a1a1a` ink, `color: inherit` re-scoped to every child. Added an opt-in **`.window.dark`** variant (locked dark surface + light ink + dark chrome + stronger shadow) for genuinely dark-UI mockups, and a `@media print` override so a dark mockup prints legibly (browsers drop background colors by default, which would otherwise strand its light ink on white paper). Skill + `push` tool description updated to document the stable surface and `.window.dark`.

## 0.2.28 — 2026-05-25

### Added
- **Built-in `.code` / `.terminal` code-block primitive — kills the invisible-code-block bug at the source.** The single most recurring failure was a hand-rolled dark code container: an agent sets `background:#0f172a` on a custom div but leaves base text inheriting `.wrap`'s `light-dark(#111,…)`, which resolves to near-black in light host mode and vanishes against the dark panel (only the explicitly-coloured syntax spans survive). The guidance to lock bg+ink as a pair was correct but purely advisory — it relied on the agent remembering it every push. Now the wrapper ships a baked-in primitive: `<div class="code">` (alias `.terminal`) locks both background and ink, re-scopes `color: inherit` to every child, and provides the verified github-dark token classes (`.kw .string .fn .prop .num .comment .muted .accent`) so syntax highlighting reads against `#0f172a` with no per-token tuning. Same lever as the existing `.window` chrome — a safe primitive agents reach for instead of hand-rolling. Prints on white paper with dark text like `pre`/`code`.

### Docs
- **Steered the `push` tool description and skill toward the new primitive.** The locked-mode section now leads with "use the built-in `.code`/`.terminal`, don't hand-roll", demoting the hand-rolled CSS to a fallback for other locked containers (brand heroes, custom callouts). Added a "Code & terminal blocks" entry to the skill's Built-in helpers. Plain `<pre>`/`<code>` remain safe (bg+ink token pair) as before.

## 0.2.27 — 2026-05-23

### Fixed
- **Stopped steering agents into clipped mockups — `min-height`, never fixed `height`.** The mockup-height guidance recommended a fixed `height: 760px` for full-screen mocks, which is the exact footgun that crops content: a fixed `height` + the `overflow: hidden` that frames carry guillotines anything taller than the guessed value (buttons sliced through text, lists cut mid-item). This was self-inconsistent — the wrapper's own `.window.desktop` already uses `min-height: 900px`, not `height`. Changed the full-screen advice to `min-height` throughout (a floor that still lets content grow), and reproduce a source element's height as a `min-height` too.

### Docs
- **New "Never clip content" rule, the vertical twin of "build mockups fluid".** Never pair a fixed `height` with `overflow: hidden` on any content container (cards, panels, device/browser/phone frames, stages, slideovers, toasts) — containers size to content via `min-height`; `overflow: hidden` is for genuine cosmetic crops only (rounded-corner image masks, decorative bleed). Decorative frames must grow with their content. Also added a `.window`-specific caveat: it carries `overflow: hidden` to clip its rounded corners, so a fixed `height` on `.window` or an inner stage clips invisibly — let it grow via `min-height`. Skill + inline `push` tool description.

## 0.2.26 — 2026-05-23

### Changed
- **The "open on another session" push hint now nudges agents to use their interactive question tool.** When a push lands but easel is showing a *different* session, the hint returned to the agent previously just said "ASK the user…", which agents (including Claude Code) tended to render as a passive one-line note. It now explicitly says: if your client has an interactive question/prompt tool (e.g. `AskUserQuestion`), use it to offer the choice as clickable options — (a) switch the open tab via the topbar dropdown, or (b) call `open` for a fresh tab — rather than burying it in prose. Stays client-agnostic (text-only clients still read a clear instruction; capable clients self-upgrade to a structured prompt) — no UI is forced at the MCP layer.

## 0.2.25 — 2026-05-23

### Docs
- **Documented the `.window` primitive and the "build mockups fluid" rule.** Added the `.window` / `.window.desktop` chrome to the skill's helpers section (it shipped in 0.2.24 with CSS but wasn't written up), and a guidance rule: lay desktop mockups out with flex/`%`/`fr` widths, not hardcoded `width: 1440px` columns. 1440 is a *max*, not a target — a fluid mockup reflows to fit when the viewer's window is narrowed, so there's no horizontal scroll, nothing clipped, and PNG/PDF exports stay complete. (Answers "should desktop mockups scroll horizontally when squeezed?" — no; build fluid so they reflow.) Also corrected the now-stale `.full-bleed` description to match 0.2.24 (fills the content column from the shared left edge, doesn't bleed to the card's physical edge). Skill + inline `push` tool description.

## 0.2.24 — 2026-05-23

### Added
- **`.window` primitive — skeuomorphic macOS window chrome for mockups.** `<div class="window" data-title="App name">…</div>` draws a 40px title bar with the three traffic-light dots (red/yellow/green) and a centred title from `data-title`; content sits below. Add the `desktop` class (`class="window desktop"`) for the 1440×900 (16:10) standard design canvas via `min-height: 900px` — so a full desktop-screen mockup looks like a real window with viewport breathing room, while a dialog/component in the same chrome (no `desktop`) stays content-sized. Pairs with `.full-bleed` to fill the content column.

### Changed
- **Reading column is now left-aligned with a shared left edge, instead of per-element centred.** 0.2.22 centred each prose element independently, which produced a ragged left edge when elements had different `max-width`s (e.g. a deck capped narrower than the heading). Reverted to left-aligned prose; `.full-bleed` now fills the content column from the *same* left edge (dropped the viewport-breakout/centring) — so prose and mockups share one left margin down the card, and neither touches the card edge (the body padding stays as a gutter).
- **Client JS/CSS now sent with `Cache-Control: no-cache`** so a normal reload revalidates and picks up updates, instead of serving a stale cached `viewer.js` that required a hard reload (⌘⇧R). Takes effect after the MCP server restarts.

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

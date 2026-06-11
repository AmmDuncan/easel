---
name: using-easel
description: Use whenever a response is about to include a long explanation (>2 paragraphs), a UI mockup, a diagram, a side-by-side comparison, ≥3 options, a code diff / before-after, or a multi-step status / progress view — push it to the easel display instead of dumping a wall of text in the terminal. Trigger on content shape, not on whether the user mentioned "easel" or "display".
---

# using-easel

The `easel` MCP gives this session a live browser tab the user keeps open in split-screen. The `push` tool appends a card to a single scrolling page. You push **proactively**. You do not ask.

## When to push

- Explanation that would run >2 paragraphs in the terminal.
- Any UI mockup, wireframe, or layout proposal.
- Side-by-side comparisons, ≥3 options, decision matrices.
- Architecture / sequence / flow / state diagrams.
- Code diffs or before-after snippets where scanning visually helps.
- Multi-step progress, status snapshots, run summaries.
- Anything you'd otherwise format as a long markdown block with multiple headings.

Triggers are **content-shape**, not user-phrasing. If the answer would be a wall of text or a visual, push it — regardless of whether the user said "show me" or named the tool.

## When NOT to push (stay terminal)

- 1–2 lines.
- Clarifying questions or yes/no acknowledgements.
- A single short code block the user is about to copy.
- Direct answers to "what's the value of X" style queries.

## Tools

- **`push({ html, title?, kind? })`** — appends a card. `html` is required; the wrapper sandboxes it in an iframe and injects a baseline design system. `title` is shown in the card header. `kind` is a freeform tag for the chip (`mockup`, `diff`, `explanation`, `comparison`, `diagram`, `progress`, `status`, etc.).
- **`open()`** — force-open a fresh browser tab for this session.
- **`config({ preset?, theme?, density? })`** — switch palette, mode, or layout live. Presets: `paper` | `aurora` | `slate`. Themes: `light` | `dark`. Density: `carded` | `flat`.
- **`label({ label })`** — name the session ("Roadworthy 401 fix"). Call early once the task focus is clear; re-call when the theme shifts. Pass `""` to clear.

Reply in chat with **one line**: `pushed to easel ↗ — #N`. Do not restate the content.

### Tab presence

Every `push` response tells you how many viewer tabs are currently open for this session. The response text includes `· NO TAB OPEN for this session — ask the user if you should open one (call \`open\`)` when the count is zero.

When you see that hint, in the SAME reply ask the user a one-liner: *"No window is open for this session — want me to open one?"*. If they say yes, call `open()`. If they say no or ignore it, don't ask again unless they explicitly want the visual.

Don't poll. Just react to the hint when it appears.

---

## Style — presentation scale, not dashboard scale

Pushed cards are **presentations**, not UI dashboards. Read each rule and apply it; the wrapper gives you good defaults but they only carry so far.

### 0. Fidelity bar — ship high-fidelity by default

Every push should look like a **screenshot of shipped software or a finished design** — polished and production-grade — not a rough sketch, wireframe, or grey-box placeholder. Quality is the default; you don't need to be asked for it. Only drop to low-fidelity when the user **explicitly** says rough / lo-fi / wireframe / sketch / quick-and-dirty is fine, or asks for a napkin-level thumbnail. When unsure, go high-fidelity.

Concretely, high-fidelity means:

- **Real content, never placeholders.** Plausible names, realistic numbers/dates/currency, actual copy — no "Lorem ipsum", "Label", "Item 1 / Item 2", "Title goes here", or "…".
- **Complete, not stubbed.** Fill every region you draw — no empty cells, half-built tables, or "etc." rows. A nav with 8 items shows 8.
- **Exact values when recreating real UI.** Pull true colors, spacing, radii, type, and layout from the component / theme / Figma / DevTools (see [Use the actual values](#use-the-actual-values-not-approximations)). A close-but-wrong mock misleads more than none.
- **Visual craft.** Deliberate hierarchy, aligned grids, a consistent spacing scale, real iconography (inline SVG — not emoji standing in for icons), and the states that matter (empty / hover / active). Avoid the generic-AI look: one purple gradient, evenly-sized boxes, everything centered.
- **Tangible over abstract** (see [Visualizations](#5-visualizations--tangible-over-abstract)) — the mock should read as the actual thing, not labeled rectangles.

If you genuinely can't clear the bar (missing real values, ambiguous source), say so in one line in chat and push your best honest attempt — don't pass a rough draft off as final, and don't silently ship a grey-box.

### 1. Typography

- **Page lede**: 40–52 px, weight 500, letter-spacing ≈ -0.025em
- **Section / slide titles**: 28–36 px, weight 500
- **Body text and decks**: 18–22 px, weight 400, line-height ≥ 1.55
- **Eyebrow / kicker** (the small label above a title): 13–14 px UPPERCASE, letter-spacing ≈ 0.14em, weight 500
- **Captions, meta**: 13 px minimum — never go below

Use Inter (the wrapper preconnects to `rsms.me/inter`) or system sans. Never use a serif unless the brief explicitly calls for one.

### 2. Whitespace

- **Page padding** inside the wrapper: 56–80 px vertical, 32–48 px horizontal (the wrapper sets ~40 px / clamp ~28–64 px by default — respect that)
- **Between major sections**: 96–120 px
- **Between the deck/intro and the first content block**: 40–48 px
- **Inside cards**: 24–32 px padding minimum

Don't pack content. Space carries the rhythm of a presentation.

### 3. Color

- **The host iframe owns the canvas.** Don't paint `background` on `body` — it fights the host and shows up as a wrong-shade block when the user is in the opposite mode. *Exception:* if a particular push really needs to be dark regardless of host (a code-heavy push, say), then OWN the canvas — `background: #0b0f17; color: #e5e7eb;` on `.wrap` — and commit fully to dark.
- **One accent only.** Use the wrapper's `var(--ds-accent)` token (it adapts to whichever preset the user picked). Limit accent uses to **3–4 per push**.
- **Status colors** (red / amber / green) only when content actually maps to status — not as decoration.
- **Page background is never pure white.** The wrapper uses an off-white (`#fafafa`-ish) or a deep dark depending on the host. If you must paint a card surface inside the push, use `var(--ds-surface)`.

### 4. Light / dark — make EVERYTHING adaptive

Because the host owns the canvas color, **text color and any local card backgrounds must also respond to the user's light/dark mode**. Hardcoding `color: #111` puts black text on a dark canvas and the whole push goes invisible — this has bitten us repeatedly.

Use CSS `light-dark()` to swap:

```html
<style>
  :root { color-scheme: light dark; }
  .wrap {
    color: light-dark(#111, #e5e7eb);
    padding: 56px 40px 96px;
    font-family: -apple-system, 'Inter', system-ui, sans-serif;
  }
  /* Scope inheritance so the wrapper's text color reaches every child.
     ZERO-specificity (:where) so it neutralises UA link/button colours but is
     beaten by ANY authored container colour — a hand-rolled dark callout keeps
     its own ink instead of inheriting .wrap's and vanishing on its dark bg. */
  :where(.wrap) :where(*) { color: inherit; }

  /* Cards float above whatever canvas the tool gives us — also adapt */
  .card {
    background: light-dark(#fff, #111827);
    border: 1px solid light-dark(#e5e5e5, #1f2937);
    border-radius: 12px;
    padding: 24px;
  }

  /* Same treatment for any badge, chip, accent shade you'd previously hardcode */
  .badge {
    background: light-dark(#f0fdf4, #052e16);
    color: light-dark(#028043, #6ee7b7);
  }
</style>
<div class="wrap">…</div>
```

**Locked-mode containers must lock their own text color too.** Any container that paints a *fixed*, non-adaptive background — a terminal/code block locked to dark, an always-dark callout, a hero filled with a brand color — MUST also set its own text color (and re-scope `color: inherit` to its children for nested elements). Otherwise it inherits `.wrap`'s `light-dark()` and the text flips to the wrong shade for that container's background in one of the two modes. (As long as you use the zero-specificity `:where(.wrap) :where(*)` adoption rule above, a single class on the container — `.tip { background:#111; color:#eee }` — is enough; its colour now wins. The old element-qualified form `.wrap div { color: inherit }` was `(0,1,1)` and silently OUTRANKED such a container, flipping its text to the canvas ink — black-on-black — which was the recurring "dark block, text invisible" bug. No `!important` needed anymore.)

#### App / UI recreations are *always* locked-mode

When you're rendering a recreation of a real piece of UI — a mock of an app screen, a component instance, an embedded preview of what the user will actually see — **that mockup owns its theme completely. Don't make it adapt to the host.**

It's a screenshot-equivalent. If the real app is a dark cobalt dashboard with cyan accents, the mockup should be dark cobalt + cyan regardless of whether the user has easel in light or dark mode. If the real app is a warm cream marketing page, the mockup stays warm cream. The host toggle changes the *surrounding explanation*, not the embedded app preview.

Two reasons:
1. **Visual fidelity.** A mockup of the app in dark mode looks wrong when paper-light leaks into it. The user is trying to evaluate the implementation, not a translated version of it.
2. **It removes a class of bugs.** App previews have lots of nested elements (buttons, chips, table cells, modal overlays) — getting every layer to adapt correctly via `light-dark()` is fragile. Locking the whole island is simpler and more faithful.

How to do it: paint the mockup's outer container with the app's actual `background` and `color`, and re-scope `color: inherit` to every descendant so the host's adaptive text doesn't leak in:

```html
<style>
  .wrap {
    /* host-adaptive surrounding prose */
    color: light-dark(#111, #e5e7eb);
  }
  :where(.wrap) :where(*) { color: inherit; }   /* zero-specificity: locked islands below keep their own ink */

  /* The app mock — LOCKED to the real app's colors, ignores host mode */
  .app-mock {
    background: #0a0e1a;        /* the app's actual canvas */
    color: #e5edff;             /* the app's actual ink */
    border-radius: 12px;
    padding: 32px;
  }
  .app-mock * { color: inherit; }    /* re-scope so .wrap's light-dark() can't leak in */
  .app-mock .btn-primary {
    background: #3b82f6;
    color: #fff;
  }
  .app-mock .card {
    background: #131933;
    border: 1px solid #1f2647;
  }
</style>
<div class="wrap">
  <h2>Here's the new payments modal</h2>
  <p>Locked dark, just like the app.</p>

  <div class="app-mock">
    <!-- self-contained app preview; doesn't care about host theme -->
  </div>
</div>
```

Same principle for light-themed apps: lock to the app's cream/white surface, lock the ink, lock every accent. The host toggle moves the prose around the mock; the mock stays put.

#### Use the actual values, not approximations

When the mockup references a real thing — a real app, a real component, a real Figma — **every visual value must come from the source**. Don't ballpark anything: not colors, not sizing, not spacing, not typography, not radii. A close-but-wrong recreation is more misleading than no recreation at all.

**Where to find the actual values** (in this order of preference):

1. The component's own CSS / styled-components / template (`components/.../Foo.vue`, `Foo.tsx`, `Foo.module.css`).
2. The project's theme / token file — `config/theme.ts`, `tailwind.config.ts`, `app.css` `@theme`, design-system CSS vars.
3. The Figma node (`get_design_context` in the figma MCP) — exact px, font, weight, fill.
4. Computed styles in the browser — open DevTools on the running app, inspect, copy.
5. Brand-asset SVGs for logos/marks.

**What to copy literally**:

- **Colors** — the actual hex / oklch / token. `#2f5fd1`, not "blue-600 ish". Pull the project's primary, status palette (success/danger/warning), and surface tones — many apps use unusual values that don't match Tailwind defaults.
- **Spacing** — paddings, margins, gaps. If the source uses a 4-px scale (`p-4`, `gap-6`), use those literal values. If it uses arbitrary px (`padding: 22px`), use 22, not 24 because it "looked close enough".
- **Sizing** — heights, widths, max-widths, min-heights of buttons, inputs, rows, modals, sidebars. A button that's 36 px tall in the app should be 36 px in the mock. The "Tailwind h-10 / h-11 / h-12" guess is wrong if the app actually uses 40 or 38.
- **Border radii** — components vary wildly (4 / 6 / 8 / 10 / 12 / 14 / 16 px). Pull the exact one.
- **Borders** — thickness, color, dashed vs solid. A 1 px line and a 1.5 px line read differently; copy what's there.
- **Shadows** — drop the literal `box-shadow` value from the source, not a generic `0 1px 3px rgba(0,0,0,0.1)`.
- **Typography** — font stack, weight, size, line-height, letter-spacing. Don't substitute "system-ui" for an Inter app, and don't render a 13 px label as 14. Inter ≠ Manrope ≠ Geist ≠ SF Pro.
- **Layout** — gap, grid-template-columns, flex-direction, justify-content alignment. If the app's table has 6 columns at specific min-widths, your mock should have 6 columns at those widths.
- **States** — hover, active, focused, disabled visuals. If you're showing a focused input, render the actual focus ring color and offset from the source.

**If you can't reach the actuals**, say so explicitly in the chat reply (e.g. *"Couldn't find the project's theme file — colors and sizing in this mock are estimates"*) and skip the mock if it would mislead. A recreation labelled "approximation" is fine; one passed off as accurate is a trap.

#### Match the source's real frame — height included, in both directions

A mockup's height should match what it actually represents — don't fake it taller *or* shorter than the real thing. There are two distinct cases, and the failure mode is using the wrong one:

**Mocking a component** (a card, modal, row, toolbar, button, an embedded section): size it to its **content**. Do NOT slap `min-height: 560px` / `height: 100vh` on a component to make it "feel desktop-y" — that injects dead whitespace and floats the content unnaturally. If the real component is 320 px tall, the mock is 320 px tall.

**Mocking a full desktop screen / page** (the whole viewport — a login screen, a dashboard, a settings page): give it **realistic desktop viewport proportions**, because the surrounding space *is* part of how that screen looks. A login form genuinely sits in a ~720–800 px-tall viewport with the panel centred — cropping that down to just the form's content height misrepresents it as much as over-padding a component does. Use **`min-height`** for the floor (e.g. `min-height: 760px` or a 16:10 box) — **never a fixed `height`**, which clips anything taller — and lay the content out inside it the way the real screen does (centred form, top nav, sidebar full-height, etc.). This mirrors the wrapper's own `.window.desktop`, which is `min-height: 900px`, not `height`.

**Within a full-screen mockup, size the SHELL to content — never pin an inner rail/sidebar to the viewport.** A common miss: the screen is a sidebar + main column, and the sidebar (or a hero rail) gets `height: 100vh` / `min-height: 100vh` while the main column is shorter. The rail then paints far past the content, and the iframe's self-measure inherits that dead band — a tall dark strip below the real UI. **Fix:** make the shell a flex row and let the rail **stretch to content** — `display: flex; align-items: stretch` (the default) with **no height on the rail** — so the rail can only ever be as tall as the tallest column. Put any `min-height` floor on the *outer* screen if you want viewport proportions; never on an inner rail. (This was a real bug: a Ledger dashboard mock's dark rail was pinned to `100vh` against short content; the rebuilt version with flex-stretch measured rail-height === main-height exactly, band gone.)

So the rule is **faithful height, not minimal height** — but always expressed as `min-height`, never a fixed `height`:
- Component → content height (no padding to a fake screen size).
- Full screen → real viewport proportions via `min-height` (don't crop to content, but don't cap it with a fixed `height` either).
- Either way, if the source element has a specific height, reproduce it as a `min-height` (a floor that still lets content grow) — per the sizing rule above.
- Vertical-centring inside a tall box is correct *only* when you're mocking a full screen whose real layout centres its content — not as a way to fill a component you've over-sized.
- **Never `height: <px>` + `overflow: hidden` on a content container** — that's the guillotine. See the never-clip rule under Built-in helpers.

The test: cropped the same way, would your mock look like a screenshot of the real thing? Empty bands the real screen doesn't have = over-padded. A desktop screen squashed to a short strip = under-sized.

**For code / terminal blocks, don't hand-roll — use the built-in `.code` / `.terminal` primitive** (see Built-in helpers below). It already locks bg + ink, re-scopes `color: inherit` to children, and ships the verified github-dark token palette. The hand-rolled patterns below are the fallback for *other* locked containers (brand heroes, custom dark callouts) where no primitive fits.

```css
/* Locked-dark container (custom dark callout, brand hero). */
.terminal {
  background: #0f172a;  /* locked dark, ignores host mode */
  color: #e6edf3;       /* MUST set text too */
}
.terminal * { color: inherit; }  /* re-scope so .wrap's light-dark() doesn't leak in */

/* Locked-LIGHT container (white card on the host canvas). Just as common a
 * failure as the dark case: a white `.card` with no `color:` of its own
 * inherits `.wrap`'s light-dark() text → in dark host mode that resolves to
 * light gray → invisible titles on a white card. Commit the same way. */
.card {
  background: #ffffff;  /* locked white, ignores host mode */
  color: #111111;       /* MUST set text too */
  border: 1px solid #e5e5e5;
  border-radius: 12px;
  padding: 24px 32px;
}
.card * { color: inherit; }
```

The rule of thumb: background and text are a pair — commit one, commit the other. The direction (dark or light) doesn't matter; the pairing does.

**Syntax highlighting in locked-bg code blocks needs *every token* verified.** "Bg + text are a pair" extends to every token color you use. The recurring failure: lock a code block to `#0f172a`, then layer syntax tokens where one (usually `property`, `punctuation`, or `comment`) is colored `#2c2c40` or `#3b4252` because it "looked subtle" — against `#0f172a` it's nearly invisible and whole identifiers disappear from the block. Two ways out:

1. **Use a tested theme designed for your bg.** Shiki / Prism / Highlight.js themes like `github-dark`, `vitesse-dark`, `one-dark-pro` for `#0f172a`-ish backgrounds; `github-light`, `vitesse-light` for `#f5f7fa`-ish. The theme's author already verified contrast — don't override individual tokens.
2. **Hand-rolling tokens? Verify each one against the bg, or pick from this verified palette for `#0f172a`:**

```css
.code            { background: #0f172a; color: #e6edf3; }
.code .keyword   { color: #ff7b72; }   /* red-pink:   keywords, control flow */
.code .string    { color: #a5d6ff; }   /* sky:        strings, attribute values */
.code .function  { color: #d2a8ff; }   /* purple:     function names */
.code .property  { color: #79c0ff; }   /* blue:       identifiers, properties, members */
.code .number    { color: #ffa657; }   /* orange:     numbers, constants */
.code .comment   { color: #8b949e; }   /* muted gray: comments — still readable */
.code *          { color: inherit; }   /* default everything else to body color */
```

If you can't articulate why each token color reads against the bg, drop syntax highlighting entirely and use single-color monospace — that always works.

### 5. Visualizations — tangible over abstract

When something can be represented as a real-world object — browser-chrome tab cards with red/yellow/green dots, proportional horizontal timeline bars with marked phases, device frames, code editor windows, terminal windows, merging-pipe shapes for funnels — **do that**, not abstract labeled rectangles with arrows.

**The test:** "Could a bullet list communicate this just as well?" If yes, the visual is decoration not explanation — rebuild it as something tangible or drop it for bullets.

Bad shapes you should never push:
- A coloured rectangle with text inside, captioned with what it represents.
- Five boxes in a row connected by arrows, each box being just a number + title + one-line description.
- "Sequence diagrams" rendered as text labels under horizontal lines.

Good shapes:
- A mock browser window with a real address bar, dots, and the actual UI inside.
- A terminal block with a green dot, a username prompt, and a code session.
- A device frame around a screen mockup.
- Genuine proportional bars / pie / arc when you're showing real ratios.

### 6. Layout patterns that work

- **Hero section** (kicker + lede + deck) at the top, with generous breathing room before the first slide.
- **Each slide**: section number → slide title → deck → then the visual.
- **3-up grids** for "actors" or "options" — never more than 4, and only when each tile is genuinely small (icon + label + one-line description).

### 7. Layout patterns to avoid

- Dense info-graphics packed into a small area.
- Side-by-side text columns (companions are scrolled, not read like newspapers).
- **Side-by-side desktop mockups.** The iframe is ~900 px wide. Two desktop screens in a 2-col grid each get ~430 px, which crushes columns, wraps headings to 3 lines, and turns matrix/table cells unreadable. **Stack vertically** with a clear label above each ("**Now**", "**Proposed**"). Side-by-side is fine only for narrow mobile mockups, small cards, or short text columns that genuinely fit in half-width.
- Tiny captions (sub-13 px).
- Stacked colored badges/pills used as decoration.

---

## Built-in helpers

### Full-bleed mockups mid-presentation

Most mockups appear *inside* an explanation push — prose intro, embedded UI mockup, more prose. The prose should stay in the comfortable reading column, but the mockup should fill the full card width. Wrap just the mockup section in `.full-bleed`:

```html
<p>Here's the proposed auth screen:</p>
<div class="full-bleed">
  <!-- desktop mockup — spans the full card width, escaping the prose max-width -->
</div>
<p>The left panel uses the existing brand assets…</p>
```

`.full-bleed` is injected into every presentation push. Prose is left-aligned and capped at ~880px; `.full-bleed` fills the **content column's full width from the same left edge** — wider than the prose, sharing one left margin down the card. It does *not* bleed to the card's physical edge: the body padding stays as a gutter, so neither the mockup nor the text ever touches the card border.

Two cases, two tools. **The deciding question is NOT "does this push contain a mockup?" — it's "is the WHOLE push one full-bleed app screen, or is it prose + embedded specimen(s)?"** A review card / spec sheet / lookbook page with an eyebrow + heading + paragraphs and one-or-more labelled mockup images is the **second** kind, even though it "contains mockups" — it's a presentation, not an app recreation. Default to leaving `kind` off; reach for `kind:"mockup"` only when the push is *nothing but* the UI.

- **Whole push is a single mockup / app recreation** (a dashboard, a screen — nothing but the UI, edge to edge) → `kind: "mockup"` (or `"app"`) on the push. Strips the *presentation* frame (preset tokens, semantic chips, prose-width caps, body bg/color, the Inter webfont) so the content owns the canvas — but **keeps the structural primitives** (`.window`/`.window.dark`, `.code`/`.terminal`) and a neutral system-sans default font, so `.window` and friends still render in a mockup. To match the real app's typeface, **inject its webfont right in the pushed HTML** — a `<link rel="stylesheet" href="…">` or an `@font-face` block loads fine in the sandbox — then set `font-family` on the content; that wins over the sans default. Because app-fidelity strips the body padding too, a full-bleed app screen must **supply its own page padding** (e.g. a `.page { padding: 48px 40px }` wrapper) or it runs to the card edge.
- **Prose + embedded mockup(s)** (the common case — intro text, then specimen(s), maybe more text) → leave `kind` **off** so the presentation frame stays on, and wrap each specimen in `<div class="full-bleed">`. You get the best of both: prose lands in the ~56ch reading measure with comfortable side padding, while the specimens fill the full content column (up to 1400px) — **wider** than the prose, never narrower. Tagging this `kind:"mockup"` is the bug: app-fidelity strips the prose-width cap **and** the side padding, so your paragraphs run to the card edge unless you hand-pad — which you will forget.

#### When a mockup should own its push — split by role, not by presence

Having a mockup in the response is *not* itself a reason to split it onto its own card. The trigger is the mockup's **role**:

- **Keep it inline** (prose push, `.full-bleed`, optionally `.window`) when the mockup **illustrates the point the prose is making** — a fragment (one row, a button, a chip) or a screen the surrounding text is actively walking through. The reader needs prose → visual → prose continuity; splitting fractures one thought into a pile of cards.
- **Give it its own push** (one card per screen, `kind:"app"`) when:
  - the **screen is the primary artifact** and the prose is just a caption / lead-in;
  - you're **comparing 2+ full screens** — each its own card, so they stack cleanly and export independently;
  - the user will **export or share the screen standalone** — a clean PNG with no prose bleeding above and below.

A mockup gets things on its own push it *can't* get inline: real per-card **app fidelity** (`kind` is per-push, so an inline mockup can never be `kind:"app"`), a **faithful frame height**, and a **clean standalone export**. It's the same full-bleed-vs-`kind:"mockup"` judgment you already make — one level up, at the push boundary.

> **Failure mode (seen in the wild, more than once):** a marketing-kit / lookbook review card — eyebrow, H1, two prose lines, then labelled atom specimens — tagged `kind:"mockup"`. App-fidelity stripped the padding; the author's wrapper had only `padding: 8px 4px`; the prose kissed the card edges. **Fix: drop the `kind`, wrap specimens in `.full-bleed`.** And remember: prose only gets the ~56ch cap when it's a **direct `body` child or inside `div.wrap`** — nest it in a bare `<div>` and the cap silently misses.

### Window chrome for UI mockups

Wrap a mockup in `.window` to give it a macOS window frame — a title bar with the three traffic-light dots and a centred title:

```html
<div class="full-bleed">
  <div class="window desktop" data-title="DVLA Self Service — Login">
    <!-- mockup content fills the window body, below the 40px title bar -->
  </div>
</div>
```

- `data-title` sets the centred title text (omit for a blank bar).
- Add the **`desktop`** class for a full desktop-screen canvas — `min-height: 900px`, the standard 1440×900 (16:10) design canvas — so a screen mockup looks like a real window with viewport breathing room. **Omit `desktop`** for a dialog or small component so the chrome sizes to its content (don't pad a small thing to screen height).

**`.window` is a stable LIGHT canvas — it does not flip with the host theme.** A mockup is a screenshot of an app; it should look the same to every viewer regardless of their OS/viewer mode. So `.window` pins a white surface with dark ink and re-scopes `color: inherit` to children (same locked-surface treatment as `.code`/`.terminal`) — you can use subtle gray-on-white labels inside and they stay legible even when the viewer is in dark mode. For a genuinely **dark-UI** mockup, add the **`dark`** class (`class="window dark"`) — it locks a dark surface + light ink + dark chrome instead. Don't hand-roll a dark `.window` with inline backgrounds.

**Build the mockup fluid, not fixed-width.** Lay the inside out with flex / `%` / `fr` widths, not hardcoded `width: 1440px` columns. The content column caps at a desktop-realistic width, but when the viewer's window is narrower (a "squeezed" screen) a fluid mockup simply **reflows to fit** — no horizontal scroll, nothing clipped, and PNG/PDF export still captures the whole thing. A fixed-pixel-width mockup gets cut off or needs an awkward horizontal scrollbar when squeezed; a fluid one never does. The 1440 is a *max*, not a target.

**`.window` sets `overflow: hidden`** (to clip its own rounded corners) and grows via `min-height`, never a fixed height. So **never put a fixed `height` on `.window` itself, or on an inner "stage" element** — content past that height gets silently guillotined, and because the overflow is on the frame the crop is invisible until you export or scroll. Let it grow.

### Never clip content — `min-height`, never fixed `height`

The width rule above has a vertical twin, and it's the more common footgun: **never pair a fixed `height` with `overflow: hidden` on any container that holds content** — cards, panels, device/browser/phone frames, stages, slideovers, toasts. That combination guillotines anything taller than the height you guessed: buttons slice through text, bullet lists cut off mid-item. Agents reach for a round number (`height: 260px`) to "frame" a mock and lop the bottom off, often unprovoked.

- **Containers size to their content.** Use `min-height` if you need a floor — never a fixed `height` — on anything wrapping real content.
- **`overflow: hidden` is allowed ONLY for genuine cosmetic crops** where clipping *is* the intent: rounded-corner image masks, a decorative bleed. Never on a content region.
- **Decorative frames** (browser chrome, phone bezel, device frame) must grow with their content — give the frame `min-height` and let it expand, or don't constrain height at all.
- **The mental test:** render the tallest card in your head. If any text or button could exceed the container, the container is wrong. When unsure, leave height unset. A mockup exists to show the design *fully* — uniform-looking rectangles are never worth clipped content; let frames be different heights.

### Card height = your content's intrinsic height — never `100vh` on the root

Easel sizes each card to the **rendered height of your HTML**. Give your root real content, or a `min-height` / `height` in **px**, and the card is exactly that tall. There's no `height` knob on `push` and you don't need one — the px you write *is* the height.

The one trap: **`100vh` (or `vh` / `dvh` / `svh`) on the root.** It's the idiomatic way to write a full-screen app shell, but inside easel `vh` resolves against the **push iframe**, which has no real viewport of its own — so a `100vh` root has no meaningful height and would otherwise **collapse to a stub**. Easel auto-detects a viewport-filling root and falls back to the **900px desktop canvas** (the same height as `.window.desktop`), so it no longer silently crops — but don't lean on that guess:

- **Full desktop screen** → set `min-height: 900px` (or the source's real height) explicitly. Same advice as the sizing section above.
- **Component** → size to content; don't reach for `100vh` at all.

`px`/`min-height` in, predictable card out. `vh` is the only unit that doesn't mean what you think here.

### Code & terminal blocks

Reach for the built-in **`.code`** (alias **`.terminal`**) class instead of hand-rolling a dark code container — that hand-roll is the single most recurring failure (custom `background:#0f172a` div + base text inheriting `.wrap`'s `light-dark(#111,…)` → invisible in light host mode). The primitive locks bg + ink, re-scopes `color: inherit` to children, and ships the verified github-dark token palette so syntax highlighting reads against `#0f172a` with no per-token tuning:

```html
<div class="code">
  <span class="kw">gcloud</span> services enable run.googleapis.com
  <span class="comment"># dvla artifact registry</span>
  <span class="prop">--location=</span><span class="string">europe-west1</span>
</div>
```

Token classes: `.kw` (keywords) · `.string` · `.fn` (functions) · `.prop` (identifiers/properties) · `.num` · `.comment` · `.muted` · `.accent`. Plain `<pre>`/`<code>` are already safe too (bg + ink token pair). Only hand-roll a custom dark container when neither fits — and then obey the locked-mode pairing rule above.

**Reserved names — `code` / `terminal` / `window` are easel primitives.** They paint a locked dark background, so reusing them as your *own* class (`<td class="code">`, `<span class="window">`) inherits that dark fill unintentionally. Two protections: (1) the primitive ink is now locked with `!important`, so a collision renders *readable* dark-on-light instead of invisible dark-on-dark; (2) the viewer logs a console warning when a reserved name lands on an inline/table element. Still — for your own inline code or boxes use a different name (e.g. `mono`, or a plain `<code>` with your styling). The canonical primitive forms are the namespaced **`.easel-code` / `.easel-terminal` / `.easel-window`** (or `[data-easel="code|terminal|window"]`); bare names remain as deprecated aliases.

### Semantic chips

```html
<span class="chip bug">BUG</span>      <!-- red, soft glow -->
<span class="chip ux">UX</span>        <!-- blue -->
<span class="chip polish">POLISH</span><!-- violet -->
<span class="chip ok">OK</span>        <!-- green -->
<span class="chip info">INFO</span>    <!-- cyan -->
<span class="chip accent">FOCUS</span> <!-- the active preset's accent -->
```

All include a soft outer glow tuned for the host preset/mode.

### Design tokens

Use these on every property where you'd reach for a hex code — they adapt to whichever preset / theme the user picked:

| Token | What it's for |
|---|---|
| `--ds-bg` | page canvas |
| `--ds-bg-elev` | one step up from canvas |
| `--ds-surface` | card surface |
| `--ds-surface-soft` | recessed surface (rows, code chips) |
| `--ds-ink` | primary text |
| `--ds-ink-soft` | secondary text |
| `--ds-muted` | tertiary / labels |
| `--ds-line` | default border |
| `--ds-line-soft` | subtle border |
| `--ds-accent` | single highlight color |
| `--ds-accent-soft` | accent background |
| `--ds-accent-ink` | text on accent fill |
| `--ds-code-bg` / `--ds-code-ink` | code block bg/text |
| `--ds-shadow-md` | layered shadow |

Default to tokens. Reach for `light-dark()` only when the design needs a value the tokens don't cover.

### Session names

By default sessions show as the cwd basename — `dvla`, `harmony-platform`. With multiple tabs open that's not enough to tell them apart.

**Hard convention: every chat must call `label` no later than its first `push` call.** If the chat ends without a label, the session is unfindable in the switcher.

Practical rule:
1. As soon as the user describes what they want (first non-trivial message), call `label`.
2. If you forgot to and you're about to call `push` for the first time, call `label` first.
3. Re-call when the work's theme shifts meaningfully (started on a bug, now moved on to a refactor).
4. Pass `""` to clear back to cwd basename.

```
label({ label: "Roadworthy 401 investigation" })
label({ label: "Roadworthy 401 — fixed, ready to PR" })
label({ label: "" })   # clear back to cwd basename
```

Format: 1–8 words, sentence case, no trailing punctuation. Mention the **artefact** (file/feature/bug) — not the verb. Good: `RegistrationNumberInput extraction`. Bad: `Extracting RegistrationNumberInput`.

### Presets

`paper` (warm pitstop-style, amber accent — default) · `aurora` (deep canvas + violet/blue glow halos) · `slate` (cool neutral, cyan accent). Two themes (`light`, `dark`) and two densities (`carded`, `flat`).

When the user asks to change the look ("more glowy", "warmer", "flat", "back to dark"):

```
config({ preset: "aurora" })
config({ theme: "light" })
config({ density: "flat" })
config({ preset: "paper", theme: "dark", density: "carded" })
```

---

## Failure mode

If `push` errors with a missing session id, the SessionStart hook hasn't fired for this session yet. Mention it once in the terminal (`easel unavailable — continuing without it`) and proceed. Do not retry every push.

## Misc

- No `<script>` tags that try to mutate the parent window — the sandbox blocks it anyway. Self-contained `<style>` is fine.
- Pushed HTML is sandboxed with `allow-scripts`. `<base target="_blank">` is set so links open in a new tab.
- The iframe self-measures its body and tells the parent how tall to render it. You don't need to set heights.

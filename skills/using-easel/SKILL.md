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
  /* Scope inheritance so the wrapper's text color reaches every child */
  .wrap *, .wrap h1, .wrap h2, .wrap p, .wrap li, .wrap span,
  .wrap div, .wrap b, .wrap em { color: inherit; }

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

**Locked-mode containers must lock their own text color too.** Any container that paints a *fixed*, non-adaptive background — a terminal/code block locked to dark, an always-dark callout, a hero filled with a brand color — MUST also set its own text color AND re-scope `color: inherit` to its children. Otherwise it inherits `.wrap`'s `light-dark()` and the text flips to the wrong shade for that container's background in one of the two modes.

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
  .wrap *, .wrap h1, .wrap h2, .wrap p, .wrap li, .wrap span,
  .wrap div, .wrap b, .wrap em { color: inherit; }

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

```css
/* Locked-dark container (terminal, dark code block, dark callout). */
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

`.full-bleed` is injected into every presentation push. It breaks the wrapped element out of the body padding + 1400px prose cap to span the full card width, then everything outside it stays in the reading column. This is the right tool when a mockup is one section of a longer push.

Two cases, two tools:
- **Whole push is a mockup / app recreation** → `kind: "mockup"` (or `"app"`) on the push. Strips the entire presentation frame; content owns the canvas.
- **Mockup embedded in an explanation** → leave the push as-is and wrap the mockup section in `<div class="full-bleed">`.

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

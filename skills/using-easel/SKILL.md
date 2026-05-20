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

```css
.terminal {
  background: #0f172a;  /* locked dark, ignores host mode */
  color: #e6edf3;       /* MUST set text too */
}
.terminal * { color: inherit; }  /* re-scope so .wrap's light-dark() doesn't leak in */
```

The rule of thumb: background and text are a pair — commit one, commit the other.

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

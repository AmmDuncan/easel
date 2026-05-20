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

The triggers are **content-shape**, not user-phrasing. If the answer would be a wall of text or a visual, push it — regardless of whether the user said "show me" or "easel" or "display".

## When NOT to push (stay terminal)

- 1–2 lines.
- Clarifying questions or yes/no acknowledgements.
- A single short code block the user is about to copy.
- Direct answers to "what's the value of X" style queries.

## Tools

- **`push({ html, title?, kind? })`** — appends a card. `html` is required; the wrapper sandboxes it in an iframe and injects a baseline design system. `title` is shown in the card header. `kind` is a freeform tag for the chip (`mockup`, `diff`, `explanation`, `comparison`, `diagram`, `progress`, `status`, etc.).
- **`open()`** — force-open a fresh browser tab for this session. Call when the user asks for a new window or to re-open a closed tab.
- **`config({ preset?, theme?, density? })`** — switch palette, mode, or layout live across every open tab. Presets: `paper` | `aurora` | `slate`. Themes: `light` | `dark`. Density: `carded` | `flat`.
- **`label({ label })`** — name the current session ("Roadworthy 401 fix"). Call early once you know the task focus; re-call when the theme shifts. Pass `""` to clear.

Reply in chat with **one line**: `pushed to easel ↗ — #N`. Do not restate the content.

## Style

Matches global Rule 30 in `~/.claude/CLAUDE.md`. Two surface-specific rules that bite if you forget them:

### 1. Let the tool own the canvas — and adapt EVERYTHING else to the host's color scheme

The host iframe applies its own canvas color and adapts to the user's light/dark mode preference. **Do not** set `background` on `body` or your top-level wrapper — it fights the host and creates a visible block of the wrong shade when the user is in the opposite mode.

But because the tool owns the canvas, **text color and card backgrounds must also respond to light/dark mode** — you can't just hardcode `color: #111` or your whole push goes invisible the moment the host frame is in dark mode (this has bitten us — black text on a dark canvas).

Use CSS `light-dark()` to swap. The iframe inherits the user's system scheme via `color-scheme`:

```html
<style>
  :root { color-scheme: light dark; }
  .wrap {
    color: light-dark(#111, #e5e7eb);
    padding: 56px 40px 96px;
    font-family: -apple-system, 'Inter', system-ui, sans-serif;
  }
  .wrap *, .wrap h1, .wrap h2, .wrap p, .wrap li, .wrap span, .wrap div, .wrap b, .wrap em { color: inherit; }
  .card {
    background: light-dark(#fff, #111827);
    border: 1px solid light-dark(#e5e5e5, #1f2937);
    border-radius: 12px;
    padding: 24px;
  }
  .badge { background: light-dark(#f0fdf4, #052e16); color: light-dark(#028043, #6ee7b7); }
</style>
<div class="wrap">…</div>
```

If you want a particular mode's *feel* regardless of host (e.g. always-dark for a code-heavy push), then OWN the canvas too — `background: #0b0f17; color: #e5e7eb;` on `.wrap` — and commit fully to dark. That's the superpowers-companion pattern, not the easel pattern.

**Locked-mode containers must set their own text color (inverse rule).** Any container that paints a *fixed*, non-adaptive background — a terminal/code block locked to dark, an always-dark callout, a hero filled with a brand color — MUST also set its own text color AND re-scope `color: inherit` to its children:

```css
.terminal {
  background: #0f172a;  /* locked dark, ignores host mode */
  color: #e6edf3;       /* MUST set text too */
}
.terminal * { color: inherit; }  /* re-scope so .wrap's light-dark() doesn't leak in */
```

### 2. Stack desktop mockups vertically — don't squeeze them side-by-side

The iframe is roughly 900 px wide. Two desktop-screen mockups in a 2-col grid each get ~430 px, which crushes column widths, wraps headings to 3 lines, and turns matrix/table cells unreadable. Stack vertically with a clear label above each ("**Now**", "**Proposed**") so each mock gets full width — the whole point of mocking a desktop view is to show it at desktop proportions. Side-by-side is fine only for narrow mobile-screen mockups, small cards, or short text columns that genuinely fit in half-width without distortion.

### 3. Semantic chip palette (built in)

The wrapper injects a `.chip` class with light + dark variants for the common semantic kinds. Use them instead of inventing colors:

```html
<span class="chip bug">BUG</span>      <!-- red, soft glow -->
<span class="chip ux">UX</span>        <!-- blue -->
<span class="chip polish">POLISH</span><!-- violet -->
<span class="chip ok">OK</span>        <!-- green -->
<span class="chip info">INFO</span>    <!-- cyan -->
<span class="chip accent">FOCUS</span> <!-- whatever preset's accent is -->
```

All chips include a soft outer glow that sits cleanly on dark canvases.

### 4. Tokens you can reach for

The wrapper exposes the same tokens the parent viewer uses. They adapt to whichever preset / mode is active:

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

Default to these and `.chip`. Reach for `light-dark()` only when the design needs a value the tokens don't cover.

### 5. Name the session so it's findable

By default sessions show as the cwd basename in the switcher and index — e.g. `dvla`, `harmony-platform`. With multiple tabs that's not enough to tell them apart. Use the `label` tool to give the session a short, human name and update it when the theme shifts:

```
label({ label: "Roadworthy 401 investigation" })
label({ label: "Roadworthy 401 — fixed, ready to PR" })
label({ label: "" })   # clear back to cwd basename
```

When to set: as soon as the user describes what they want to work on, and again when the goal changes meaningfully. Don't update on every micro-action — labels are for navigation.

Format: 1–8 words, sentence case, no trailing punctuation. Mention the artefact (file/feature/bug), not the verb.

### 6. Presets — three flavors the user can switch between

`paper` (warm pitstop-style, amber accent — default) · `aurora` (deep canvas + violet/blue glow halos) · `slate` (cool neutral, cyan accent). Two themes (`light`, `dark`) and two densities (`carded`, `flat`).

If the user asks to change look ("more glowy", "warmer", "flat", "back to dark"):

```
config({ preset: "aurora" })
config({ theme: "light" })
config({ density: "flat" })
config({ preset: "paper", theme: "dark", density: "carded" })
```

### 7. Other style rules (from Rule 30)

- Typography: 32 px+ section titles, 18–22 px body, 14 px uppercase eyebrows. Inter / system sans.
- Whitespace: 32–48 px card padding, 64+ px between sections. Companions are presentations, not dashboards.
- One accent colour, at most 3–4 instances per push.
- Visualisations are tangible (browser chrome, terminal windows, code editor frames, real device frames) — not abstract labeled rectangles connected by arrows. If a bullet list would communicate the same thing, rebuild the visual.
- No `<script>` tags that try to mutate the parent window — the sandbox blocks it anyway. Self-contained `<style>` is fine.

## Failure mode

If `push` errors with a missing session id, the SessionStart hook hasn't fired for this session yet. Mention it once in the terminal (`easel unavailable — continuing without it`) and proceed. Do not retry every push.

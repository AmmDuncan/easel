# Easel codegen guide

A short starter so an easel push lands at presentation scale on the first try,
instead of being iterated up from a dense, small-font, emoji-laden draft.

**This guide is additive.** The `using-easel` SKILL.md already owns the long
rulebook — the fidelity bar, the type/whitespace/color scales, light/dark +
locked-mode pairing, the injected `--ds-*` tokens, and the `.window` / `.code` /
`.terminal` / `.chip` / `.full-bleed` primitives. Read it for any of that. This
guide adds the **composition** rules the SKILL doesn't make first-class, plus a
copy-paste scaffold (`easel-base.css`) and an icon sprite (`easel-icons.svg`).

> Lineage: the type/space/color floors trace to Lookbook `fundamentals.md`
> (`F`-rules) and the generic-AI tells to `anti-patterns.md` (`AP`). The
> `--ds-*` tokens are easel's `light-dark()` adaptation of Lookbook tokens.

---

## Use the kit

1. Inline the contents of **`easel-base.css`** inside a `<style>` at the top of
   the push.
2. Inline **`easel-icons.svg`** once (a hidden `<symbol>` sprite), then reference
   icons with `<svg class="ic"><use href="#i-git-branch"/></svg>`.
3. Wrap all content in `<div class="wrap">`.

Everything keys off the wrapper's `--ds-*` tokens with literal fallbacks, so the
same file renders correctly **standalone** (for a local render-and-look) and
**inside easel** (where it inherits the user's preset accent + light/dark).

---

## Reserved class names — don't reuse these for your own elements

The wrapper injects **structural primitives** under these class names, and they
paint a **locked background + ink**. If you put one on your own element (a
`<td class="code">`, a `<span class="window">`), it inherits the primitive's
dark fill you didn't ask for:

| Reserved | What it is | If you want it, prefer |
|---|---|---|
| `code`, `terminal` | locked-dark code block | `easel-code` / `easel-terminal` / `[data-easel="code"]` |
| `window` (+ `.dark`, `.desktop`) | macOS window chrome | `easel-window` / `[data-easel="window"]` |
| `chip` (+ `.bug/.ux/.ok/…`) | semantic glow chip | — (use as documented, or your own name) |
| `full-bleed` | escapes the prose measure | — (use as documented) |

**Workaround / rule:** for *your own* inline code, monospace cells, or boxes,
use a different name — the kit ships **`.mono`** for inline code, and you can use
a plain `<code>` element with your own styling. Reach for `code`/`terminal`/
`window` **only** when you actually want that primitive, and prefer the
namespaced `.easel-*` form. (Bare names still work as deprecated aliases, and
the wrapper now locks their ink with `!important` so a collision renders
*readable* dark-on-light instead of invisible — but it's still an unwanted block.
The viewer logs a console warning when a reserved name lands on an inline/table
element.)

The kit's own generic class names (`card`, `thread`, `callout`, `lanes`,
`spine`, `node`) are **not** wrapper primitives, so they don't collide with the
injected CSS — but they *are* generic, so don't also use them as bare names for
unrelated author elements in the same push.

---

## The 5 composition rules

**1. Presentation scale — body ≥ 18px, nothing below 14px.** [F3 / SKILL §1]
Lede 46 · title 32 · h2 22 · body 18–21 · eyebrow/mono 14. The scaffold's type
classes already sit here; don't shrink them to fit more in.

**2. Don't fight the prose measure — go vertical.** [the max-width lesson]
A default (non-`mockup`) push clamps content to a readable column. That clamp
only hurts when you push *horizontal density* into it (a 4-up row, side-by-side
text) — then font size is the only variable left and it collapses. A vertical
flow *wants* a narrow column, so the measure stops being an enemy and the body
type stays large. If you genuinely need full width (a wide table, a real app
screen, a matrix), **escape** the measure with `kind:"mockup"` instead of
shrinking type — see *Picking `kind`*.

**3. Column count is a function of content, not a default.** [AP20 / SKILL §6–7]
- A **sequence** of steps → stack vertically (`.spine` + `.connector`).
- **Parallel siblings** → a grid (`.lanes`, auto-fit), sized so each tile fits
  its content at ≥16px. Two-up is usually the goldilocks for tiles carrying a
  name + one line.
- Never a **4-up row of paragraphs** (crushes type) and never an **all-vertical
  stack of siblings** (monotonous, endless scroll). Ask: *is the relationship
  sequential or parallel, and how much does each item carry?*

**4. A locked-background container sets its OWN text colour — on every node.**
[SKILL §4]
Any container that paints a *fixed* background (`.thread`, a brand hero, a dark
callout) must commit its own `color` and re-scope `color: inherit` to its
children — background and text are a pair: commit one, commit the other. The
scaffold's adoption rule is `:where(.wrap) :where(*)` (zero specificity), so a
single class on your container — `.callout { background:#111; color:#eee }` —
now wins on its own; no `!important` needed. (Earlier the scaffold used the
element-qualified `.wrap div` form at `(0,1,1)`, which outranked a single-class
container colour and silently flipped its text to the canvas ink → invisible
dark-on-dark. That's fixed.) Use the built-in `.thread` / the wrapper's
`.window` / `.code` where they fit — they already lock both.

**5. SVG icons, never emoji; colour must mean something — and never rank equal
siblings.** [AP23 / AP24 / P-AS-01 / F17]
Pull icons from `easel-icons.svg` (`currentColor`, inherits the chip's colour).
Two traps, both AI-slop:
- **Status hues on non-status content.** The `.t-success/-warning/-danger` tones
  are for genuine *status*. Don't paint *categories* (Ignore / Answer / Do /
  Ship) in green/amber/blue — "Do-work = green" means nothing; it's decoration
  in a semantics costume. If a real split exists (e.g. *no-work* vs *work*),
  colour THAT — neutral for one group, the single accent for the other — so
  colour carries information. Otherwise leave them all neutral and let the icon
  differentiate.
- **Emphasising one of N equal siblings.** A coloured left-border / accent fill
  on one tile in a row of peers (the "accent-bordered hero tile" reflex) reads
  as a stuck selection, not hierarchy. Four exits of one decision are equal —
  don't rank them. Only emphasise when something genuinely *is* primary.

---

## Picking `kind`

| Content shape | `kind` | Why |
|---|---|---|
| Explanation · flow · status · comparison-in-prose | *(omit)* | Keeps the presentation frame: prose measure, `--ds-*` tokens, Inter, light/dark canvas. Compose vertically (rule 2). |
| A whole push that is **nothing but** one app/UI screen, edge-to-edge | `"mockup"` / `"app"` | Strips the prose-width cap + body padding + tokens so you own every pixel — then you hand-set font, bg, colours, and supply your own page padding. |

Mixed (prose **and** an embedded wide specimen)? Omit `kind` and wrap just the
specimen in `<div class="full-bleed">` — see SKILL "Full-bleed mockups".

---

## Compose a card — the recipe

1. **Hero** — `.kicker` eyebrow → `.lede` → `.deck` (one tight sentence).
2. **Identify the shape**: is the body a *sequence* (→ `.spine`) or a set of
   *parallel options* (→ `.lanes`)? Most explainers are a short sequence that
   ends in a fork of parallel outcomes (spine → lanes).
3. **Build tangible, not abstract** [SKILL §5]: an incoming message is a
   `.thread`, a guard rail is a `.callout`, a decision is a `.node` with a
   `git-branch` badge — not labeled rectangles with arrows.
4. **Glance test**: would a bullet list say this just as well? If yes, the visual
   is decoration — rebuild it or drop it.

---

## Primitive index (in `easel-base.css`)

| Class | What | Notes |
|---|---|---|
| `.wrap` | canvas | sets text not background; guards inheritance |
| `.kicker` `.lede` `.deck` `.title` `.h2` `.body` `.muted` | type scale | presentation sizes |
| `.mono` | inline code/identifier chip | preset accent on soft surface |
| `.card` / `.node` | surface / surface + icon badge | locked-surface pairing baked in |
| `.spine` + `.connector` | vertical sequence | `.connector.short` for tighter gaps |
| `.lanes` + `.lane` | parallel-sibling grid | auto-fit ≥260px; `.t-*` for state tone |
| `.icchip` | tinted icon chip | drives off `--c` / `--tint` |
| `.callout` | tinted note/guard | `.info` `.success` `.danger`; default amber |
| `.thread` | locked-dark message card | sets its own ink on every node |

For app/UI mockups, code, and chips that the SKILL already ships
(`.window` / `.window.dark`, `.code` / `.terminal`, `.chip`), use those — don't
re-implement them here.

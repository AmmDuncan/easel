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

## The 6 composition rules

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

**6. Diagram the structure — cards carry content, they cannot carry SHAPE.**
[user feedback 2026-07-05: "tired of the arranged cards"]
The default failure this rule exists to kill: every explanation renders as
stacked or gridded cards (`.spine` of `.node`s, `.lanes` of tiles) even when
the thing being explained is inherently *spatial* — a flow that branches and
rejoins, a system with layers, data moving between places, a hierarchy, a
state machine, a timeline, a request/response round trip. Cards cannot show
geometry: direction, branching, convergence, containment, adjacency. When the
**relationship is the message, draw a real diagram** using the kit's `.d-*`
scaffold — see **Drawing scaffold** below for the classes, the arrowhead
`<defs>`, the 1:1 sizing rule, and a worked example. Never hand-roll fills,
strokes, or font sizes in SVG attributes — the classes carry the `--ds-*`
tokens and the type floor.
- **The tell**: your prose says "flows into", "branches", "sits between",
  "wraps", "goes through", "comes back" — and the draft renders none of that
  motion or position. Rebuild as a drawing.
- **Division of labour**: cards remain right for *content units* (a message,
  an option's detail, one step's explanation). The *space between them* —
  what connects to what, what contains what — is the diagram's job. A good
  push often embeds cards **inside** an SVG-drawn structure, not the reverse.
- **Glance test, sharpened**: rule 4 of the recipe asks "would a bullet list
  say this as well?" — for structure, also ask *"does this show anything a
  vertical stack of boxes wouldn't?"* If no, it's cards in a trench coat.

---

## Drawing scaffold (rule 6's classes — in `easel-base.css`)

| Class | On | What |
|---|---|---|
| `.diagram` | wrapper div | width/scaling for the svg inside |
| `.d-box` (+ `.soft`, `.accent`) | `<rect>` | a node; accent = the focal one |
| `.d-region` | `<rect>` | containment — a layer/boundary; dashed, label inside top-left |
| `.d-label` / `.d-sub` | `<text>` | 16px name / 14px mono detail |
| `.d-note` | div in `<foreignObject>` | wrapping prose ≥3 words — SVG `<text>` never wraps |
| `.d-edge` (+ `.accent`, `.dashed`) | `<path>`/`<line>` | connector; dashed = return/async/maybe |
| `fill="context-stroke"` | marker path | arrowhead auto-matches its edge's colour (render-verified); `.d-arrowhead` exists for manual override |

**Three mechanical rules that keep a drawn diagram legible:**

1. **Author at 1:1** — `viewBox="0 0 860 H"` (≈ the card's content width), so one
   unit = one pixel and the 16/14px type classes stay at the floor for real.
   Grow **H**, never shrink type, when content doesn't fit.
2. **Text first, boxes after — budgeted for the REAL font.** Size each
   `<rect>` around its worst-case label: at 14px the kit mono renders as
   **Roboto Mono inside easel (~8.5px/char — wider than local fallbacks)**, so
   budget `chars × 8.5 + 2×24px inset` minimum, and verify against the widest
   line, not the average. A sub that lands within ~20px of a box edge is a
   defect (proven live: a sub that cleared a local render sat flush in easel).
   When text approaches the edge, SHORTEN THE TEXT — never shrink it, never
   let it kiss the border. Anything that wants to be a sentence goes in a
   `<foreignObject>` + `.d-note`, which wraps.
3. **Arrows meet edges.** Start/end edge paths ON box borders (x = rect edge),
   with `marker-end` for direction. Orthogonal elbows (`M.. H.. V..`) read
   better than diagonals when boxes aren't aligned.

Paste once per `<svg>`:

```html
<defs>
  <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7"
    markerHeight="7" orient="auto-start-reverse">
    <path fill="context-stroke" d="M0 0 L10 5 L0 10 z"/>
  </marker>
</defs>
```

**Worked example — a submit flow with a branch** (the shape rule 6 exists for):

```html
<div class="diagram"><svg viewBox="0 0 860 240" xmlns="http://www.w3.org/2000/svg">
  <defs>… the #ah marker above …</defs>
  <rect class="d-box" x="10" y="90" width="180" height="60" rx="10"/>
  <text class="d-label" x="100" y="116" text-anchor="middle">TransactionForm</text>
  <text class="d-sub"   x="100" y="136" text-anchor="middle">onSubmit()</text>

  <path class="d-edge" d="M190 120 H290" marker-end="url(#ah)"/>

  <rect class="d-box" x="290" y="90" width="200" height="60" rx="10"/>
  <text class="d-label" x="390" y="116" text-anchor="middle">createTransaction</text>
  <text class="d-sub"   x="390" y="136" text-anchor="middle">services/index.ts</text>

  <!-- branch: success up, error down — the fork cards can't draw -->
  <path class="d-edge accent" d="M490 105 H560 V60 H620" marker-end="url(#ah)"/>
  <path class="d-edge dashed" d="M490 135 H560 V180 H620" marker-end="url(#ah)"/>

  <rect class="d-box accent" x="620" y="30"  width="220" height="60" rx="10"/>
  <text class="d-label" x="730" y="56"  text-anchor="middle">cache invalidated</text>
  <text class="d-sub"   x="730" y="76"  text-anchor="middle">transactionQueryKeys.all</text>
  <rect class="d-box soft" x="620" y="150" width="220" height="60" rx="10"/>
  <text class="d-label" x="730" y="176" text-anchor="middle">toast + field errors</text>
  <text class="d-sub"   x="730" y="196" text-anchor="middle">onError → mapZodIssues</text>
</svg></div>
```

**Orientation follows depth — width is fixed, height is free.** The card is
~860px wide and infinitely tall, so the layout axis is chosen by the
structure's long dimension:
- **≤4 hops / siblings** → horizontal reads naturally (like the example).
- **Deep chain** (5+ hops) → vertical: boxes stack top-down, edges run down
  the left, branches elbow out right. Or serpentine (left→right, drop a row,
  right→left) when steps are short.
- **Deep tree** → vertical trunk with children indented right, file-tree
  style — never a horizontal fan that crushes leaf labels.
- Never shrink boxes or type to force a deep structure sideways; grow H.

Every diagram shape — flow, layers (`.d-region` wrapping boxes), timeline
(one axis + boxes on it), state machine (boxes + labeled edges both ways),
tree (elbows fanning out) — is these same seven parts arranged differently.
The **generic-AI trap is undifferentiated geometry** (five identical boxes in
a featureless row), NOT drawing itself: differentiate the focal node
(`.accent`), the containment (`.d-region`), the path kinds (solid/dashed) —
that's what makes it a diagram instead of decorated boxes.

---

## Charts & data (the `.v-*` primitives — in `easel-base.css`)

Real data gets the same treatment diagrams got in rule 6: primitives, not
hand-rolled fills. For any non-trivial chart (multi-series, time series, a
dashboard of them) also consult the **`dataviz` skill** — its form heuristic
and `anti-patterns.md` apply verbatim; the kit's tokens are its "design
system parameters", already validated.

| Class | What |
|---|---|
| `.v-stat` (`.lb`/`.num`/`.sub`) | stat tile — big tabular number + label + delta |
| `.v-rows` > `.v-row` > `.v-track` > `.v-bar` | horizontal bar list; stacked segments = several `.v-bar`s in one track (2px gap free) |
| `.s1`–`.s4` | series colour, FIXED order (blue teal violet rose) |
| `.v-legend` > `.k` | inline legend chips, sits with the section eyebrow |
| `.v-grid` `.v-axis` `.v-tick` `.v-col` `.v-line` `.v-area` `.v-dot` | drawn SVG charts, authored 1:1 like `.diagram` |
| `.v-spark` | tiny inline sparkline beside a stat |

**Hard rules (from the dataviz method — all checkable):**

1. **Sometimes the answer is not a chart.** One number → `.v-stat`, not a
   one-bar bar chart. A 3-row comparison → figures in a column, maybe bars.
2. **Series colours come ONLY from `--ds-series-1..4`, in fixed order** —
   validated ALL-PAIRS for CVD separation + contrast on both canvases
   (light `#3b6fd8 #2aa08c #54418a #a86a10`, dark restepped, not flipped).
   Slot 4 is amber, not rose: a blue/teal/violet/rose set collapses to two
   colours under deuteranopia (measured s2↔s4 ΔE 1.0). Never a 5th hue:
   fold into "Other" or facet. Never repaint survivors when a filter drops
   a series — colour follows the entity, not its rank.
3. **One y-axis, ever.** Two measures of different scale → two charts or
   index both to a common base. Dual-axis is the #1 chart mistake.
4. **A bar must show something the number beside it can't.** The value sits
   in INK immediately after the track's end (`.v-val`, `<em>` for the
   secondary segment: "1,860 + 420") — never a distant column, and never
   white text INSIDE the bar (fails AA on most series-mode combos, and a
   bar narrower than its label silently truncates the number). Give bars a
   second dimension when the data has one — stacked segments, a threshold
   marker — or drop bars for plain figures.
5. **Text wears ink, never the series colour.** Values, labels, legends in
   ink/ink-soft with a coloured swatch beside them. Numbers in columns get
   `tabular-nums` (the `.v-*` classes already do).
6. **Legend: ≥2 series always, 1 series never** (the title names it). No
   number on every point — label the ends, the max, the anomaly, with
   `.v-label` (ink, 14px) inside the svg.
7. **Rounded corners at the data end only** (the track's last `.v-bar`
   already does this); the baseline edge stays square. Drawn `.v-col`
   columns stay square — an svg rect's `rx` would round the baseline too.
   Status tones stay reserved for status — a series is never "the red
   one" unless it IS bad.

---

## The 5 reading rules — presentation craft, not layout mechanics

The 6 composition rules make a card *look* right; these make it *read* right.
A card is a presentation someone scrolls once, top to bottom — treat it like
a talk, not a reference page.

**R1. The point first — lede states the conclusion, not the topic.**
"Worktrees now resolve their own config" beats "Config resolution changes".
Order the whole card as an inverted pyramid: answer → how → detail → footnotes.
A reader who stops at ANY scroll depth should leave with the truth, just less
of it. Never make the reader scroll to find out why they're reading.

**R2. One idea per section, a signpost every screenful.**
Chunk with numbered section eyebrows (`01 · What changed`) so a scanner can
navigate by waypoints. No section carries more than ~5 items — at 6+, group
them and present the groups. If two sections say the same kind of thing,
they're one section.

**R3. Annotate, don't narrate.**
Put the explanation ON the thing: a caption under the diagram, a label on the
edge, a one-line note beside the box — not a paragraph above that describes
what the reader is about to see. Prefer direct labels over legends (a legend
is a lookup table; use one only when 3+ encodings repeat). If you're writing
"as shown below…", delete the sentence and label the drawing.

**R4. Text has shapes — respect them.**
Decks and captions: one sentence. Bullets: ≤2 lines, parallel grammar.
Tiles: name + one line, never a paragraph in a box (a paragraph squeezed
into a tile is prose being punished). And the inverse: when prose IS the
content — a rationale, a story — let it be prose in the reading measure;
don't shatter it into fragments across cards.

**R5. One visual grammar per card.**
The same shape must mean the same thing everywhere: if a soft box = "outcome"
in section 2, a soft box in section 4 is also an outcome. Pick the meanings
once (box kinds, edge kinds, the accent, icon set), then repeat them —
repetition of FORM is grammar (good); repetition of CONTENT is padding (bad).
A new style mid-card is a new thing to decode; every decode is a toll on the
reader.

---

## The 5 appearance rules — what makes it beautiful, not just correct

Composition places things, reading rules order them; these decide how the
card *feels*. Distilled from Refactoring UI onto the kit's tokens.

**A1. Hierarchy by de-emphasis — quiet the neighbors, never shout.**
One focal element per screenful. When something doesn't stand out, the fix is
softening everything around it (ink-soft, lighter weight, smaller *presence*)
— not making it bigger/bolder/redder. Secondary text gets a softer COLOR at
the same size, not a smaller size. Labels are the least important thing in a
labeled pair — de-emphasize the label or drop it, never bold it.

**A2. Depth from one light source — and don't box what spacing can group.**
Light comes from above: `.card`'s two-part shadow (sharp small + soft large)
is the elevation; use ONE elevation level per card, elevate only what floats.
Prefer the three background tiers or plain proximity over hairline borders —
an element wearing border + shadow + tint at once is over-dressed; pick one.
Where you do rule things off, hairlines (`--ds-line-soft`) not heavy strokes.

**A3. Backgrounds come in tiers — group with them.**
Canvas < `--ds-surface-soft` < `--ds-surface` is a deliberate ladder: a soft
wash groups related content without drawing a box around it. One accent-soft
wash (a hero, THE key section) per card, maximum — two washes reads as
wallpaper. Grays carry a hue on purpose; never flat `#808080`-family grays
next to the tokens.

**A4. The accent earns moments; neutrals do the work.**
3–4 accent instances per card, total — the kicker, the focal node's stroke,
the success edge, one `.mono` chip. Everything else neutral, and that
restraint is exactly what makes the accented thing land. No gradients on
surfaces, no second accent hue, and status tones stay reserved for status
(composition rule 5).

**A5. Polish lives in the smallest details.**
The radius scale is 6 / 10 / 14 (chip / tile / card) — never mix radii at one
level. Align numbers in columns (`font-variant-numeric: tabular-nums` for
tables of figures). Icons: one stroke width, optically centered in their
chips. Padding floor: 24px inside cards — cramped beats ugly to the bottom of
every ranking. And empty space stays empty: decorating a quiet corner with a
stat card or an icon is the "fills space with BS" failure — air is a feature.

---

## The 5 color rules — a soothing palette by NUMBERS, not by taste

The `--ds-*` tokens already comply with all of these; the rules exist for
every color chosen BEYOND the tokens (a chart series, a custom wash, a status
variant). They're checkable in HSL, so compliance is arithmetic — any
generator can verify them without having taste. When in doubt: use a token.

**C1. Saturation bands — the calm invariant.**
Canvas + neutrals: **S ≤ 10%**. Secondary surfaces, washes, tints: **S ≤ 30%**.
The accent and status tones: **S 40–60%**. Nothing on a presentation surface
ever exceeds **70%** — high-chroma color is what reads as loud, cheap, and
AI-generated. If a color feels aggressive, drop its S before touching its hue.

**C2. Never the poles.**
No `#ffffff` canvas, no `#000000` ink. Light canvas lives at **L 96–98%** with
a slight hue; ink at **L 8–15%**. Max-contrast pairings are harsh; the calm
range keeps body text at **≥ 4.5:1** (AA, non-negotiable) while avoiding the
glare of pure poles. Soft off-white + near-black reads restful at identical
legibility.

**C3. 60–30–10 by area.**
~60% of the card's area is quiet canvas, ~30% is surface/soft tiers doing the
grouping, ~10% is accent + status combined. This is the AREA version of
appearance rule A4's counting version (3–4 accent moments) — both must hold.
The restraint is the mechanism: the accent is noticed precisely because it's
scarce.

**C4. Grays lean — one temperature per card.**
Every neutral carries a faint hue (**S 2–8%**), never dead `#808080`-family
gray. The lean follows the accent's temperature and stays consistent: cool
accent (teal/blue) → cool-leaning grays (technical, precise); warm accent
(amber/rose) → warm-leaning grays (cozy, premium). Mixing warm surfaces with
cool grays in one card is the subtle wrongness people feel but can't name.

**C5. Dark mode desaturates and lightens — it never inverts.**
A color moving to a dark canvas drops **S by 15–25 points** and raises L —
saturated color on dark vibrates and strains. (This is exactly the pairing
the `light-dark()` fallbacks encode; apply the same transform to any
hand-picked color's dark variant.) Status tones especially: the dark-mode
red/amber/green are the *muted* siblings, not the light-mode values pasted
onto black.

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
2. **Identify the shape**: does the body have *structure* — branching, layers,
   movement, containment? → **draw it** (rule 6, inline SVG). Is it a plain
   *sequence* (→ `.spine`) or *parallel options* (→ `.lanes`)? Check for
   structure FIRST — spine/lanes are the fallback for shapeless content, not
   the default for everything.
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
| `.v-stat` `.v-rows` `.v-legend` `.s1`–`.s4` `.v-grid`… | chart primitives | see **Charts & data**; series colours validated, fixed order |

For app/UI mockups, code, and chips that the SKILL already ships
(`.window` / `.window.dark`, `.code` / `.terminal`, `.chip`), use those — don't
re-implement them here.

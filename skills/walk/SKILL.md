---
name: walk
description: Turn big information (research, a report, a PRD, TRD, project flow or codebase explanation) into a WALK that Ammiel steps through in the easel panel - orient, pick depth, one idea per step with Slower and Why ready, say it back, keep. Use when he says "walk me through", "digest this", or asks for research, a report, or an explanation of a PRD, TRD or flow. Not for short answers (stay in chat) and not for mockups (easel push).
---

# Walk

The job is that he can say it back and act on it after one pass, taken one idea at a time, in 5-10 minutes, resumable. A walk is a guided process, not a document. He reads fast, has ADHD, and runs several projects at once: the four things that cost him time are not knowing where to start, losing focus midway, it not sticking, and juggling projects. Every choice below serves one of those.

## 0. Rulings
- Send with `mcp__easel__walk`. Chat then gets exactly two lines: the one-line answer, and `walk sent: <project> · <title>, N steps`. Never paste the walk's content into chat as well.
- Every claim has a source he can open (file:line at a ref, URL, doc heading). No invented domain facts: an unknown stays an open question in a risk card.
- 12 steps max. Bigger material becomes a series: send the first walk, name the rest in chat.
- Plain words, his vocabulary, short sentences, active voice. A system term appears only if he will meet it, and is explained the first time.
- HTML is rendered in a sandbox with no scripts and `data:` images only (remote images are inlined at send). Never write `<script>`, event handlers or external CSS; they are stripped or ignored.

## 1. Plan (your discipline, not an approval step)
Write these down before any step, then go straight on:
1. **Reader line.** "Ammiel, who knows X, calls it Y, and will probably assume Z."
2. **The one question** this walk answers, and **the answer in 15 words or fewer** (this is Orient's hero line and the end screen's).
3. **One running example** from the source with real numbers or names (one waiver, one invoice of GHS 150, one learner). Every step shows the rule happening to it.
4. **Kind and recipe** (below). **Step list:** one idea per step, each earning one recap line. A step that earns none is cut.
5. **Suggested path:** mark the steps he must not skip `suggested: true`; the rest are optional depth.
6. **Cut list:** true things left out on purpose, and where they go (chat, a follow-up walk).

| Kind | Default step order |
|---|---|
| `prd` | Problem → who uses it (roles) → user stories → in / out of scope → open questions |
| `trd` | Architecture → data flow with the example → decisions (chose / why / rejected) → risks |
| `flow` | Swimlane end to end with the example → where it branches → where it breaks |
| `research` | Answer + confidence → evidence strongest first → what would change the answer |
| `mixed` | What it is → how it works → what's decided → what's open or risky |

## 2. Teacher's pass (ported from explain-video; revise until each holds)
- **Anchor:** step 1 starts from something he already does or owns.
- **Need before tool:** he feels the problem with the example before the fix is named.
- **Next question:** each step answers the question the previous one raises, or the cut list names where it is answered.
- **Break the wrong belief:** the assumption from the reader line gets a step that sets it up and breaks it.
- **Boundary:** one step shows where the idea stops (when not to use it, what it does not do).
- **Transfer:** one check prompt applies the rule to a case the walk never showed.

## 3. Write each step
| Field | Rule |
|---|---|
| `name` | 1-3 words, his words. Shown in the map and progress. |
| `takeaway` | One sentence he could repeat word for word. A claim, not a topic ("Supervisors approve before the ledger write", not "Approval process"). |
| `body_html` | 1-3 short `<p>`. The idea, concrete. |
| `picture_html` | The shape of the data (table below). Required unless the step is pure "why". |
| `example_html` | The running example applied to this step, with its numbers. |
| `slower_html` | The same idea in plainer words, worked through the example step by step. Written in advance: opening it must be instant. |
| `why_html` | Why it matters to him: the consequence, the cost of getting it wrong. |
| `sources` | `{label, ref}`; label is human ("TRD, approval section"), ref is the path/URL/anchor. |

Pick the picture by the shape of the data (kit classes are styled for you):

| The data is | Markup |
|---|---|
| Steps in order | `<ol class="wk-timeline"><li><b>Officer drafts</b><span>fills the waiver form</span></li>...</ol>` |
| Things compared | `<table class="wk-compare">` with `<thead>`; `<tr class="hl">` marks the row that matters; 4 columns max |
| Numbers | `<div class="wk-stats"><div class="wk-stat"><b>GHS 150</b><span>waived</span></div>...</div>` (6 tiles max) |
| A choice, before/after, A vs B | `<div class="wk-decision"><div><small>Chose</small><p>...</p></div><div><small>Rejected</small><p>...</p></div></div>` |
| Requirements, scope | `<ul class="wk-checklist"><li class="on">In scope</li><li>Out of scope</li></ul>` |
| Risks, open questions | `<div class="wk-risk"><b>Owner: Nana</b><p>...</p></div>` one per risk |
| Anything else | Inline `<svg>` drawn for the idea (one stroke weight, `var(--ds-ink)` / `var(--ds-accent)` for the one thing that matters) |

Prose only carries "why". Anything with a shape gets the shape.

Check prompts (up to 3): `{prompt, expected}`. At least one is the transfer case. Recap: up to 5 lines, one per must-keep idea. Actions: what he has to do next, each one concrete.

## 4. Stale check
`node ~/.claude/skills/walk/walk-history.mjs check <walk.json>` fails (STALE) when the picture-shape sequence equals the previous walk's on a different topic. Fix the walk, not the check: pick the shapes the data actually has. After sending: `node ~/.claude/skills/walk/walk-history.mjs add <walk.json>`. History lives in `~/.easel/walk-history.jsonl`.

## 5. Lint
`node ~/.claude/skills/walk/walk-lint.mjs <walk.json>` must print `WALK OK`. It checks the schema and ceilings (12 steps, 12 map items, 3 checks, 5 recap, 20 actions), one-sentence takeaways under 160 characters, a picture on every non-why step, at least one source per step, no `<script>` / `on*=` / remote `<link>`, compare tables of 4 columns or fewer, orient answer of 15 words or fewer, and that every map `stepId` exists.

## 6. Cold read (sources over about 3,000 words)
Dispatch a background Haiku agent with NO context. Give it only Orient (question, answer, map names and takeaways): it must restate the answer. Then give it the steps: it must answer every check prompt and one transfer question you write. It passes when all three match. Fail = rewrite the walk, not the check.

## 7. Send
Write the walk as JSON (scratch dir), lint it, stale-check it, then call `mcp__easel__walk` with its fields. It is stored under the project of your working directory and arrives as a corner toast; he opens it with the hotkey (Ctrl+Option+Space). Then record history (section 4) and write the two chat lines.

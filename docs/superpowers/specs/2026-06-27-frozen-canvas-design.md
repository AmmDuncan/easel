# Easel: Frozen Canvas (agent owns the push, presentations are immutable snapshots)

**Date:** 2026-06-27
**Status:** Approved design, pending implementation plan

## Problem

Today every pushed card is wrapped in `<html data-theme data-preset data-density>` and **live-tracks** the global Easel config. When the user toggles the global theme (topbar button or the `config` MCP tool), a `easel:theme` / `easel:config` postMessage is broadcast into every rendered iframe, which rewrites its `data-theme` attribute live — so **every already-pushed card flips with the global toggle.**

This forces the *adaptive* authoring model now codified in Rule 30 / `SKILL.md`: each push must survive BOTH light and dark, using `light-dark()` for the page surface and re-scoping `color: inherit` everywhere. That model is the source of the recurring failure classes:

- dark-on-dark leaks (hand-rolled dark container + inherited light-mode ink),
- `color: #111` going invisible when the host is in the opposite mode,
- general washout when the host flips a card the author only tested in one mode.

A presentation should behave like a screenshot: it looks the same to everyone, forever, regardless of the viewer's global Easel mode. If an agent is told "present in dark," that card is dark — switching Easel itself to light must not touch it.

## Goal

**A pushed card is an immutable snapshot.** Its full canvas state — theme (light/dark), preset (accent skin), density (carded/flat) — is sealed at push time and never mutated by any later global config change. The agent owns every color inside its canvas; nothing is left to the global switch to flip.

The global toggle / `config` tool still exists and still restyles **Easel's own chrome** (topbar, session switcher, card frame) and sets the **default for future pushes** — it just never reaches back into existing cards.

## Design

### 1. Seal the canvas at push time (client)

In `src/client/viewer.js`:

- `wrapPushedHtml(html, theme, pushId, kind)` already bakes `data-theme`/`data-preset`/`data-density` into the wrapper `<html>` at render time. Keep that — it IS the snapshot. The values written are whatever the global config is **at the moment of render**, which becomes the frozen state.
- **Stop theme/preset/density broadcasts from reaching pushes.** `broadcastConfigToIframes()` currently posts `easel:config` (and the legacy `easel:theme`) to every tracked iframe. Remove the per-iframe broadcast of these three canvas dimensions so a global toggle no longer re-writes any rendered card's attributes.
- Remove (or neuter) the **in-iframe** config listeners that mutate `data-theme`/`data-preset`/`data-density`:
  - the `apply()` listener inside `buildDefaultWrapper`'s bootstrap script (handles `easel:config` + `easel:theme`),
  - the equivalent `a()` listener injected by `injectBridge` for app-fidelity / nested pushes.
  - Keep the **`easel:print`** message path — print is not a canvas mutation and must still work.

Net: once an iframe loads, its `data-theme`/`data-preset`/`data-density` are constants for the life of the card.

### 2. Explicit per-push theme override (MCP)

In `src/mcp.ts`, add an optional `theme` field to the `push` tool `inputSchema`:

```
theme: { type: "string", enum: ["light", "dark"],
  description: "Canvas mode for THIS push. Sealed at push time — never flips with the global toggle. Omit to snapshot the current global theme." }
```

- Forward `theme` on the `/api/push` body alongside `html`/`title`/`kind`.
- Server (`http-server.ts` / push handler) stores it on the push record.
- Client render: if the push record carries a `theme`, `wrapPushedHtml` uses it for the wrapper `data-theme` instead of `currentTheme()`. Absent → snapshot `currentTheme()` (current behavior, now frozen).

`preset`/`density` get **no** per-push param in v1 (YAGNI) — they always snapshot the global value at push time. Only `theme` is agent-declarable, because "present in dark/light" is the explicit instruction agents actually receive. (A `preset`/`density` param can be added later with the same mechanism if a real need appears.)

### 3. Global config tool semantics (docs only, no behavior change needed)

`config` tool's `theme`/`preset`/`density` already write to the config store and SSE-broadcast to tabs. After (1), that broadcast still updates **Easel chrome** and the **default for future pushes**, but no longer the content of existing cards. Update the `config` tool description to say so explicitly ("applies to Easel's own chrome and the default for new pushes; existing cards are frozen snapshots").

### 4. Convention rewrite — "own your canvas" (the larger surface)

This **inverts** the current host-owns-canvas guidance. Update, in lockstep:

- **`~/.claude/CLAUDE.md` Rule 30** — the easel MCP bullet currently says: *leave the canvas background to the tool, don't set `background` on `.wrap`, use `light-dark()` so text adapts.* Replace with: **own your canvas** — pick ONE mode for the push, set `background` + `color` explicitly on `.wrap`, never write `light-dark()` for the page surface. The push is a frozen snapshot; design it for exactly one mode. The "always scope `color: inherit` to descendants" rule stays (still prevents leaks), and the locked-primitive rules (`.code`/`.terminal`/`.window`) are unchanged — the whole surface now simply behaves the way those primitives already do.
- **`src/mcp.ts` push tool description** — currently opens with *"Renders in a sandboxed iframe over a host-controlled canvas that can be LIGHT or DARK… Your HTML MUST adapt to both light and dark modes."* Rewrite: the canvas is sealed at push time to one mode (the `theme` param, or the current global theme); the push does NOT adapt — own your background + ink for the single mode you chose.
- **`skills/using-easel/SKILL.md` + `kit/EASEL-GUIDE.md` + `kit/easel-base.css`** — remove the "must adapt to both modes / use `light-dark()` for surface" guidance; the base CSS `light-dark()` for ink can stay as a *default* (it resolves once against the frozen `color-scheme` and never flips), but the prose should tell authors to commit to one mode and set their own surface. Update the kit's composition rules accordingly.

### 5. Print path

Print CSS (`@media print`) already forces white-paper/dark-ink regardless of theme — unchanged. The only print concern is keeping the `easel:print` postMessage working after we strip the other in-iframe listeners (covered in §1).

## Out of scope (v1)

- Per-push `preset`/`density` params (snapshot-only for now).
- A UI affordance to re-theme an existing card (cards are immutable by design; re-push to change).
- Migration of historical pushes (they re-render under the new rules on next load; no stored-state migration needed).

## Testing

- **Client unit/integration:** a rendered push's `data-theme` is unaffected by a subsequent `applyConfig({theme})` / SSE config event; chrome still flips. Two cards pushed under different global themes coexist (one light, one dark) and neither flips when the global toggles.
- **MCP:** `push` with `theme:'dark'` while global is light → card renders dark and stays dark. `push` with no `theme` → snapshots current global, then frozen.
- **Print:** `easel:print` still triggers `window.print()` inside a card after listener removal.
- **Regression:** existing self-measure size bridge, export/PNG, contrast guard, nested-iframe capture all still function (none depend on the theme broadcast).

## Risks

- **Visual clash:** a frozen-light card sitting inside a dark Easel chrome (and vice-versa). Acceptable — the card is the artifact, the chrome is host UI; this is the same as a light screenshot in a dark image viewer. Note in convention docs so it's expected, not surprising.
- **Convention drift:** docs live in four places (Rule 30, mcp.ts, SKILL.md, kit). They must change together or agents get contradictory guidance. The implementation plan treats the doc rewrite as one atomic task.

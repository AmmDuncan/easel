# easel

A live browser tab for every Claude Code session. Agents push HTML — explanations, mockups, diagrams, diffs, comparisons — to a scrolling feed you keep open in split-screen. No more wall-of-text in the terminal.

```
┌──────────── Claude Code (left) ────────────┐    ┌────── easel (right) ──────────────┐
│                                            │    │  s/<session-id>  •  3 pushes • live│
│  > walk me through the new auth flow       │    │  ───────────────────────────────── │
│                                            │    │  #1  Auth flow overview            │
│  pushed to display ↗ — #1                  │    │  ┌────────────────────────────────┐│
│                                            │    │  │  Three actors talk to each…    ││
│  > what could break?                       │    │  └────────────────────────────────┘│
│                                            │    │                                    │
│  pushed to display ↗ — #2                  │    │  #2  Failure modes                 │
└────────────────────────────────────────────┘    └────────────────────────────────────┘
```

## Why

Long markdown explanations bury what the agent is actually doing. Visual content (mockups, comparisons, diagrams) is even worse in a TTY. `easel` gives each chat session its own browser tab, and a single MCP tool — `display_push` — that the agent uses proactively. The terminal stays as a conversation log; the browser carries the substance.

## Install

Requires Node 20+, `jq`, `git`, and Claude Code.

```bash
curl -fsSL https://raw.githubusercontent.com/AmmDuncan/easel/main/scripts/install.sh | bash
```

The installer clones to `~/.local/share/easel` (override with `EASEL_DIR=…`), runs `npm install && npm run build`, then registers the MCP at user scope and adds two `SessionStart` hooks (session-id capture + auto-open tab). Idempotent — safe to re-run to update.

Restart Claude Code afterwards.

### Manual install

```bash
git clone https://github.com/AmmDuncan/easel.git ~/work/tools/easel
cd ~/work/tools/easel
npm install && npm run build
bin/easel setup
```

## Tools the agent gets

| Tool | What it does |
|---|---|
| `display_push({ html, title?, kind? })` | Append an HTML card to this session's scrolling feed |
| `display_open()` | Force-open a fresh browser tab for the current session |
| `display_config({ preset?, theme?, density? })` | Switch palette / mode / layout live across every tab |
| `display_label({ label })` | Name the session so it's findable in the switcher |

## Theming

- **Presets**: `paper` (warm pitstop-style, amber accent — default), `aurora` (deep canvas + violet glow halos), `slate` (cool neutral, cyan accent)
- **Themes**: light / dark, with sun-moon toggle in the topbar
- **Density**: `carded` (bordered cards) or `flat` (no chrome, whitespace separates pushes)
- Three swatches + density toggle live in the topbar; config persists in `~/.claude-display/config.json` and SSE-broadcasts across all open tabs

## Sessions

- Each Claude Code session gets its own URL: `localhost:7878/s/<session-id>`
- Session IDs come from Claude Code itself (via the pitstop-style SessionStart hook)
- Sessions auto-rename to `cwd-basename` by default; you can rename them via the click-to-edit label in the topbar, or the agent can via `display_label`
- Idle sessions (>24h since last push) are GC'd every 10 minutes
- Up to 50 pushes per session; oldest evicted from disk first
- Per-push delete (trash icon on each card) + per-session delete (hover any row in the switcher or index)

## Tool surface

The MCP exposes one server (`display`) with four tools. HTML is rendered in a sandboxed iframe (`sandbox="allow-scripts"`) with a baseline design system injected — off-white / charcoal, Inter, presentation-scale typography — so plain `<h1>/<h2>/<p>` markup looks right without extra CSS. Authors can also write a full `<!DOCTYPE html>` document and take ownership of styling.

Inside pushed HTML, semantic chips are available out of the box:

```html
<span class="chip bug">BUG</span>
<span class="chip ux">UX</span>
<span class="chip polish">POLISH</span>
<span class="chip ok">OK</span>
<span class="chip info">INFO</span>
<span class="chip accent">FOCUS</span>
```

Each is themed for both light and dark with a soft outer glow.

## Files

```
src/
  mcp.ts              stdio MCP — exposes display_push / display_open / display_config / display_label
  http-server.ts      express + SSE + static client + sweeper
  http-entry.ts       process entry for the HTTP server
  server-manager.ts   lockfile + spawn coordination
  session-store.ts    disk persistence + retention sweep
  session-id.ts       3-tier resolver (env / hook file / transcript scan)
  config-store.ts     preset / theme / density persistence
  paths.ts            shared constants
  cli.ts              `easel open|url|setup|config|server|version`
  client/
    viewer.html       single-session feed
    index.html        sessions index page
    viewer.css        viewer + index styles
    viewer.js         feed wiring + SSE + theming
    index.css         index styles + preset/density picker
    index.js          index page client
scripts/
  easel-session-id.sh   SessionStart hook
  install.sh            one-shot installer
  copy-client.mjs       build-time copy of client assets
bin/
  easel                 shebang → dist/cli.js
```

## Author

Built by Claude Code with @ammielyawson, across a series of focused chat sessions. Session-id resolution lifted from [pitstop](https://github.com/AmmDuncan/pitstop) — thanks.

## Licence

MIT.

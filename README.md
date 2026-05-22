# easel

A live browser tab for every AI coding session. Agents push HTML — explanations, mockups, diagrams, diffs, comparisons — to a scrolling feed you keep open in split-screen. No more wall-of-text in the terminal.

```
┌──────────── agent (left) ──────────────────┐    ┌────── easel (right) ──────────────┐
│                                            │    │  s/<session-id>  •  3 pushes • live│
│  > walk me through the new auth flow       │    │  ───────────────────────────────── │
│                                            │    │  #1  Auth flow overview            │
│  pushed to easel ↗ — #1                    │    │  ┌────────────────────────────────┐│
│                                            │    │  │  Three actors talk to each…    ││
│  > what could break?                       │    │  └────────────────────────────────┘│
│                                            │    │                                    │
│  pushed to easel ↗ — #2                    │    │  #2  Failure modes                 │
└────────────────────────────────────────────┘    └────────────────────────────────────┘
```

Works with **Claude Code**, **Cursor**, **Claude Desktop**, **Windsurf**, and any other MCP-speaking client.

## Why

Long markdown explanations bury what the agent is actually doing. Visual content (mockups, comparisons, diagrams) is even worse in a TTY. easel gives each chat session its own browser tab, and a single MCP tool — `push` — that the agent uses proactively. The terminal stays as a conversation log; the browser carries the substance.

## Install

Requires Node 20+.

### Claude Code

```bash
npx -y @ammduncan/easel setup
```

That registers the MCP at user scope, installs the `using-easel` skill so the agent knows when to push, and adds the `SessionStart` hooks that resolve session IDs and auto-open the tab. Restart Claude Code and you're done.

### Cursor / Claude Desktop / Windsurf

One command per client:

```bash
npx -y @ammduncan/easel setup --client cursor
npx -y @ammduncan/easel setup --client claude-desktop
npx -y @ammduncan/easel setup --client windsurf
```

Each writes the MCP entry to the client's config file (`~/.cursor/mcp.json`, `~/Library/Application Support/Claude/claude_desktop_config.json`, or `~/.codeium/windsurf/mcp_config.json`). Restart the client to load it.

### Any other MCP client

Drop this snippet into your client's MCP config:

```json
{
  "mcpServers": {
    "easel": {
      "command": "npx",
      "args": ["-y", "@ammduncan/easel"]
    }
  }
}
```

The MCP child mints its own session from its parent process ID — no hook required. Set `EASEL_SESSION_ID` in the client's `env` block if you want to pin a specific session.

### From source (for contributors)

```bash
git clone https://github.com/AmmDuncan/easel.git ~/work/tools/easel
cd ~/work/tools/easel
npm install && npm run build
bin/easel setup
```

## Tools the agent gets

| Tool | What it does |
|---|---|
| `push({ html, title?, kind? })` | Append an HTML card to this session's scrolling feed |
| `open()` | Force-open a fresh browser tab for the current session |
| `config({ preset?, theme?, density? })` | Switch palette / mode / layout live across every tab |
| `label({ label })` | Name the session so it's findable in the switcher |

Agents invoke them as `mcp__easel__push`, `mcp__easel__open`, etc.

## Theming

- **Presets**: `paper` (warm pitstop-style, amber accent — default), `aurora` (deep canvas + violet glow halos), `slate` (cool neutral, cyan accent)
- **Themes**: light / dark, with sun-moon toggle in the topbar
- **Density**: `carded` (bordered cards) or `flat` (no chrome, whitespace separates pushes)
- Three swatches + density toggle live in the topbar; config persists in `~/.easel/config.json` and SSE-broadcasts across all open tabs.

## Sessions

- Each chat session gets its own URL: `localhost:7878/s/<session-id>`
- Session IDs come from the agent client. Claude Code provides them via a SessionStart hook; other MCP clients fall through to a stable PPID-derived id for the MCP child. Override either via the `EASEL_SESSION_ID` env var.
- Sessions auto-rename to `cwd-basename` by default; you can rename them via the click-to-edit label in the topbar, or the agent can via the `label` tool.
- Idle sessions (>24h since last push) are GC'd every 10 minutes.
- Up to 50 pushes per session; oldest evicted from disk first.
- Per-push delete (trash icon on each card) + per-session delete (hover any row in the switcher or index).

## Tool surface

The MCP exposes one server (`easel`) with four tools. HTML is rendered in a sandboxed iframe (`sandbox="allow-scripts"`) with a baseline design system injected — off-white / charcoal, Inter, presentation-scale typography — so plain `<h1>/<h2>/<p>` markup looks right without extra CSS. Authors can also write a full `<!DOCTYPE html>` document and take ownership of styling.

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

## CLI

```
easel open                     ensure server is running, open this session's tab
easel url                      print this session's URL
easel config                   print / set { preset, theme, density }
easel setup                    Claude Code: hooks + MCP + skill
easel setup --client <name>    register the MCP in another client (cursor, claude-desktop, windsurf)
easel restart                  kill + respawn the HTTP server (handy after a build)
easel update                   git pull + build + setup (clone installs only)
easel server                   run the HTTP server in the foreground (debug)
easel version
```

## Files

```
src/
  mcp.ts              stdio MCP — exposes push / open / config / label (as mcp__easel__*)
  http-server.ts      express + SSE + static client + sweeper
  http-entry.ts       process entry for the HTTP server
  server-manager.ts   lockfile + spawn coordination
  session-store.ts    disk persistence + retention sweep
  session-id.ts       5-tier resolver (env / hook file / transcript scan / synthetic PPID)
  config-store.ts     preset / theme / density persistence
  client-setup.ts     per-client config writers (cursor, claude-desktop, windsurf)
  paths.ts            shared constants + legacy-dir migration
  cli.ts              `easel open|url|setup|config|server|restart|update|version`
  client/
    viewer.html       single-session feed
    index.html        sessions index page
    viewer.css        viewer + index styles
    viewer.js         feed wiring + SSE + theming
    index.css         index styles + preset/density picker
    index.js          index page client
scripts/
  easel-session-id.mjs  SessionStart hook (Node, zero deps)
  install.sh            one-shot installer (clone installs)
  copy-client.mjs       build-time copy of client assets
bin/
  easel                 shebang → dist/cli.js
```

## Author

Built by Claude Code with @ammielyawson, across a series of focused chat sessions. Session-id resolution lifted from [pitstop](https://github.com/AmmDuncan/pitstop) — thanks.

## Licence

MIT.

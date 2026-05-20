# claude-display

A live browser tab for every Claude Code session. Agents push HTML — explanations, mockups, diagrams, diffs, comparisons — to a scrolling feed you keep open in split-screen. No more wall-of-text in the terminal.

```
┌──────────── Claude Code (left) ────────────┐    ┌────── claude-display (right) ──────┐
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

Long markdown explanations bury what the agent is actually doing. Visual content (mockups, comparisons, diagrams) is even worse in a TTY. `claude-display` gives each chat session its own browser tab, and a single MCP tool — `display_push` — that the agent uses proactively. The terminal stays as a conversation log; the browser carries the substance.

## How it works

- **One Node process per session**, started by Claude Code as an MCP server (stdio).
- **One shared HTTP server** across sessions, coordinated by a lockfile (`~/.claude-display/server.lock`). First MCP to boot spawns it; subsequent ones reuse it.
- **One scrolling feed per session** at `http://localhost:7878/s/<session-id>`. Pushes append to the bottom; older pushes scroll up; oldest 50 are kept on disk.
- **Live updates over SSE.** When `display_push` is called, the card appears in the tab within ~50ms with no page reload.
- **Session id resolution** lifted from [pitstop](https://github.com/AmmDuncan/pitstop) — a `SessionStart` hook captures Claude's `session_id` from stdin and writes it to a PPID-keyed file the MCP reads on boot. Claude Code does not pass the session id to MCP subprocesses any other way; this is the standard bridge.

## Install

Requires Node 20+, `jq`, `git`, and Claude Code.

```bash
curl -fsSL https://raw.githubusercontent.com/AmmDuncan/claude-display/main/scripts/install.sh | bash
```

The installer clones to `~/.local/share/claude-display` (override with `CLAUDE_DISPLAY_DIR=…`), runs `npm install && npm run build`, then patches `~/.claude/settings.json` with the MCP registration and the two `SessionStart` hooks (session-id capture + auto-open tab). Idempotent — safe to re-run to update.

Restart Claude Code afterwards.

### Manual install

```bash
git clone https://github.com/AmmDuncan/claude-display.git ~/work/tools/claude-display
cd ~/work/tools/claude-display
npm install && npm run build
bin/claude-display setup
```

## Use

1. Open a new Claude Code chat.
2. The `SessionStart` hook opens your session's tab automatically (`http://localhost:7878/s/<id>`).
3. Pin the tab in split-screen on the right.
4. Chat normally. The agent pushes proactively per the global rule + skill it ships with.

To force a push explicitly: ask the agent to "show that on the display" or "push the comparison to the display."

## The tool

The MCP exposes one tool:

```ts
display_push({
  html: string,            // body — sandboxed in a styled iframe
  title?: string,          // shown in the card header
  kind?: string            // freeform tag: mockup, diff, explanation, comparison, diagram, status, ...
}) → { url: string, slide_id: string, index: number }
```

HTML is rendered inside a sandboxed iframe with `sandbox="allow-scripts"`. The wrapper injects a baseline design system (off-white / charcoal, Inter, presentation-scale typography, light + dark themes) so plain `<h1>/<h2>/<p>` looks right without extra CSS. Pushed HTML can also write its own `<style>` for full control.

## Theming

- Light + dark, with system-preference detection and a sun/moon toggle in the topbar.
- Dark is the fallback when there's no preference.
- The viewer broadcasts theme changes to every push iframe via `postMessage`. Pushed HTML can reference `var(--ds-bg)`, `var(--ds-ink)`, `var(--ds-accent)`, etc. and theme for free.
- Light is a warm putty tone (`#ecebe5`), not pure white — easier on the eyes for long viewing.

## Retention

- 50 pushes per session, oldest evicted from disk first.
- Sessions idle longer than 24 hours are swept on the next push.
- All session state lives under `~/.claude-display/sessions/`.

## Files

```
src/
  mcp.ts              stdio MCP — exposes display_push
  http-server.ts      express + SSE + static client
  http-entry.ts       process entry for the HTTP server
  server-manager.ts   lockfile + spawn coordination
  session-store.ts    disk persistence + retention sweep
  session-id.ts       3-tier resolver (env / hook file / transcript scan)
  paths.ts            shared constants
  cli.ts              `claude-display open|url|setup|server|version`
  client/
    viewer.html       feed + topbar
    viewer.css        viewer styles + light/dark tokens
    viewer.js         SSE wiring + theme + iframe message bridge
scripts/
  claude-display-session-id.sh   SessionStart hook
  copy-client.mjs                build-time copy of client assets
bin/
  claude-display                 shebang → dist/cli.js
```

## Author

Built by Claude Code with @ammielyawson, in one session. Session-id resolution lifted from [pitstop](https://github.com/AmmDuncan/pitstop) — thanks.

## Licence

MIT.

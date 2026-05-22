# Changelog

All notable changes to easel. This project adheres to [Semantic Versioning](https://semver.org/).

## 0.2.5 — 2026-05-22

### Added
- **Codex client support: `easel setup --client codex`.** Writes the MCP entry into `~/.codex/config.toml` under `[mcp_servers.easel]` and copies the `using-easel` skill into `~/.codex/skills/using-easel/SKILL.md` so Codex agents have the full style guide in addition to the tool description. Line-based TOML upsert preserves other sections and comments.

### Fixed
- **`easel setup --help` no longer silently runs the destructive Claude Code setup.** Previously, the `--help` flag fell through the `--client` check and reached `cmdSetup()`, which writes to `~/.claude/settings.json`. Now a dedicated help branch fires before any side effects. Includes a manual-install JSON snippet for clients beyond the four officially supported ones.

## 0.2.4 — 2026-05-22

### Fixed
- **Pushes from non-Claude-Code clients (Claude Desktop, Cursor, Windsurf, etc.) ignored the easel style guide.** The full guide lives in the `using-easel` skill — but skills are a Claude Code feature; other MCP clients never see them. The MCP `push` tool's description only said "Pass full HTML" and contained none of the styling rules, so agents in non-CC clients hardcoded one mode's colors. Result: lede text colored `#475569` went invisible in dark mode, hardcoded `#e5e5e5` borders became hard white lines, mockups crammed into half-width columns, etc.
- The `push` tool description now carries the essentials inline: adaptive-color rules (`light-dark()` + `color: inherit` re-scoping + locked-mode container inverse rule), a copy-paste starter pattern, presentation-scale typography, whitespace, tangible-visual heuristics, vertical stacking of desktop mockups, and the proactive-push convention. Every MCP client surfaces tool descriptions to its agent, so this lands cross-client.

## 0.2.3 — 2026-05-22

### Fixed
- **Every push was being delivered twice.** The auto-run guard in `dist/mcp.js` had a sloppy fallback (`endsWith("/dist/mcp.js")`) that matched even when the file was imported, not just when it was invoked directly. Result: when the CLI's no-TTY path dynamically imported `mcp.js`, the guard fired AND the CLI explicitly called `main()`, so two MCP servers ran in the same process attached to the same stdin. Every tool call was processed twice. Guard now uses strict equality only.
- **Sessions index — trash icon overlapped the count/timestamp on short rows.** The hover-revealed delete button was absolutely positioned and collided with the right-column text whenever the row was tight. Promoted to its own grid column so it sits cleanly to the right of the count/when stack regardless of row height.

## 0.2.2 — 2026-05-22

### Fixed
- **MCP servers wired via `npx -y @ammduncan/easel` now boot the MCP server instead of printing CLI help.** When stdin isn't a TTY (i.e. the process is launched over a pipe by an MCP client), the bin transparently boots the MCP server. Interactive terminal use still shows help. Previously, Claude Desktop, Cursor, and Windsurf saw the CLI's help text on stdout and reported `Unexpected token 'e' is not valid JSON` for every line.

### Added
- Explicit `easel mcp` subcommand that runs the stdio MCP server in the foreground (used internally by the no-TTY auto-detection; available as an explicit entry point for clients that want it).

### Changed
- `dist/mcp.js` now exports `main()` and only auto-runs when invoked directly (not when imported), so the CLI can route to it without double-booting.

## 0.2.1 — 2026-05-22

### Added
- `easel setup --client cursor|claude-desktop|windsurf` writes the MCP entry into each client's config file, merging into any existing `mcpServers` map. Sibling top-level keys are preserved. (`src/client-setup.ts`)
- README leads with the npx install; per-client install commands documented; generic JSON snippet for any other MCP-speaking client.
- This `CHANGELOG.md`.

### Notes
- The Claude Code setup path (bare `easel setup`) is unchanged.

## 0.2.0 — 2026-05-22

### Added
- Published to npm as [`@ammduncan/easel`](https://www.npmjs.com/package/@ammduncan/easel). Any MCP client can now install with `npx -y @ammduncan/easel` — no clone, no build.
- `EASEL_SESSION_ID` env var as the highest-priority override for session resolution.
- Synthetic PPID-derived session id as a final fallback when no Claude Code hook fired and no transcript exists — gives Cursor, Claude Desktop, Windsurf, and any other MCP client a stable session per chat with zero setup beyond the MCP entry.
- MCP-side auto-open: non-CC clients have no `SessionStart` hook to open the tab, so the MCP server now opens it on the first tool call when no hook file exists for this PPID. One-shot guard avoids re-opening if the user closes the tab. Claude Code behaviour unchanged.
- `LICENCE` file (MIT).

### Changed
- `resolveClaudeSessionId()` is now total — always returns a string. Dead "no session id" error branches removed from `cli.ts` and `mcp.ts`.
- `package.json` reshaped for npm publishing: scoped name `@ammduncan/easel`, MIT licence, repo/homepage/bugs URLs, keywords for discovery, `engines.node >=20`, `files` whitelist (only bin/dist/scripts/skills/README/LICENCE in the tarball), `prepublishOnly` script, `publishConfig.access=public`.
- Package size: 47 kB tarball, 165 kB unpacked, 3 runtime deps.

## 0.1.0 — internal baseline

The pre-publish baseline. Highlights from the unreleased history:

- Renamed project from `claude-display` to `easel`; data root migrated from `~/.claude-display` to `~/.easel` with one-shot `mv` on first start. Browser localStorage keys (`claude-display:*`) and postMessage events migrated to the `easel:*` namespace with a browser-side migration shim. Internal `__CLAUDE_DISPLAY__` window global renamed to `__EASEL__`. Env vars renamed (`CLAUDE_DISPLAY_PORT` → `EASEL_PORT` with legacy fallback).
- Dropped `jq` as a runtime dependency. Ported `scripts/easel-session-id.sh` to `scripts/easel-session-id.mjs` (Node stdlib only).
- Added `easel restart` command.
- MCP tool names finalised as `push`, `open`, `config`, `label` (invoked as `mcp__easel__*`).
- Skill folder canonicalised at `skills/using-easel/`.

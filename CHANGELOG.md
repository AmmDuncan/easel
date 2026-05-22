# Changelog

All notable changes to easel. This project adheres to [Semantic Versioning](https://semver.org/).

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

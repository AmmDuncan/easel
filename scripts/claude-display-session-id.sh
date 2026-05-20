#!/usr/bin/env bash
# claude-display-session-id.sh — SessionStart hook for Claude Code.
#
# Captures Claude's session_id (passed as JSON on stdin per the hooks spec)
# into ~/.claude-display/hook/cc-session-<ppid>.txt so the MCP adapter can
# resolve it by parent PID (Claude Code itself).
#
# Claude does NOT pass session_id to MCP subprocesses via env or the
# JSON-RPC stream — this hook is the bridge. Lifted from pitstop's trick.

set -uo pipefail

INPUT="$(cat)"
SID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
[ -z "$SID" ] && exit 0

HOOK_DIR="$HOME/.claude-display/hook"
mkdir -p "$HOOK_DIR"
printf '%s\n' "$SID" > "$HOOK_DIR/cc-session-$PPID.txt"
exit 0

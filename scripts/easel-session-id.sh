#!/usr/bin/env bash
# easel-session-id.sh — SessionStart hook for Claude Code.
#
# Does two things:
#   1. Captures Claude's session_id (passed as JSON on stdin per the hooks
#      spec) into ~/.claude-display/hook/cc-session-<ppid>.txt so the easel
#      MCP adapter can resolve it by parent PID.
#   2. Outputs `additionalContext` JSON so the agent always sees the easel
#      conventions at the start of every chat — even when the chat never
#      triggers the using-easel skill via content shape.
#
# Claude does NOT pass session_id to MCP subprocesses via env or the
# JSON-RPC stream — this hook is the bridge. Lifted from pitstop's trick.

set -uo pipefail

INPUT="$(cat)"
SID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)

if [ -n "$SID" ]; then
  HOOK_DIR="$HOME/.claude-display/hook"
  mkdir -p "$HOOK_DIR"
  printf '%s\n' "$SID" > "$HOOK_DIR/cc-session-$PPID.txt"
fi

# Inject a system-reminder so every chat in every project sees the rule —
# not only chats that happen to trigger the using-easel skill description.
read -r -d '' REMINDER <<'EOF' || true
easel is registered as an MCP for this session. Tools available:
mcp__easel__push, mcp__easel__open, mcp__easel__config, mcp__easel__label.

CONVENTION — label every session early.
Call mcp__easel__label({ label: "<short human name>" }) as soon as the
user's intent is clear in this chat, and NO LATER than your first
mcp__easel__push call. Sessions without labels show up as the cwd
basename in the switcher (e.g. "dvla"), which is unfindable when
multiple tabs are open. Re-call label when the work's theme shifts
meaningfully. Format: 1–8 words, sentence case, no trailing punctuation,
mention the artefact not the verb (good: "RegistrationNumberInput
extraction"; bad: "Extracting RegistrationNumberInput").

When pushing visual content (mockup, diagram, comparison, long
explanation, diff, multi-step status), use mcp__easel__push proactively
— do not ask permission. Reply in chat with one line: "pushed to easel
↗ — #N". The full style guide lives in the using-easel skill.
EOF

jq -nc --arg ctx "$REMINDER" \
  '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$ctx}}'

exit 0

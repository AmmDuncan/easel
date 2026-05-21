#!/usr/bin/env bash
# easel-session-id.sh — SessionStart hook for Claude Code.
#
# Does three things:
#   1. Captures Claude's session_id (passed as JSON on stdin per the hooks
#      spec) into ~/.claude-display/hook/cc-session-<ppid>.txt so the easel
#      MCP adapter can resolve it by parent PID.
#   2. Outputs `additionalContext` JSON so the agent always sees the easel
#      conventions at the start of every chat — even when the chat never
#      triggers the using-easel skill via content shape.
#   3. Checks (cached, every 24h) whether the local install is behind
#      origin/main and appends an "updates available — run `easel update`"
#      line to the additionalContext when it is.

set -uo pipefail

INPUT="$(cat)"
SID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)

if [ -n "$SID" ]; then
  HOOK_DIR="$HOME/.claude-display/hook"
  mkdir -p "$HOOK_DIR"
  printf '%s\n' "$SID" > "$HOOK_DIR/cc-session-$PPID.txt"
fi

# --- staleness check (cached) ------------------------------------------------
INSTALL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CACHE_FILE="$HOME/.claude-display/update-check"
NOW=$(date +%s)

LOCAL_SHA=""
REMOTE_SHA=""
if [ -d "$INSTALL_DIR/.git" ]; then
  LOCAL_SHA=$(git -C "$INSTALL_DIR" rev-parse HEAD 2>/dev/null || true)

  LAST_CHECK=0
  if [ -f "$CACHE_FILE" ]; then
    LAST_CHECK=$(awk 'NR==1{print $1+0}' "$CACHE_FILE" 2>/dev/null || echo 0)
    LAST_REMOTE=$(awk 'NR==2{print}' "$CACHE_FILE" 2>/dev/null || true)
  fi
  AGE=$((NOW - LAST_CHECK))

  if [ "$AGE" -gt 86400 ]; then
    # Network check with a tight 2s timeout so SessionStart isn't slow.
    REMOTE_SHA=$(timeout 2 git -C "$INSTALL_DIR" ls-remote origin main 2>/dev/null | awk '{print $1; exit}' || true)
    if [ -n "$REMOTE_SHA" ]; then
      printf '%s\n%s\n' "$NOW" "$REMOTE_SHA" > "$CACHE_FILE"
    fi
  else
    REMOTE_SHA="${LAST_REMOTE:-}"
  fi
fi

UPDATE_LINE=""
if [ -n "$LOCAL_SHA" ] && [ -n "$REMOTE_SHA" ] && [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
  UPDATE_LINE=$'\n\nUPDATE AVAILABLE — local easel is behind origin/main. Run `easel update` to pull, build, and re-wire setup. Mention this to the user once if they bring up easel; otherwise it\'s just FYI.'
fi

# --- additionalContext reminder ---------------------------------------------
read -r -d '' REMINDER <<EOF || true
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
↗ — #N". The full style guide lives in the using-easel skill.${UPDATE_LINE}
EOF

jq -nc --arg ctx "$REMINDER" \
  '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$ctx}}'

exit 0

#!/usr/bin/env bash
# install.sh — one-shot installer for claude-display.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/AmmDuncan/claude-display/main/scripts/install.sh | bash
#   curl -fsSL .../install.sh | CLAUDE_DISPLAY_DIR=~/code/claude-display bash
#
# What it does:
#   1. Checks prerequisites (node 20+, jq, git).
#   2. Clones (or updates) claude-display into ~/.local/share/claude-display.
#   3. Installs npm deps and builds.
#   4. Patches ~/.claude/settings.json (MCP registration + SessionStart hooks).
#   5. Backs up the previous settings.json with a timestamp.
#
# Idempotent — safe to re-run.

set -euo pipefail

REPO_URL="${CLAUDE_DISPLAY_REPO:-https://github.com/AmmDuncan/claude-display.git}"
INSTALL_DIR="${CLAUDE_DISPLAY_DIR:-$HOME/.local/share/claude-display}"
BRANCH="${CLAUDE_DISPLAY_BRANCH:-main}"

c_dim() { printf '\033[2m%s\033[0m' "$1"; }
c_ok()  { printf '\033[32m%s\033[0m' "$1"; }
c_err() { printf '\033[31m%s\033[0m' "$1"; }

step() { echo; echo "$(c_dim "::") $1"; }
ok()   { echo "  $(c_ok ✓) $1"; }
die()  { echo "  $(c_err ✗) $1" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

# --- 1. prereqs ----------------------------------------------------------------
step "Checking prerequisites"
require_cmd git
require_cmd node
require_cmd npm
require_cmd jq

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "node $NODE_MAJOR detected — claude-display needs node 20 or newer"
fi
ok "node $(node --version), npm $(npm --version), jq, git"

# --- 2. clone / pull -----------------------------------------------------------
step "Installing to $INSTALL_DIR"
mkdir -p "$(dirname "$INSTALL_DIR")"
if [ -d "$INSTALL_DIR/.git" ]; then
  git -C "$INSTALL_DIR" fetch --quiet origin "$BRANCH"
  git -C "$INSTALL_DIR" checkout --quiet "$BRANCH"
  git -C "$INSTALL_DIR" pull --quiet --ff-only origin "$BRANCH"
  ok "updated existing clone"
else
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  ok "cloned $REPO_URL"
fi

# --- 3. deps + build -----------------------------------------------------------
step "Installing dependencies and building"
( cd "$INSTALL_DIR" && npm install --silent --no-audit --no-fund )
ok "npm install"
( cd "$INSTALL_DIR" && npm run build --silent )
ok "build"

# --- 4. wire settings ----------------------------------------------------------
step "Wiring Claude Code settings"
"$INSTALL_DIR/bin/claude-display" setup

# --- 5. done -------------------------------------------------------------------
step "All set"
echo "  install dir: $INSTALL_DIR"
echo "  cli:         $INSTALL_DIR/bin/claude-display"
echo
echo "  Restart Claude Code (or open a new chat). The SessionStart hook"
echo "  will open this session's tab automatically."
echo
echo "  Useful commands:"
echo "    $INSTALL_DIR/bin/claude-display url       # print this session's URL"
echo "    $INSTALL_DIR/bin/claude-display open      # ensure server + open tab"
echo "    $INSTALL_DIR/bin/claude-display setup     # re-wire settings.json"

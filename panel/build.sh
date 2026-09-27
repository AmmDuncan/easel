#!/usr/bin/env bash
# Builds EaselPanel.app from panel/EaselPanel.swift with swiftc only (no Xcode).
# Usage: panel/build.sh [out_dir]   (out_dir defaults to $HOME/.easel)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_ROOT="${1:-$HOME/.easel}"
APP_DIR="$OUT_ROOT/EaselPanel.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"

mkdir -p "$MACOS_DIR"

swiftc -O \
  -o "$MACOS_DIR/EaselPanel" \
  "$SCRIPT_DIR/EaselPanel.swift"

cp "$SCRIPT_DIR/Info.plist" "$CONTENTS_DIR/Info.plist"

echo "built: $APP_DIR"

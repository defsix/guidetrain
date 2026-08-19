#!/bin/bash
# Builds the web app (apps/web, two levels up from here — ios/ -> repo root
# -> apps/web) and syncs its output into the WKWebView-hosted asset bundle.
# Runs as an Xcode "Run Script" build phase before every build, so the iOS
# app never ships a stale copy of the site.
set -euo pipefail

# Xcode's Run Script phases use a minimal PATH that often excludes
# Homebrew-installed Node; add the common locations for both Apple
# Silicon and Intel Macs.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm not found on PATH. Install Node.js (e.g. 'brew install node') and re-run." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WWW_DIR="$SCRIPT_DIR/../GuideTrain/Resources/www"

cd "$REPO_ROOT"

if [ ! -d node_modules ]; then
  npm install
fi

npm run build:ios -w apps/web

rm -rf "$WWW_DIR"
mkdir -p "$WWW_DIR"
cp -R apps/web/dist-ios/. "$WWW_DIR/"

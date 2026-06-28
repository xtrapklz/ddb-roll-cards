#!/usr/bin/env bash
# One-command Forge release for Cavril: Core (ddb-roll-cards).
# Bump the "version" in module.json FIRST, then:  ./release.sh "Short title" "Release notes (markdown ok)"
# Verifies main.js → zips (module.json + scripts/main.js) → commits → pushes → cuts the GitHub release the Forge
# manifest reads (download URL is /releases/latest/download/, so no per-version URL to bump). Aborts on any error.
set -euo pipefail
cd "$(dirname "$0")"
title="${1:?usage: ./release.sh <title> <notes>  (bump module.json version first)}"
notes="${2:?need notes}"
repo="xtrapklz/ddb-roll-cards"
ver="$(node -p "require('./module.json').version")"

node --check scripts/main.js || { echo "Aborting — scripts/main.js failed node --check."; exit 1; }

rm -f module.zip
zip -q module.zip module.json scripts/main.js

git add -A
git commit -q -m "$ver — $title

$notes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push -q origin main

gh release create "v$ver" module.zip module.json --title "v$ver — $title" --notes "$notes"

sleep 2
echo "▶ live manifest:"
curl -sL "https://github.com/$repo/releases/latest/download/module.json" | grep '"version"'
echo "✅ v$ver released — on Forge: Bazaar → installed modules → Update → reload world."

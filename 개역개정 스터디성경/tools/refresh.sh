#!/usr/bin/env bash
# Merge written notes into the app, fetch and shrink new pictures, commit.
set -e
cd "$(dirname "$0")/.."
python -I tools/build_content.py | tail -2
[ -f work/place_intros.json ] && cp work/place_intros.json app/data/place_intros.json
[ -f work/era_regions.json ] && cp work/era_regions.json app/data/era_regions.json
python -I tools/build_images.py | tail -1
python tools/optimize_images.py
git add -A
git -c user.name=leesj31233 -c user.email=seungjun.lee@naysor.com commit -q -m "Study notes and pictures update ($(date +%H:%M))

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline | head -1 || echo "nothing new"

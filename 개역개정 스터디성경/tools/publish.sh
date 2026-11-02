#!/usr/bin/env bash
# Builds the publish repository: the committed project inside a "개역개정 스터디성경" folder,
# plus a root vercel.json that serves its app/ as a static site.
# Usage: bash tools/publish.sh [target dir]   (then push the target repo's study-bible branch)
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
DST="${1:-$SRC/../bible-study-publish}"
FOLDER="개역개정 스터디성경"

mkdir -p "$DST"
cd "$DST"
if [ ! -d .git ]; then
  git init -q -b study-bible
  git remote add origin https://github.com/leesj31233/Design-Deck-.git
fi
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
mkdir -p "$FOLDER"
git -C "$SRC" archive HEAD | tar -x -C "$FOLDER"

cat > vercel.json <<'JSON'
{
  "framework": null,
  "installCommand": "",
  "buildCommand": "rm -rf public && cp -r \"개역개정 스터디성경/app\" public",
  "outputDirectory": "public",
  "headers": [
    { "source": "/data/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=3600" }] },
    { "source": "/images/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=604800" }] }
  ]
}
JSON

cat > README.md <<'MD'
# 개역개정 스터디성경

개인 성경 공부용 임시 웹 스터디 성경입니다. 본문은 개역한글(1961, 공개 본문)이고, 원어 해설·지도·인물 카드·형광펜·필기 기능이 있습니다.

- 앱: `개역개정 스터디성경/app` (정적 사이트, 빌드 불필요)
- 데이터 빌드 도구: `개역개정 스터디성경/tools`
- 해설 원고: `개역개정 스터디성경/content`

Vercel: 이 저장소의 `study-bible` 브랜치를 가져오면 루트의 `vercel.json`이 `app` 폴더를 그대로 배포합니다.

코더: 이승준 · lees_j00@naver.com
MD

git add -A
git -c user.name=leesj31233 -c user.email=seungjun.lee@naysor.com commit -q -m "개역개정 스터디성경: $(git -C "$SRC" log -1 --format=%s)" || echo "nothing to commit"
git log --oneline | head -1

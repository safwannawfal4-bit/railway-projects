#!/usr/bin/env bash
# Scaffold a new single-page service from _template/.
# Usage: ./new-page.sh <page-name>
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
name="${1:-}"

if [[ -z "$name" ]]; then
  echo "usage: ./new-page.sh <page-name>" >&2
  exit 64
fi

if [[ ! "$name" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "error: '$name' is not kebab-case (lowercase letters, digits, single dashes)" >&2
  exit 64
fi

dest="$repo_root/$name"
if [[ -e "$dest" ]]; then
  echo "error: $name/ already exists" >&2
  exit 1
fi

cp -R "$repo_root/_template" "$dest"

# Stamp the page name into every placeholder.
for f in index.html package.json railway.json README.md; do
  tmp="$dest/$f.tmp"
  sed "s/PAGE_NAME/$name/g" "$dest/$f" >"$tmp"
  mv "$tmp" "$dest/$f"
done

cat <<EOF
Created $name/

Next:
  1. write the page       -> $name/index.html
  2. verify it locally    -> cd $name && npm start
  3. commit and push
  4. add the Railway service with Root Directory /$name, then generate a domain
     (see AGENTS.md), and record the URL in $name/README.md and README.md
EOF

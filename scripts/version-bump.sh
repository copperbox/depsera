#!/usr/bin/env bash
set -euo pipefail

# npm "version" lifecycle script — updates the version string in the SVG logo.
# Called automatically by `npm version major|minor|patch`.

NEW_VERSION="${npm_package_version:?npm_package_version is not set — run this via npm version}"

SVG="docs/depsera-logo.svg"

if [ ! -f "$SVG" ]; then
  echo "Error: $SVG not found"
  exit 1
fi

sed -i -E "s/v[0-9]+\.[0-9]+\.[0-9]+/v${NEW_VERSION}/g" "$SVG"

git add "$SVG"

echo "Updated $SVG to v${NEW_VERSION}"

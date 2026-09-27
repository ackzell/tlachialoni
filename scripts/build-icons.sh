#!/usr/bin/env bash
#
# Generates resources/icon.icns from the committed master raster
# resources/icon.png (1024x1024, 8-bit RGBA).
#
# macOS ships the tools this needs (sips, iconutil), so there is no build
# dependency. Run from anywhere:  ./scripts/build-icons.sh
#
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/resources/icon.png"
out="$root/resources/icon.icns"

if [[ ! -f "$src" ]]; then
  echo "error: missing icon master: resources/icon.png" >&2
  exit 1
fi

iconset="$(mktemp -d)/icon.iconset"
mkdir -p "$iconset"
trap 'rm -rf "$(dirname "$iconset")"' EXIT

gen() { # <size> <filename>
  sips -z "$1" "$1" "$src" --out "$iconset/$2" >/dev/null
}

# Every size macOS requests, including @2x retina variants.
gen 16   icon_16x16.png
gen 32   icon_16x16@2x.png
gen 32   icon_32x32.png
gen 64   icon_32x32@2x.png
gen 128  icon_128x128.png
gen 256  icon_128x128@2x.png
gen 256  icon_256x256.png
gen 512  icon_256x256@2x.png
gen 512  icon_512x512.png
gen 1024 icon_512x512@2x.png

# Fail loudly rather than ship a bundle with a default/partial icon.
count="$(find "$iconset" -name '*.png' | wc -l | tr -d ' ')"
if [[ "$count" -ne 10 ]]; then
  echo "error: expected 10 iconset images, generated $count" >&2
  exit 1
fi

iconutil -c icns "$iconset" -o "$out"
echo "wrote resources/icon.icns"

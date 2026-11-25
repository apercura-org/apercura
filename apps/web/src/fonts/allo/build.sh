#!/usr/bin/env sh
# Rebuilds the vendored Allo files from the `allo-font` package (SIL OFL 1.1, see OFL.txt;
# no Reserved Font Name, so the subsets keep the name). Needs fontTools with Brotli:
#   python3 -m venv .venv && .venv/bin/pip install fonttools brotli
#   PYTHON=.venv/bin/python sh apps/web/src/fonts/allo/build.sh
#
# Web (WOFF2, fonts.css): the variable font cut down to what the site sets, so the
# preloaded file stays small (54 KB instead of 726 KB):
#   - roundness fixed at 25 (between Sharp and the default Friendly),
#   - optical size fixed at 18 (between Text and Display: body copy and headings share one file),
#   - weight 400 to 700,
#   - latin (preloaded) and latin-ext (loaded only for the names that need it), the
#     subsets and unicode ranges Fontsource uses,
#   - the default layout features plus tabular figures, raised punctuation (case) and
#     the tailed l and serifed I alternates (cv03, cv04) the body copy uses.
# Open Graph (WOFF, src/server/og): static 500 and 600 at the Display optical size, the
# image renderer reads neither WOFF2 nor variable fonts.
set -eu
PYTHON="${PYTHON:-python3}"
here="$(cd "$(dirname "$0")" && pwd)"
source_font="$here/../../../node_modules/allo-font/fonts/webfonts/AlloVariable.woff2"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

latin="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
latin_ext="U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF"
features="tnum,case,cv03,cv04"

subset() { # input unicodes flavor output
	"$PYTHON" -m fontTools.subset "$1" --unicodes="$2" --layout-features+="$features" \
		--flavor="$3" --output-file="$4"
}

"$PYTHON" -m fontTools.varLib.instancer -q "$source_font" ROND=25 opsz=18 wght=400:700 \
	-o "$work/web.ttf"
subset "$work/web.ttf" "$latin" woff2 "$here/allo-latin.woff2"
subset "$work/web.ttf" "$latin_ext" woff2 "$here/allo-latin-ext.woff2"

mkdir -p "$here/og"
for weight in 500 600; do
	"$PYTHON" -m fontTools.varLib.instancer -q --static "$source_font" ROND=25 opsz=32 \
		wght="$weight" -o "$work/og-$weight.ttf"
	subset "$work/og-$weight.ttf" "$latin" woff "$here/og/allo-latin-$weight.woff"
	subset "$work/og-$weight.ttf" "$latin_ext" woff "$here/og/allo-latin-ext-$weight.woff"
done

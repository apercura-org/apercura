# Apercura logo

The symbol is a round tile with one sharp corner: a map pin tipped onto its point, and a
geometric single-storey "a". Its counter is a window holding the point of care, in the accent.
The wordmark is Allo (the site's typeface) at weight 650, outlined, so it never depends on a
font being installed.

| File                                                       | Use                                                   |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| [`apercura-lockup-light.svg`](./apercura-lockup-light.svg) | Symbol and wordmark, on light grounds                 |
| [`apercura-lockup-dark.svg`](./apercura-lockup-dark.svg)   | Symbol and wordmark, on dark grounds                  |
| [`apercura-lockup-mono.svg`](./apercura-lockup-mono.svg)   | One colour (`currentColor`): print, stamps, overlays  |
| [`apercura-symbol-light.svg`](./apercura-symbol-light.svg) | The symbol alone, on light grounds                    |
| [`apercura-symbol-dark.svg`](./apercura-symbol-dark.svg)   | The symbol alone, on dark grounds                     |
| [`apercura-symbol-mono.svg`](./apercura-symbol-mono.svg)   | The symbol alone, one colour                          |
| [`apercura-app-icon.svg`](./apercura-app-icon.svg)         | App and home-screen icon: the symbol on white, padded |

Colours are the design tokens (see [DESIGN.md](../../DESIGN.md)): ink `#191d24` and accent
`#554da0` in light, ink `#eceff2` and accent `#b0aff5` in dark.

## Usage

- **Clear space.** Keep free space of at least a quarter of the symbol's height on every side
  of the symbol or the lockup.
- **Minimum size.** The symbol is drawn on a 64-unit grid, 4 units to a pixel at 16 px: never
  smaller than 16 px high. Below about 24 px, use the symbol alone rather than the lockup.
- **Colours.** Use the light or dark files as they are. Don't recolour them; the only
  recolouring allowed is the mono files, in a single colour.
- **Proportions.** Don't stretch, skew, rotate or outline the logo, add effects, or rearrange
  the symbol and the wordmark.
- **Grounds.** Put the light files on white or the quiet shade, the dark ones on the dark
  ground. On photos or busy grounds, use the app icon or a white tile.

## Source

The geometry lives in [`packages/ui/src/brand/geometry.ts`](../../packages/ui/src/brand/geometry.ts).
The header, the site icons and the Open Graph images are drawn from it, and a unit test keeps
these files (and the favicon, `apps/web/src/app/icon.svg`) equal to its output. To change the
logo, change the geometry and write the files again from its builders.

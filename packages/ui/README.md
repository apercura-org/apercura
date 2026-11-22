# @apercura/ui

Apercura's component library: the "pre-printed health booklet" design system. The visual
rules (palette laws, type roles, components, do's and don'ts) are documented in
[`DESIGN.md`](../../DESIGN.md) at the repository root.

## Entry points

| Import                   | What it holds                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `@apercura/ui`           | Components, recipes, icons, `cn()`                                                                                                   |
| `@apercura/ui/theme.css` | Tailwind CSS v4 `@theme` tokens, base styles and utilities (`caps`, `leader`, `tabular`, `type-*`, `surface-paper`, `surface-shade`) |
| `@apercura/ui/tokens`    | The same tokens in TypeScript (`palette`, `paletteHex`, `mapPalette`, `fonts`, `typeScale`) and the OKLCH / contrast helpers         |
| `@apercura/ui/map-style` | `themeMapStyle()`: re-inks an OpenMapTiles MapLibre style with the palette                                                           |

The app imports the theme after Tailwind and loads the two faces itself:

```css
@import "tailwindcss";
@import "@apercura/ui/theme.css";
@source "../../../../packages/ui/src";
```

Tailwind's default colours, type sizes, radii and shadows are removed on purpose: only the
booklet's tokens exist (`bg-paper`, `text-ink`, `bg-stamp`, `text-body`, `rounded-field`…).

## Components

**React Aria primitives** (client components, `"use client"`): `Button`, `LinkButton`, `Link`,
`TextField`, `SearchField`, `ComboBox`, `Select`, `ListBox`, `Checkbox`, `Switch`,
`RadioGroup`/`Radio`, `DatePicker`, `Calendar`, `TimeField`, `Dialog`, `Sheet`, `Popover`,
`PopoverDialog`, `Menu`, `Tabs`, `ToastRegion` + `toastQueue`, `Tooltip`, `Breadcrumbs`,
`Table`, `Form`, `FieldError`, `OtpField`, and `UIProvider` (React Aria locale and router).

**Server-safe**: `Badge`, `Notice`, `Skeleton`, `SkeletonText`, `EmptyState`, `Seal`, `FieldList`/`FieldRow`,
`PractitionerHeader`, `ActionBlock`, `SiteCard`, `ProvenanceNote`, `BookletSearch`, the icons and
every recipe (`buttonStyles`, `linkStyles`, `fieldStyles`, `tableStyles`, `badgeStyles`…), so
server components can style plain `<a>` and `<table>` elements like the interactive ones.

**Client domain components**: `SlotPicker` (keyboard grid with a moving "now" marker) and
`MapView` (MapLibre GL, loaded lazily when the map nears the viewport).

No component contains user-facing text: every label, hint and announcement is a prop, so the
app passes strings from its next-intl messages.

## Pure helpers

- `sealSpec(rpps)`: deterministic seal parameters from an RPPS number.
- `directionsLinks({ lat, lon })`: key-free directions URLs for OpenStreetMap, Apple and Google.
- `moveFocus`, `nowFraction`, `isBookable` (`domain/slot-grid.ts`): slot picker logic.
- `contrastRatio`, `oklchToHex`, `parseOklch`: colour maths used by the token tests.

## Scripts

```sh
bun run --cwd packages/ui test       # Vitest: seal determinism, tokens, contrast pairs, helpers
bun run --cwd packages/ui typecheck
```

Every component, in every state, is shown in the development-only gallery at `/_ui` of the web
app (it answers 404 in production builds).
